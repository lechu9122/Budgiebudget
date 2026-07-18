#include "OnboardingHandler.h"
#include "HttpUtil.h"
#include <nlohmann/json.hpp>
#include <cmath>
#include <map>
#include <string>
#include <iostream>
#include <exception>

using json = nlohmann::json;

namespace budgie {
namespace {

double roundToCent(double value) {
    return std::round(value * 100.0) / 100.0;
}

double toMonthly(double amount, const std::string& frequency) {
    if (frequency == "Weekly") return roundToCent(amount * (52.0 / 12.0));
    if (frequency == "Fortnightly") return roundToCent(amount * (26.0 / 12.0));
    if (frequency == "Monthly") return roundToCent(amount);
    if (frequency == "Yearly") return roundToCent(amount / 12.0);
    if (frequency == "Daily") return roundToCent(amount * (365.0 / 12.0));
    if (frequency == "One-off") return roundToCent(amount); // counts once, this month
    throw std::runtime_error("Unsupported frequency: " + frequency);
}

// Replace the user's budget plan (allocations) for the current month.
// plan maps category name -> monthly amount; runs inside the caller's txn.
int saveBudgetPlan(pqxx::work& txn, const std::string& userUuid,
                   const std::map<std::string, double>& plan, double monthlyIncome) {
    pqxx::result dateRow = txn.exec(
        "SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y, "
        "EXTRACT(MONTH FROM CURRENT_DATE)::int AS m");
    int year  = dateRow[0]["y"].as<int>();
    int month = dateRow[0]["m"].as<int>();

    txn.exec_params(
        "DELETE FROM budget_allocations WHERE user_id = $1::uuid AND month = $2 AND year = $3",
        userUuid, month, year);

    int savedItems = 0;
    for (const auto& [categoryName, monthlyAmount] : plan) {
        // Resolve the category: prefer the shared default, then the
        // user's own custom one, otherwise create a custom category.
        pqxx::result cat = txn.exec_params(
            "SELECT id FROM categories "
            "WHERE name = $1 AND (user_id IS NULL OR user_id = $2::uuid) "
            "ORDER BY user_id NULLS FIRST LIMIT 1",
            categoryName, userUuid);

        std::string categoryId;
        if (cat.empty()) {
            pqxx::result created = txn.exec_params(
                "INSERT INTO categories (name, is_custom, user_id) "
                "VALUES ($1, true, $2::uuid) RETURNING id",
                categoryName, userUuid);
            categoryId = created[0][0].as<std::string>();
        } else {
            categoryId = cat[0][0].as<std::string>();
        }

        double pct = monthlyIncome > 0
            ? roundToCent(monthlyAmount / monthlyIncome * 100.0) : 0.0;

        txn.exec_params(R"(
            INSERT INTO budget_allocations (user_id, category_id, max_budget, percentage, month, year)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
            ON CONFLICT (user_id, category_id, month, year)
            DO UPDATE SET max_budget = EXCLUDED.max_budget,
                          percentage = EXCLUDED.percentage,
                          updated_at = timezone('utc'::text, now())
        )", userUuid, categoryId, roundToCent(monthlyAmount), pct, month, year);
        savedItems++;
    }
    return savedItems;
}

// Replace the user's stored income sources with the given array.
// Expects items shaped {name?, amount, frequency}; runs inside the caller's txn.
int replaceIncomeSources(pqxx::work& txn, const std::string& userUuid,
                         const nlohmann::json& income) {
    txn.exec_params("DELETE FROM income_sources WHERE user_id = $1::uuid", userUuid);
    int saved = 0;
    for (const auto& item : income) {
        std::string name = item.value("name", "");
        double amount = item.at("amount").get<double>();
        std::string freq = item.at("frequency").get<std::string>();
        toMonthly(amount, freq); // validates the frequency
        if (amount < 0) continue;
        txn.exec_params(
            "INSERT INTO income_sources (user_id, name, amount, frequency) "
            "VALUES ($1::uuid, $2, $3, $4)",
            userUuid, name, amount, freq);
        saved++;
    }
    return saved;
}

} // namespace

void registerOnboardingRoutes(httplib::Server& svr, Database& db, const std::string& jwtSecret) {
    svr.Post("/api/onboarding", [&db, &jwtSecret](const httplib::Request& req, httplib::Response& res) {
        // 1. Validate the user
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) {
            std::cerr << "[ERROR] Onboarding failed: Unauthorized (Missing or invalid JWT)\n";
            sendJson(res, 401, {{"error", "Unauthorized"}});
            return;
        }

        try {
            auto body = json::parse(req.body);

            if (!body.contains("income") || !body.at("income").is_array() ||
                !body.contains("expenses") || !body.at("expenses").is_array()) {
                sendJson(res, 400, {{"error", "Invalid payload: income and expenses arrays are required."}});
                return;
            }

            // 2. Calculate Totals
            double monthlyIncome = 0.0;
            for (const auto& income : body.at("income")) {
                double amount = income.at("amount").get<double>();
                std::string freq = income.at("frequency").get<std::string>();
                monthlyIncome = roundToCent(monthlyIncome + toMonthly(amount, freq));
            }

            double monthlyExpenses = 0.0;
            for (const auto& expense : body.at("expenses")) {
                double amount = expense.at("amount").get<double>();
                std::string freq = expense.at("frequency").get<std::string>();
                monthlyExpenses = roundToCent(monthlyExpenses + toMonthly(amount, freq));
            }

            // 3. Block if they spend more than they make
            if (monthlyExpenses > monthlyIncome) {
                sendJson(res, 400, {
                    {"error", "Your expenses exceed your income! Please adjust your budget."},
                    {"monthly_income", monthlyIncome},
                    {"monthly_expenses", monthlyExpenses}
                });
                return;
            }

            // 4. Calculate leftover surplus
            double surplus = roundToCent(monthlyIncome - monthlyExpenses);

            // 5. Aggregate the plan by category (envelope budgeting: one
            //    monthly allocation per category, like YNAB/EveryDollar).
            std::map<std::string, double> plan;
            for (const auto& expense : body.at("expenses")) {
                std::string category = expense.value("category", "Other");
                if (category.empty()) category = "Other";

                double amount = expense.at("amount").get<double>();
                std::string freq = expense.at("frequency").get<std::string>();
                plan[category] = roundToCent(plan[category] + toMonthly(amount, freq));
            }

            // 6. Leftover surplus becomes the Savings envelope
            if (surplus > 0) {
                plan["Savings"] = roundToCent(plan["Savings"] + surplus);
            }

            // 7. Save to budget_allocations for the current month.
            //    Re-running onboarding replaces this month's budget plan.
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            int savedItems = saveBudgetPlan(txn, *userUuid, plan, monthlyIncome);

            // 8. Persist income sources so the budget editor can prefill them
            replaceIncomeSources(txn, *userUuid, body.at("income"));

            txn.commit();
            std::cout << "[INFO] Onboarding successful. Saved " << savedItems
                      << " budget allocations.\n";

            sendJson(res, 200, {
                {"status", "ok"},
                {"monthly_income", monthlyIncome},
                {"monthly_expenses", monthlyExpenses},
                {"surplus_stored", surplus},
                {"saved_items", savedItems}
            });

        } catch (const json::exception& e) {
            std::cerr << "[ERROR] JSON Parsing failed: " << e.what() << "\n";
            sendJson(res, 400, {{"error", "Invalid JSON payload format."}});
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] Database or Server exception: " << e.what() << "\n";
            sendJson(res, 500, {{"error", "Internal Server Error."}});
        }
    });

    // --- GET /api/income : the user's saved income sources ---
    svr.Get("/api/income", [&db, &jwtSecret](const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            pqxx::result r = txn.exec_params(
                "SELECT id, name, amount, frequency FROM income_sources "
                "WHERE user_id::text = $1 ORDER BY created_at",
                *userUuid);
            txn.commit();

            json items = json::array();
            for (const auto& row : r) {
                items.push_back({
                    {"id",        row["id"].as<std::string>("")},
                    {"name",      row["name"].as<std::string>("")},
                    {"amount",    row["amount"].as<double>(0.0)},
                    {"frequency", row["frequency"].as<std::string>("Monthly")}
                });
            }
            sendJson(res, 200, items);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/income failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- POST /api/allocations : replace this month's budget plan.
    //     Validates against the user's stored income sources. ---
    svr.Post("/api/allocations", [&db, &jwtSecret](const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            if (!body.contains("expenses") || !body.at("expenses").is_array()) {
                sendJson(res, 400, {{"error", "Invalid payload: expenses array is required."}});
                return;
            }

            auto lock = db.connLock();
            pqxx::work txn(db.conn());

            // Monthly income comes from the stored income sources
            double monthlyIncome = 0.0;
            pqxx::result inc = txn.exec_params(
                "SELECT amount, frequency FROM income_sources WHERE user_id::text = $1",
                *userUuid);
            for (const auto& row : inc) {
                monthlyIncome = roundToCent(monthlyIncome +
                    toMonthly(row["amount"].as<double>(0.0),
                              row["frequency"].as<std::string>("Monthly")));
            }

            double monthlyExpenses = 0.0;
            std::map<std::string, double> plan;
            for (const auto& expense : body.at("expenses")) {
                std::string category = expense.value("category", "Other");
                if (category.empty()) category = "Other";
                double amount = expense.at("amount").get<double>();
                std::string freq = expense.at("frequency").get<std::string>();
                double monthly = toMonthly(amount, freq);
                plan[category] = roundToCent(plan[category] + monthly);
                monthlyExpenses = roundToCent(monthlyExpenses + monthly);
            }

            if (monthlyIncome > 0 && monthlyExpenses > monthlyIncome) {
                sendJson(res, 400, {
                    {"error", "Your expenses exceed your income! Please adjust your budget."},
                    {"monthly_income", monthlyIncome},
                    {"monthly_expenses", monthlyExpenses}
                });
                return;
            }

            double surplus = roundToCent(monthlyIncome - monthlyExpenses);
            if (surplus > 0) {
                plan["Savings"] = roundToCent(plan["Savings"] + surplus);
            }

            int savedItems = saveBudgetPlan(txn, *userUuid, plan, monthlyIncome);
            txn.commit();

            sendJson(res, 200, {
                {"status", "ok"},
                {"monthly_income", monthlyIncome},
                {"monthly_expenses", monthlyExpenses},
                {"surplus_stored", surplus},
                {"saved_items", savedItems}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", "Invalid JSON payload format."}});
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] POST /api/allocations failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- POST /api/income : replace the user's income sources ---
    svr.Post("/api/income", [&db, &jwtSecret](const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            if (!body.contains("income") || !body.at("income").is_array()) {
                sendJson(res, 400, {{"error", "Invalid payload: income array is required."}});
                return;
            }

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            int saved = replaceIncomeSources(txn, *userUuid, body.at("income"));
            txn.commit();

            sendJson(res, 200, {{"status", "ok"}, {"saved_items", saved}});
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", "Invalid JSON payload format."}});
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] POST /api/income failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });
}

} // namespace budgie
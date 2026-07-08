#include "OnboardingHandler.h"
#include <nlohmann/json.hpp>
#include <cmath>
#include <string>
#include <iostream>
#include <exception>

using json = nlohmann::json;

namespace budgie {
namespace {

void sendJson(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

double roundToCent(double value) {
    return std::round(value * 100.0) / 100.0;
}

double toMonthly(double amount, const std::string& frequency) {
    if (frequency == "Weekly") return roundToCent(amount * (52.0 / 12.0));
    if (frequency == "Fortnightly") return roundToCent(amount * (26.0 / 12.0));
    if (frequency == "Monthly") return roundToCent(amount);
    if (frequency == "Yearly") return roundToCent(amount / 12.0);
    if (frequency == "Daily") return roundToCent(amount * (365.0 / 12.0));
    throw std::runtime_error("Unsupported frequency: " + frequency);
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

            // 5. Save to Database
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string insertSql = R"(
                INSERT INTO budget_items (user_id, category, description, amount, date)
                VALUES ($1, $2, $3, $4, CURRENT_DATE)
            )";

            int savedItems = 0;
            for (const auto& expense : body.at("expenses")) {
                std::string category = expense.value("category", "Other");
                if (category.empty()) category = "Other";

                double amount = expense.at("amount").get<double>();
                std::string freq = expense.at("frequency").get<std::string>();
                double monthlyAmount = toMonthly(amount, freq);

                txn.exec_params(insertSql, *userUuid, category, "Onboarding expense (" + freq + ")", monthlyAmount);
                savedItems++;
            }

            // 6. Automatically save leftover as Savings
            if (surplus > 0) {
                txn.exec_params(insertSql, *userUuid, "Savings", "Unallocated Surplus", surplus);
                savedItems++;
            }

            txn.commit();
            std::cout << "[INFO] Onboarding successful for user. Saved " << savedItems << " items.\n";

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
}

} // namespace budgie
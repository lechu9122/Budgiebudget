#include "BudgetHandler.h"
#include "HttpUtil.h"
#include <nlohmann/json.hpp>
#include <cstdio>
#include <iostream>
#include <string>
#include <exception>

using json = nlohmann::json;

namespace budgie {

void registerBudgetRoutes(httplib::Server& svr, Database& db,
                        const std::string& jwtSecret) {
// --- GET /api/budget ---
    svr.Get("/api/budget", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }
        try {
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                SELECT bi.id, bi.user_id, bi.category,
                        bi.description, bi.amount, bi.date, bi.created_at, bi.updated_at
                FROM budget_items bi
                WHERE bi.user_id::text = $1
                ORDER BY bi.date DESC
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid);
            txn.commit();

            json items = json::array();
            for (const auto& row : r) {
                items.push_back({
                    {"id",          row["id"].as<std::string>("")},
                    {"user_id",     row["user_id"].as<std::string>("")},
                    {"category",    row["category"].as<std::string>("")},
                    {"description", row["description"].as<std::string>("")}, // FIXED NULL CRASH
                    {"amount",      row["amount"].as<double>(0.0)},
                    {"date",        row["date"].as<std::string>("")},
                    {"created_at",  row["created_at"].as<std::string>("")},
                    {"updated_at",  row["updated_at"].as<std::string>("")}
                });
            }
            sendJson(res, 200, items);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/budget failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- POST /api/budget ---
    svr.Post("/api/budget", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            std::string category    = body.at("category").get<std::string>();
            std::string description = body.value("description", "");
            double      amount      = body.at("amount").get<double>();
            std::string date        = body.at("date").get<std::string>();

            if (category.empty() || amount < 0) {
                sendJson(res, 400, {{"error", "Invalid payload"}}); return;
            }

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                INSERT INTO budget_items (user_id, category, description, amount, date)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid, category, description, amount, date);
            txn.commit();

            std::string newId = r[0][0].as<std::string>();
            sendJson(res, 201, {
                {"id", newId}, {"user_id", *userUuid},
                {"category", category}, {"description", description},
                {"amount", amount}, {"date", date}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        } catch (const std::exception& e) {
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- PUT /api/budget/:id ---
    svr.Put("/api/budget/([0-9a-fA-F-]+)", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        std::string itemId = req.matches[1];
        try {
            auto body = json::parse(req.body);
            std::string category    = body.at("category").get<std::string>();
            std::string description = body.value("description", "");
            double      amount      = body.at("amount").get<double>();
            std::string date        = body.at("date").get<std::string>();

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                UPDATE budget_items 
                SET category=$1, description=$2, amount=$3, date=$4, 
                    updated_at=timezone('utc'::text, now())
                WHERE id=$5::uuid AND user_id::text=$6
            )";
            pqxx::result r = txn.exec_params(sql, category, description, amount, date, itemId, *userUuid);
            txn.commit();

            if (r.affected_rows() == 0) {
                sendJson(res, 404, {{"error", "Item not found"}}); return;
            }
            sendJson(res, 200, {
                {"id", itemId}, {"user_id", *userUuid},
                {"category", category}, {"description", description},
                {"amount", amount}, {"date", date}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });

    // --- DELETE /api/budget/:id ---
    svr.Delete("/api/budget/([0-9a-fA-F-]+)", [&db, &jwtSecret](
                   const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        std::string itemId = req.matches[1];
        auto lock = db.connLock();
        pqxx::work txn(db.conn());
        std::string sql = R"(
            DELETE FROM budget_items WHERE id=$1::uuid AND user_id::text=$2
        )";
        pqxx::result r = txn.exec_params(sql, itemId, *userUuid);
        txn.commit();

        if (r.affected_rows() == 0) {
            sendJson(res, 404, {{"error", "Item not found"}}); return;
        }
        res.status = 204;
    });

    // --- GET /api/allocations?month=&year= (defaults to current month) ---
    svr.Get("/api/allocations", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto lock = db.connLock();
            pqxx::work txn(db.conn());

            int month, year;
            if (req.has_param("month") && req.has_param("year")) {
                month = std::stoi(req.get_param_value("month"));
                year  = std::stoi(req.get_param_value("year"));
            } else {
                pqxx::result now = txn.exec(
                    "SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS y, "
                    "EXTRACT(MONTH FROM CURRENT_DATE)::int AS m");
                year  = now[0]["y"].as<int>();
                month = now[0]["m"].as<int>();
            }

            std::string sql = R"(
                SELECT ba.id, ba.category_id,
                       COALESCE(c.name, 'Uncategorised') AS category_name,
                       ba.max_budget, ba.percentage, ba.month, ba.year
                FROM budget_allocations ba
                LEFT JOIN categories c ON ba.category_id = c.id
                WHERE ba.user_id::text = $1 AND ba.month = $2 AND ba.year = $3
                ORDER BY ba.max_budget DESC
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid, month, year);
            txn.commit();

            json allocations = json::array();
            for (const auto& row : r) {
                allocations.push_back({
                    {"id",            row["id"].as<std::string>("")},
                    {"category_id",   row["category_id"].as<std::string>("")},
                    {"category_name", row["category_name"].as<std::string>("")},
                    {"max_budget",    row["max_budget"].as<double>(0.0)},
                    {"percentage",    row["percentage"].as<double>(0.0)},
                    {"month",         row["month"].as<int>(0)},
                    {"year",          row["year"].as<int>(0)}
                });
            }
            sendJson(res, 200, allocations);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/allocations failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- GET /api/categories ---
    svr.Get("/api/categories", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                SELECT id, name, is_custom, user_id
                FROM categories
                WHERE user_id IS NULL OR user_id::text = $1
                ORDER BY is_custom, name
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid);
            txn.commit();

            json categories = json::array();
            for (const auto& row : r) {
                categories.push_back({
                    {"id",        row["id"].as<std::string>("")},
                    {"name",      row["name"].as<std::string>("")},
                    {"is_custom", row["is_custom"].as<bool>(false)},
                    {"user_id",   row["user_id"].is_null() ? nullptr : json(row["user_id"].as<std::string>(""))}
                });
            }
            sendJson(res, 200, categories);
        } catch (const pqxx::sql_error& e) {
            std::cerr << "[ERROR] GET /api/categories SQL error: " << e.what() << std::endl;
            std::cerr << "[ERROR] SQLSTATE: " << e.sqlstate() << std::endl;

            // Undefined table (42P01): keep frontend alive with an empty list.
            if (e.sqlstate() == "42P01") {
                sendJson(res, 200, json::array());
                return;
            }

            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/categories failed: " << e.what() << std::endl;
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- POST /api/categories ---
    svr.Post("/api/categories", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            std::string name = body.at("name").get<std::string>();

            if (name.empty()) {
                sendJson(res, 400, {{"error", "Category name required"}}); return;
            }

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                INSERT INTO categories (name, is_custom, user_id)
                VALUES ($1, true, $2)
                RETURNING id
            )";
            pqxx::result r = txn.exec_params(sql, name, *userUuid);
            txn.commit();

            std::string newId = r[0][0].as<std::string>();
            sendJson(res, 201, {
                {"id", newId},
                {"name", name},
                {"is_custom", true},
                {"user_id", *userUuid}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        } catch (const std::exception& e) {
            sendJson(res, 400, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

// --- GET /api/transactions ---
    svr.Get("/api/transactions", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try { // ADDED MISSING TRY/CATCH
            auto lock = db.connLock();
            pqxx::work txn(db.conn());

            // Month-start housekeeping: archive any completed months first,
            // so a new month automatically starts with a clean ledger.
            pqxx::result pending = txn.exec_params(R"(
                SELECT (
                    EXISTS (SELECT 1 FROM transactions
                            WHERE user_id = $1::uuid AND date < date_trunc('month', CURRENT_DATE))
                    OR EXISTS (SELECT 1 FROM budget_allocations
                               WHERE user_id = $1::uuid
                                 AND (year * 12 + month) <
                                     (EXTRACT(YEAR FROM CURRENT_DATE)::int * 12 + EXTRACT(MONTH FROM CURRENT_DATE)::int))
                ) AS p
            )", *userUuid);
            if (pending[0][0].as<bool>(false)) {
                performMonthlyRollover(txn, *userUuid);
            }

            std::string sql = R"(
                SELECT t.id, t.user_id, t.category_id,
                       COALESCE(c.name, 'Uncategorised') AS category_name,
                       t.description, t.amount, t.date, t.created_at
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.user_id::text = $1
                ORDER BY t.date DESC, t.created_at DESC
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid);
            txn.commit();

            json transactions = json::array();
            for (const auto& row : r) {
                transactions.push_back({
                    {"id",             row["id"].as<std::string>("")},
                    {"user_id",        row["user_id"].as<std::string>("")},
                    {"category_id",    row["category_id"].as<std::string>("")},
                    {"category_name",  row["category_name"].as<std::string>("")},
                    {"description",    row["description"].as<std::string>("")}, // FIXED NULL CRASH
                    {"amount",         row["amount"].as<double>(0.0)},
                    {"date",           row["date"].as<std::string>("")},
                    {"created_at",     row["created_at"].as<std::string>("")}
                });
            }
            sendJson(res, 200, transactions);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/transactions failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- GET /api/reports/archives : past monthly report cards (max 6) ---
    svr.Get("/api/reports/archives", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto lock = db.connLock();
            pqxx::work txn(db.conn());

            // Make sure any completed months are archived before reporting
            performMonthlyRollover(txn, *userUuid);

            pqxx::result r = txn.exec_params(R"(
                SELECT ma.year, ma.month,
                       COALESCE(c.name, 'Uncategorised') AS category_name,
                       ma.total_spent, ma.max_budget,
                       EXISTS (SELECT 1 FROM monthly_report_csv mc
                               WHERE mc.user_id = ma.user_id AND mc.year = ma.year AND mc.month = ma.month) AS has_csv
                FROM monthly_archives ma
                LEFT JOIN categories c ON ma.category_id = c.id
                WHERE ma.user_id::text = $1
                ORDER BY ma.year DESC, ma.month DESC, ma.total_spent DESC
            )", *userUuid);
            txn.commit();

            json monthsJson = json::array();
            int lastY = -1, lastM = -1;
            for (const auto& row : r) {
                int y = row["year"].as<int>();
                int m = row["month"].as<int>();
                if (y != lastY || m != lastM) {
                    monthsJson.push_back({
                        {"year", y}, {"month", m},
                        {"has_csv", row["has_csv"].as<bool>(false)},
                        {"categories", json::array()}
                    });
                    lastY = y; lastM = m;
                }
                monthsJson.back()["categories"].push_back({
                    {"category_name", row["category_name"].as<std::string>("")},
                    {"total_spent",   row["total_spent"].as<double>(0.0)},
                    {"max_budget",    row["max_budget"].as<double>(0.0)}
                });
            }
            sendJson(res, 200, monthsJson);
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/reports/archives failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- GET /api/reports/csv?year=&month= : stored CSV export of a month ---
    svr.Get("/api/reports/csv", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        if (!req.has_param("year") || !req.has_param("month")) {
            sendJson(res, 400, {{"error", "year and month query parameters are required"}});
            return;
        }

        try {
            int year  = std::stoi(req.get_param_value("year"));
            int month = std::stoi(req.get_param_value("month"));

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            pqxx::result r = txn.exec_params(
                "SELECT csv FROM monthly_report_csv WHERE user_id = $1::uuid AND year = $2 AND month = $3",
                *userUuid, year, month);
            txn.commit();

            if (r.empty()) {
                sendJson(res, 404, {{"error", "No CSV stored for that month"}});
                return;
            }
            res.set_content(r[0][0].as<std::string>(), "text/csv");
        } catch (const std::exception& e) {
            std::cerr << "[ERROR] GET /api/reports/csv failed: " << e.what() << "\n";
            sendJson(res, 500, {{"error", std::string("DB error: ") + e.what()}});
        }
    });

    // --- POST /api/transactions ---
    svr.Post("/api/transactions", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            std::string categoryId  = body.at("category_id").get<std::string>();
            std::string description = body.value("description", "");
            double      amount      = body.at("amount").get<double>();
            std::string date        = body.at("date").get<std::string>();

            if (amount < 0) {
                sendJson(res, 400, {{"error", "Invalid amount"}}); return;
            }

            auto lock = db.connLock();
            pqxx::work txn(db.conn());
            std::string sql = R"(
                INSERT INTO transactions (user_id, category_id, description, amount, date)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            )";
            pqxx::result r = txn.exec_params(sql, *userUuid, categoryId, description, amount, date);
            txn.commit();

            std::string newId = r[0][0].as<std::string>();
            sendJson(res, 201, {
                {"id", newId},
                {"user_id", *userUuid},
                {"category_id", categoryId},
                {"description", description},
                {"amount", amount},
                {"date", date}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });
}

namespace {

// Quote a CSV field per RFC 4180 (wrap in quotes, double internal quotes).
std::string csvField(const std::string& value) {
    std::string out = "\"";
    for (char c : value) {
        if (c == '"') out += "\"\"";
        else out += c;
    }
    out += "\"";
    return out;
}

std::string money(double v) {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.2f", v);
    return buf;
}

} // namespace

void performMonthlyRollover(pqxx::work& txn, const std::string& userUuid) {
    // Every completed month that still has raw transactions or allocations
    pqxx::result months = txn.exec_params(R"(
        SELECT DISTINCT y, m FROM (
            SELECT EXTRACT(YEAR FROM date)::int AS y, EXTRACT(MONTH FROM date)::int AS m
            FROM transactions
            WHERE user_id = $1::uuid AND date < date_trunc('month', CURRENT_DATE)
            UNION
            SELECT year, month FROM budget_allocations
            WHERE user_id = $1::uuid
              AND (year * 12 + month) <
                  (EXTRACT(YEAR FROM CURRENT_DATE)::int * 12 + EXTRACT(MONTH FROM CURRENT_DATE)::int)
        ) s ORDER BY y, m
    )", userUuid);

    for (const auto& row : months) {
        int y = row["y"].as<int>();
        int m = row["m"].as<int>();

        // 1. Report card rows from that month's budget plan (spent added below)
        txn.exec_params(R"(
            INSERT INTO monthly_archives (user_id, category_id, year, month, total_spent, max_budget)
            SELECT ba.user_id, ba.category_id, ba.year, ba.month, 0, ba.max_budget
            FROM budget_allocations ba
            WHERE ba.user_id = $1::uuid AND ba.year = $2 AND ba.month = $3
            ON CONFLICT (user_id, category_id, year, month) DO NOTHING
        )", userUuid, y, m);

        // 2. Fold that month's spending into the report card
        txn.exec_params(R"(
            INSERT INTO monthly_archives (user_id, category_id, year, month, total_spent, max_budget)
            SELECT t.user_id, t.category_id, $2, $3, SUM(t.amount), 0
            FROM transactions t
            WHERE t.user_id = $1::uuid AND t.category_id IS NOT NULL
              AND EXTRACT(YEAR FROM t.date)::int = $2 AND EXTRACT(MONTH FROM t.date)::int = $3
            GROUP BY t.user_id, t.category_id
            ON CONFLICT (user_id, category_id, year, month)
            DO UPDATE SET total_spent = monthly_archives.total_spent + EXCLUDED.total_spent
        )", userUuid, y, m);

        // 3. Export the raw expense lines to a stored CSV (appended if a CSV
        //    already exists, e.g. for back-dated expenses added later)
        pqxx::result lines = txn.exec_params(R"(
            SELECT t.date::text AS d, COALESCE(c.name, 'Uncategorised') AS category,
                   t.description, t.amount
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.user_id = $1::uuid
              AND EXTRACT(YEAR FROM t.date)::int = $2 AND EXTRACT(MONTH FROM t.date)::int = $3
            ORDER BY t.date, t.created_at
        )", userUuid, y, m);

        if (!lines.empty()) {
            std::string body;
            for (const auto& l : lines) {
                body += l["d"].as<std::string>("") + ","
                      + csvField(l["category"].as<std::string>("")) + ","
                      + csvField(l["description"].as<std::string>("")) + ","
                      + money(l["amount"].as<double>(0.0)) + "\n";
            }

            pqxx::result existing = txn.exec_params(
                "SELECT csv FROM monthly_report_csv WHERE user_id = $1::uuid AND year = $2 AND month = $3",
                userUuid, y, m);
            std::string csv = existing.empty()
                ? "Date,Category,Description,Amount\n" + body
                : existing[0][0].as<std::string>() + body;

            txn.exec_params(R"(
                INSERT INTO monthly_report_csv (user_id, year, month, csv)
                VALUES ($1::uuid, $2, $3, $4)
                ON CONFLICT (user_id, year, month) DO UPDATE SET csv = EXCLUDED.csv
            )", userUuid, y, m, csv);
        }

        // 4. Compact: raw data is summarised + exported, so delete it
        txn.exec_params(R"(
            DELETE FROM transactions
            WHERE user_id = $1::uuid
              AND EXTRACT(YEAR FROM date)::int = $2 AND EXTRACT(MONTH FROM date)::int = $3
        )", userUuid, y, m);
        txn.exec_params(
            "DELETE FROM budget_allocations WHERE user_id = $1::uuid AND year = $2 AND month = $3",
            userUuid, y, m);

        std::cout << "[INFO] Archived " << y << "-" << m << " into report card for user "
                  << userUuid << "\n";
    }

    // 5. Retention: keep only the 6 most recent past months
    const char* retention = R"(
        DELETE FROM %s
        WHERE user_id = $1::uuid
          AND (EXTRACT(YEAR FROM CURRENT_DATE)::int * 12 + EXTRACT(MONTH FROM CURRENT_DATE)::int)
              - (year * 12 + month) > 6
    )";
    char sql[512];
    std::snprintf(sql, sizeof(sql), retention, "monthly_archives");
    txn.exec_params(sql, userUuid);
    std::snprintf(sql, sizeof(sql), retention, "monthly_report_csv");
    txn.exec_params(sql, userUuid);
}

} // namespace budgie

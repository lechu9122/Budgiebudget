#include "BudgetHandler.h"
#include <nlohmann/json.hpp>
#include <iostream>

using json = nlohmann::json;

namespace budgie {
namespace {

void sendJson(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

} // namespace

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
            std::string sql = R"(
                SELECT t.id, t.user_id, t.category_id, c.name AS category_name,
                       t.description, t.amount, t.date, t.created_at
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
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

void performMonthlyRollover(Database& db, long long userId) {
    try {
        auto lock = db.connLock();
        pqxx::work txn(db.conn());
        
        // Get current year and month
        std::string dateQuery = R"(
            SELECT EXTRACT(YEAR FROM CURRENT_DATE) AS year,
                   EXTRACT(MONTH FROM CURRENT_DATE) AS month
        )";
        pqxx::result dateResult = txn.exec(dateQuery);
        
        if (dateResult.empty()) return;
        
        int currentYear = dateResult[0]["year"].as<int>();
        int currentMonth = dateResult[0]["month"].as<int>();

        // Archive transactions by category for this user
        std::string archiveSql = R"(
            INSERT INTO monthly_archives (user_id, category_id, year, month, total_spent, max_budget)
            SELECT ba.user_id, ba.category_id, $1, $2,
                COALESCE(SUM(t.amount), 0) AS total_spent, ba.max_budget
            FROM budget_allocations ba
            LEFT JOIN transactions t
                ON ba.category_id = t.category_id
                AND EXTRACT(MONTH FROM t.date) = $2
                AND EXTRACT(YEAR FROM t.date) = $1
            WHERE ba.user_id::text = $3 AND ba.month = $2 AND ba.year = $1
            GROUP BY ba.user_id, ba.category_id, ba.max_budget
        )";
        
        txn.exec_params(archiveSql, currentYear, currentMonth, std::to_string(userId));
        txn.commit();
    } catch (const std::exception& e) {
        // Log error but don't throw
        std::cerr << "[ERROR] Monthly rollover failed: " << e.what() << std::endl;
    }
}

} // namespace budgie

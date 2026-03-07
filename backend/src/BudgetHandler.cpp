#include "BudgetHandler.h"
#include <nlohmann/json.hpp>
#include <sqlite3.h>

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
        long long userId = validateToken(req.get_header_value("Authorization"), jwtSecret);
        if (userId < 0) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        sqlite3_stmt* stmt = nullptr;
        const char* sql =
            "SELECT id, user_id, category, description, amount, date, "
            "       created_at, updated_at "
            "FROM budget_items WHERE user_id=? ORDER BY date DESC;";
        if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
            sendJson(res, 500, {{"error", "DB prepare failed"}}); return;
        }
        sqlite3_bind_int64(stmt, 1, userId);

        json items = json::array();
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            items.push_back({
                {"id",          sqlite3_column_int64(stmt, 0)},
                {"user_id",     sqlite3_column_int64(stmt, 1)},
                {"category",    reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2))},
                {"description", reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3))},
                {"amount",      sqlite3_column_double(stmt, 4)},
                {"date",        reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5))},
                {"created_at",  reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6))},
                {"updated_at",  reinterpret_cast<const char*>(sqlite3_column_text(stmt, 7))}
            });
        }
        sqlite3_finalize(stmt);
        sendJson(res, 200, items);
    });

    // --- POST /api/budget ---
    svr.Post("/api/budget", [&db, &jwtSecret](
                 const httplib::Request& req, httplib::Response& res) {
        long long userId = validateToken(req.get_header_value("Authorization"), jwtSecret);
        if (userId < 0) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        try {
            auto body = json::parse(req.body);
            std::string category    = body.at("category").get<std::string>();
            std::string description = body.value("description", "");
            double      amount      = body.at("amount").get<double>();
            std::string date        = body.at("date").get<std::string>();

            if (category.empty() || amount < 0) {
                sendJson(res, 400, {{"error", "Invalid payload"}}); return;
            }

            sqlite3_stmt* stmt = nullptr;
            const char* sql =
                "INSERT INTO budget_items (user_id, category, description, amount, date) "
                "VALUES (?, ?, ?, ?, ?);";
            if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
                sendJson(res, 500, {{"error", "DB prepare failed"}}); return;
            }
            sqlite3_bind_int64(stmt, 1, userId);
            sqlite3_bind_text(stmt, 2, category.c_str(),    -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, description.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_double(stmt, 4, amount);
            sqlite3_bind_text(stmt, 5, date.c_str(),        -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);

            long long newId = db.lastInsertRowId();
            sendJson(res, 201, {
                {"id", newId}, {"user_id", userId},
                {"category", category}, {"description", description},
                {"amount", amount}, {"date", date}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });

    // --- PUT /api/budget/:id ---
    svr.Put("/api/budget/(\\d+)", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        long long userId = validateToken(req.get_header_value("Authorization"), jwtSecret);
        if (userId < 0) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        long long itemId = std::stoll(req.matches[1]);
        try {
            auto body = json::parse(req.body);
            std::string category    = body.at("category").get<std::string>();
            std::string description = body.value("description", "");
            double      amount      = body.at("amount").get<double>();
            std::string date        = body.at("date").get<std::string>();

            sqlite3_stmt* stmt = nullptr;
            const char* sql =
                "UPDATE budget_items "
                "SET category=?, description=?, amount=?, date=?, "
                "    updated_at=datetime('now') "
                "WHERE id=? AND user_id=?;";
            if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
                sendJson(res, 500, {{"error", "DB prepare failed"}}); return;
            }
            sqlite3_bind_text(stmt, 1, category.c_str(),    -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, description.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_double(stmt, 3, amount);
            sqlite3_bind_text(stmt, 4, date.c_str(),        -1, SQLITE_TRANSIENT);
            sqlite3_bind_int64(stmt, 5, itemId);
            sqlite3_bind_int64(stmt, 6, userId);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);

            if (sqlite3_changes(db.handle()) == 0) {
                sendJson(res, 404, {{"error", "Item not found"}}); return;
            }
            sendJson(res, 200, {
                {"id", itemId}, {"user_id", userId},
                {"category", category}, {"description", description},
                {"amount", amount}, {"date", date}
            });
        } catch (const json::exception& e) {
            sendJson(res, 400, {{"error", e.what()}});
        }
    });

    // --- DELETE /api/budget/:id ---
    svr.Delete("/api/budget/(\\d+)", [&db, &jwtSecret](
                   const httplib::Request& req, httplib::Response& res) {
        long long userId = validateToken(req.get_header_value("Authorization"), jwtSecret);
        if (userId < 0) { sendJson(res, 401, {{"error", "Unauthorized"}}); return; }

        long long itemId = std::stoll(req.matches[1]);
        sqlite3_stmt* stmt = nullptr;
        const char* sql =
            "DELETE FROM budget_items WHERE id=? AND user_id=?;";
        if (sqlite3_prepare_v2(db.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
            sendJson(res, 500, {{"error", "DB prepare failed"}}); return;
        }
        sqlite3_bind_int64(stmt, 1, itemId);
        sqlite3_bind_int64(stmt, 2, userId);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);

        if (sqlite3_changes(db.handle()) == 0) {
            sendJson(res, 404, {{"error", "Item not found"}}); return;
        }
        res.status = 204;
    });
}

} // namespace budgie

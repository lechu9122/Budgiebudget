#include "AiAdvisorHandler.h"
#include <nlohmann/json.hpp>
#include <sqlite3.h>
#include <iomanip>
#include <sstream>
#include <map>
#include <string>

using json = nlohmann::json;

namespace budgie {
namespace {

void sendJson(httplib::Response& res, int status, const json& body) {
    res.status = status;
    res.set_content(body.dump(), "application/json");
}

/**
 * Heuristic AI advisor.
 *
 * Aggregates the user's spending by category and applies simple rules to
 * produce actionable advice.  A production implementation would call an
 * external LLM API here (e.g. OpenAI), with the API key read from an
 * environment variable – never hardcoded.
 */
std::string generateAdvice(sqlite3* db, long long userId) {
    const char* sql =
        "SELECT category, SUM(amount) AS total "
        "FROM budget_items WHERE user_id=? "
        "GROUP BY category ORDER BY total DESC;";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        return "Unable to analyse your budget at this time.";
    }
    sqlite3_bind_int64(stmt, 1, userId);

    std::map<std::string, double> spending;
    double totalSpend = 0.0;
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        std::string cat = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        double      amt = sqlite3_column_double(stmt, 1);
        spending[cat]   = amt;
        totalSpend     += amt;
    }
    sqlite3_finalize(stmt);

    if (spending.empty()) {
        return "No spending data found yet. Start by adding some budget items!";
    }

    std::ostringstream advice;
    advice << "Your total recorded spending is $" << std::fixed
           << std::setprecision(2) << totalSpend << ". ";

    // Identify the top spending category
    auto top = std::max_element(spending.begin(), spending.end(),
        [](const auto& a, const auto& b) { return a.second < b.second; });
    advice << "Your biggest expense category is \"" << top->first
           << "\" at $" << top->second << ". ";

    // Simple threshold rules
    if (top->second > totalSpend * 0.5) {
        advice << "Consider reducing spending in this area – it accounts for more "
                  "than 50% of your budget. ";
    }
    if (spending.count("Dining") && spending.at("Dining") > 200) {
        advice << "Your dining expenses exceed $200; cooking at home more often "
                  "could yield significant savings. ";
    }
    if (spending.count("Entertainment") && spending.at("Entertainment") > 150) {
        advice << "Entertainment spending is high. Look for free or lower-cost "
                  "alternatives. ";
    }

    advice << "Review your spending monthly to stay on track with your goals.";
    return advice.str();
}

} // namespace

void registerAiAdvisorRoutes(httplib::Server& svr, Database& db,
                             const std::string& jwtSecret) {
    svr.Get("/api/ai/advice", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        long long userId = validateToken(req.get_header_value("Authorization"), jwtSecret);
        if (userId < 0) {
            sendJson(res, 401, {{"error", "Unauthorized"}});
            return;
        }
        std::string advice = generateAdvice(db.handle(), userId);
        sendJson(res, 200, {{"advice", advice}});
    });
}

} // namespace budgie

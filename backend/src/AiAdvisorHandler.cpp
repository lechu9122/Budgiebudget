#include "AiAdvisorHandler.h"
#include <nlohmann/json.hpp>
#include <iomanip>
#include <sstream>
#include <map>
#include <string>
#include <iostream>
#include <algorithm>
#include <exception>

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
std::string generateAdvice(pqxx::connection& conn, const std::string& userUuid) {
    try {
        pqxx::work txn(conn);
        std::string sql = R"(
            SELECT COALESCE(p.name, c.name) AS main_category, SUM(t.amount) AS total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE t.user_id::text=$1
            GROUP BY main_category
            ORDER BY total DESC
        )";
        pqxx::result r = txn.exec_params(sql, userUuid);
        txn.commit();

        std::map<std::string, double> spending;
        double totalSpend = 0.0;
        for (const auto& row : r) {
            std::string cat = row["main_category"].as<std::string>();
            double amt = row["total"].as<double>();
            spending[cat] = amt;
            totalSpend += amt;
        }

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
    } catch (const std::exception& e) {
        return "Unable to analyse your budget at this time.";
    }
}

} // namespace

void registerAiAdvisorRoutes(httplib::Server& svr, Database& db,
                             const std::string& jwtSecret) {
    svr.Get("/api/ai/advice", [&db, &jwtSecret](
                const httplib::Request& req, httplib::Response& res) {
        auto userUuid = validateTokenUuid(req.get_header_value("Authorization"), jwtSecret, db);
        if (!userUuid) {
            sendJson(res, 401, {{"error", "Unauthorized"}});
            return;
        }
        auto lock = db.connLock();
        std::string advice = generateAdvice(db.conn(), *userUuid);
        sendJson(res, 200, {{"advice", advice}});
    });
}

} // namespace budgie

#include "Database.h"
#include "AuthHandler.h"
#include "BudgetHandler.h"
#include "AiAdvisorHandler.h"

#include <httplib.h>
#include <cstdlib>
#include <iostream>
#include <string>

int main() {
    // Read configuration from environment variables.
    // Copy .env.example to .env and fill in your values before running.
    const char* dbPathEnv    = std::getenv("DB_PATH");
    const char* jwtSecretEnv = std::getenv("JWT_SECRET");
    const char* portEnv      = std::getenv("PORT");

    std::string dbPath    = dbPathEnv    ? dbPathEnv    : "budgie.db";
    std::string jwtSecret = jwtSecretEnv ? jwtSecretEnv : "change-me-in-production";
    int         port      = portEnv      ? std::stoi(portEnv) : 8080;

    if (jwtSecret == "change-me-in-production") {
        std::cerr << "[WARN] JWT_SECRET is not set. Using insecure default.\n"
                  << "       Set JWT_SECRET in your environment or .env file.\n";
    }

    budgie::Database db(dbPath);

    httplib::Server svr;

    // CORS – allow the React dev server to reach the backend.
    svr.set_pre_routing_handler([](const httplib::Request& req,
                                   httplib::Response& res) -> httplib::Server::HandlerResponse {
        res.set_header("Access-Control-Allow-Origin",  "*");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method == "OPTIONS") {
            res.status = 204;
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });

    // Register all API routes.
    budgie::registerAuthRoutes(svr, db, jwtSecret);
    budgie::registerBudgetRoutes(svr, db, jwtSecret);
    budgie::registerAiAdvisorRoutes(svr, db, jwtSecret);

    // Health-check endpoint.
    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content(R"({"status":"ok"})", "application/json");
    });

    std::cout << "BudgieBudget backend listening on http://0.0.0.0:" << port << "\n";
    svr.listen("0.0.0.0", port);

    return 0;
}

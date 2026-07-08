#include "Database.h"
#include "AuthHandler.h"
#include "BudgetHandler.h"
#include "AiAdvisorHandler.h"
#include "OnboardingHandler.h"

#include <httplib.h>
#include <cstdlib>
#include <iostream>
#include <string>
#include <stdexcept>
#include <fstream>

namespace {
void loadEnvFile(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) {
        std::cerr << "[WARN] .env file not found: " << filename << "\n";
        return;
    }
    std::string line;
    int count = 0;
    while (std::getline(file, line)) {
        // Skip empty lines and comments
        if (line.empty() || line[0] == '#') continue;
        
        // Trim leading/trailing whitespace
        size_t start = line.find_first_not_of(" \t");
        if (start == std::string::npos) continue;
        line = line.substr(start);
        
        // Find the first '=' 
        size_t eqPos = line.find('=');
        if (eqPos == std::string::npos) continue;
        
        std::string key = line.substr(0, eqPos);
        std::string value = line.substr(eqPos + 1);
        
        // Trim trailing whitespace from value
        size_t end = value.find_last_not_of(" \t\r\n");
        if (end != std::string::npos) {
            value = value.substr(0, end + 1);
        }
        
        setenv(key.c_str(), value.c_str(), 1);
        count++;
        std::cerr << "[DEBUG] Loaded: " << key << "=" << (key == "DATABASE_URL" ? "***" : value.substr(0, 20)) << "\n";
    }
    std::cerr << "[INFO] Loaded " << count << " environment variables from " << filename << "\n";
}
}

int main() {
    // Try loading .env from multiple locations
    const char* envPaths[] = {
        "../.env",           // From backend directory
        "../../.env",        // Fallback
        ".env"               // Current directory
    };
    
    bool envLoaded = false;
    for (const auto& path : envPaths) {
        std::ifstream test(path);
        if (test.good()) {
            std::cerr << "[INFO] Found .env at: " << path << "\n";
            loadEnvFile(path);
            envLoaded = true;
            break;
        }
    }
    
    if (!envLoaded) {
        std::cerr << "[WARN] No .env file found in standard locations\n";
    }

    // Read configuration from environment variables.
    const char* dbConnEnv    = std::getenv("DATABASE_URL");
    const char* jwtSecretEnv = std::getenv("JWT_SECRET");
    const char* portEnv      = std::getenv("PORT");

    // Debug output
    std::cerr << "[DEBUG] DATABASE_URL from env: " << (dbConnEnv ? "SET" : "NOT SET") << "\n";
    std::cerr << "[DEBUG] JWT_SECRET from env: " << (jwtSecretEnv ? "SET" : "NOT SET") << "\n";
    std::cerr << "[DEBUG] PORT from env: " << (portEnv ? portEnv : "NOT SET") << "\n";

    std::string dbConnStr = dbConnEnv ? dbConnEnv : "postgresql://postgres:postgres@localhost:5432/budgie";
    std::string jwtSecret = jwtSecretEnv ? jwtSecretEnv : "change-me-in-production";
    int         port      = portEnv      ? std::stoi(portEnv) : 8080;

    if (jwtSecret == "change-me-in-production") {
        std::cerr << "[WARN] JWT_SECRET is not set. Using insecure default.\n"
                  << "       Set JWT_SECRET in your environment or .env file.\n";
    }

    try {
        budgie::Database db(dbConnStr);
        std::cout << "[INFO] Database initialized successfully\n";

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
        budgie::registerOnboardingRoutes(svr, db, jwtSecret);

        // Health-check endpoint.
        svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
            res.set_content(R"({"status":"ok"})", "application/json");
        });

        std::cout << "BudgieBudget backend listening on http://0.0.0.0:" << port << "\n";
        svr.listen("0.0.0.0", port);

    } catch (const std::exception& e) {
        std::cerr << "[ERROR] Failed to start server: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}

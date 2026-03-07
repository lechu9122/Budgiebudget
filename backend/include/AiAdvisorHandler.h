#pragma once

#include "Database.h"
#include "AuthHandler.h"
#include <httplib.h>
#include <string>

namespace budgie {

/**
 * Registers the AI advisor endpoint:
 *   GET /api/ai/advice – return budget optimisation advice for the
 *                        authenticated user based on their spending data.
 *
 * The current implementation uses simple heuristic rules.
 * A future version may call an external LLM API (key stored in .env).
 */
void registerAiAdvisorRoutes(httplib::Server& svr, Database& db,
                             const std::string& jwtSecret);

} // namespace budgie

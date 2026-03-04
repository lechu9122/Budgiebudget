#pragma once

#include "Database.h"
#include <httplib.h>

namespace budgie {

/**
 * Registers the authentication endpoints on the given HTTP server:
 *   POST /api/auth/register  – create a new user account
 *   POST /api/auth/login     – authenticate and receive a JWT
 */
void registerAuthRoutes(httplib::Server& svr, Database& db,
                        const std::string& jwtSecret);

/**
 * Validate a Bearer token from an Authorization header.
 * Returns the user_id encoded in the token, or -1 if invalid.
 */
long long validateToken(const std::string& authHeader,
                        const std::string& jwtSecret);

} // namespace budgie

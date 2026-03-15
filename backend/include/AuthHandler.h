#pragma once

#include "Database.h"
#include <httplib.h>
#include <optional>

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

/**
 * Validate a Bearer token and return UUID subject string when valid.
 */
std::optional<std::string> validateTokenUuid(const std::string& authHeader,
                                             const std::string& jwtSecret);

/**
 * Validate a Bearer token and resolve the subject to a real UUID.
 * If the subject is not a UUID, looks up user_subject_map for legacy tokens.
 */
std::optional<std::string> validateTokenUuid(const std::string& authHeader,
                                             const std::string& jwtSecret,
                                             Database& db);

/**
 * Resolve the numeric JWT subject to the actual UUID used by PostgreSQL tables.
 */
std::optional<std::string> resolveUserUuid(Database& db, long long tokenUserId);

} // namespace budgie

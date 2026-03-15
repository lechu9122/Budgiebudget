#pragma once

#include "Database.h"
#include "AuthHandler.h"
#include <httplib.h>
#include <string>

namespace budgie {

/**
 * Registers the onboarding endpoint:
 *   POST /api/onboarding - validate onboarding totals and store budget items.
 */
void registerOnboardingRoutes(httplib::Server& svr, Database& db,
                              const std::string& jwtSecret);

} // namespace budgie

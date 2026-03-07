#pragma once

#include "Database.h"
#include "AuthHandler.h"
#include <httplib.h>
#include <string>

namespace budgie {

/**
 * Registers the budget CRUD endpoints:
 *   GET    /api/budget        – list all items for the authenticated user
 *   POST   /api/budget        – create a new item
 *   PUT    /api/budget/:id    – update an existing item
 *   DELETE /api/budget/:id    – delete an item
 */
void registerBudgetRoutes(httplib::Server& svr, Database& db,
                          const std::string& jwtSecret);

} // namespace budgie

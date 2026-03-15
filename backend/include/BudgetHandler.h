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
 *   
 *   GET    /api/categories    – list all standard + custom categories for user
 *   POST   /api/categories    – create a custom category for user
 *   
 *   GET    /api/transactions  – list all transactions for authenticated user
 *   POST   /api/transactions  – create a new transaction
 */
void registerBudgetRoutes(httplib::Server& svr, Database& db,
                          const std::string& jwtSecret);

/**
 * Archives transactions at month-end and resets monthly spending counters
 */
void performMonthlyRollover(Database& db, long long userId);

} // namespace budgie

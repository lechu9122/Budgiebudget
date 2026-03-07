#include "Database.h"
#include <stdexcept>

namespace budgie {

// ---------------------------------------------------------------------------
// Schema applied on first run
// ---------------------------------------------------------------------------
static const char* SCHEMA_SQL = R"sql(
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category    TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    amount      REAL    NOT NULL CHECK(amount >= 0),
    date        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
)sql";

// ---------------------------------------------------------------------------
Database::Database(const std::string& dbPath) {
    if (sqlite3_open(dbPath.c_str(), &db_) != SQLITE_OK) {
        throw std::runtime_error("Cannot open database: " +
                                 std::string(sqlite3_errmsg(db_)));
    }
    // Enable WAL mode and foreign-key enforcement.
    exec("PRAGMA journal_mode=WAL;");
    exec("PRAGMA foreign_keys=ON;");
    applySchema();
}

Database::~Database() {
    if (db_) sqlite3_close(db_);
}

void Database::exec(const std::string& sql) {
    char* errMsg = nullptr;
    int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::string msg = errMsg ? errMsg : "unknown error";
        sqlite3_free(errMsg);
        throw std::runtime_error("SQL error: " + msg);
    }
}

long long Database::lastInsertRowId() const {
    return sqlite3_last_insert_rowid(db_);
}

void Database::applySchema() {
    exec(SCHEMA_SQL);
}

} // namespace budgie

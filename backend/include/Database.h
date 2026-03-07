#pragma once

#include <sqlite3.h>
#include <string>
#include <vector>
#include <optional>
#include <stdexcept>

namespace budgie {

/**
 * Thin RAII wrapper around a SQLite3 database connection.
 * Opens (and creates if needed) the database at the given path, and applies
 * the initial schema when the tables do not yet exist.
 */
class Database {
public:
    explicit Database(const std::string& dbPath);
    ~Database();

    // Non-copyable, movable
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    sqlite3* handle() const { return db_; }

    /** Execute a single SQL statement that returns no rows. */
    void exec(const std::string& sql);

    /** Return the row-id of the last INSERT. */
    long long lastInsertRowId() const;

private:
    sqlite3* db_{nullptr};

    void applySchema();
};

} // namespace budgie

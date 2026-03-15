#pragma once

#include <pqxx/pqxx>
#include <string>
#include <memory>
#include <mutex>
#include <stdexcept>

namespace budgie {

/**
 * RAII wrapper around a PostgreSQL database connection using libpqxx.
 * Connects to Supabase/PostgreSQL and applies the schema if needed.
 * Thread-safe: callers must hold the mutex via connLock() while using conn().
 */
class Database {
public:
    explicit Database(const std::string& connectionString);
    ~Database();

    // Non-copyable, non-movable
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    /** Get the pqxx connection object. Must hold connLock() while using. */
    pqxx::connection& conn();

    /** Get a unique lock on the connection mutex. Hold this while using conn(). */
    std::unique_lock<std::mutex> connLock();

    /** Execute a single SQL statement that returns no rows. */
    void exec(const std::string& sql);

private:
    std::string connectionString_;
    std::unique_ptr<pqxx::connection> conn_;
    std::mutex mtx_;

    void applySchema();
    void ensureConnected();
};

} // namespace budgie

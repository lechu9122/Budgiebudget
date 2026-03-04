-- BudgieBudget – SQLite schema
-- Run: sqlite3 budgie.db < schema.sql

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    email         TEXT    NOT NULL UNIQUE,
    -- bcrypt / SHA-256 hex hash stored – never the plaintext password
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Budget items
-- ============================================================
CREATE TABLE IF NOT EXISTS budget_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
    -- Free-text category label, e.g. "Rent", "Groceries", "Dining"
    category    TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    amount      REAL    NOT NULL CHECK(amount >= 0),
    -- ISO 8601 date string, e.g. "2024-03-15"
    date        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_budget_items_user
    ON budget_items(user_id);

CREATE INDEX IF NOT EXISTS idx_budget_items_date
    ON budget_items(date);

-- ============================================================
-- Example seed data (comment out for production)
-- ============================================================
-- INSERT INTO users (username, email, password_hash) VALUES
--     ('alice', 'alice@example.com', '<hashed_password>');
--
-- INSERT INTO budget_items (user_id, category, description, amount, date) VALUES
--     (1, 'Rent',         'Monthly rent',      1200.00, '2024-03-01'),
--     (1, 'Groceries',    'Weekly shop',          80.50, '2024-03-03'),
--     (1, 'Dining',       'Team lunch',           25.00, '2024-03-05'),
--     (1, 'Entertainment','Cinema tickets',       30.00, '2024-03-10');

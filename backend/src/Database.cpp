#include "Database.h"
#include <pqxx/pqxx>
#include <stdexcept>
#include <iostream>

namespace budgie {

// ---------------------------------------------------------------------------
// PostgreSQL Schema applied on first run
// ---------------------------------------------------------------------------
static const char* SCHEMA_SQL = R"sql(
-- Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- JWT subject mapping (legacy numeric token subject -> UUID profile id)
CREATE TABLE IF NOT EXISTS user_subject_map (
  subject BIGINT PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
);

-- Backward-compatible migrations for older existing profiles tables
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE IF EXISTS profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Legacy migration: convert non-UUID user_id columns to UUID via user_subject_map
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'budget_items' AND column_name = 'user_id';

  IF col_type IS NOT NULL AND col_type <> 'uuid' THEN
    ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS user_id_new UUID;

    UPDATE budget_items bi
    SET user_id_new = COALESCE(
      (SELECT usm.user_id FROM user_subject_map usm WHERE usm.subject::text = bi.user_id::text),
      CASE
        WHEN bi.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN bi.user_id::text::uuid
        ELSE NULL
      END
    )
    WHERE user_id_new IS NULL;

    DELETE FROM budget_items WHERE user_id_new IS NULL;
    ALTER TABLE budget_items DROP COLUMN user_id;
    ALTER TABLE budget_items RENAME COLUMN user_id_new TO user_id;
    ALTER TABLE budget_items ALTER COLUMN user_id SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budget_items_user_id_fkey'
  ) THEN
    ALTER TABLE budget_items
      ADD CONSTRAINT budget_items_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'user_id';

  IF col_type IS NOT NULL AND col_type <> 'uuid' THEN
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id_new UUID;

    UPDATE transactions t
    SET user_id_new = COALESCE(
      (SELECT usm.user_id FROM user_subject_map usm WHERE usm.subject::text = t.user_id::text),
      CASE
        WHEN t.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN t.user_id::text::uuid
        ELSE NULL
      END
    )
    WHERE user_id_new IS NULL;

    DELETE FROM transactions WHERE user_id_new IS NULL;
    ALTER TABLE transactions DROP COLUMN user_id;
    ALTER TABLE transactions RENAME COLUMN user_id_new TO user_id;
    ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_user_id_fkey'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Budget allocations table
CREATE TABLE IF NOT EXISTS budget_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  max_budget DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  percentage DECIMAL(5, 2) DEFAULT 0.00,
  month INTEGER CHECK (month >= 1 AND month <= 12) NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, category_id, month, year)
);

-- Budget items table (string-based expenses)
CREATE TABLE IF NOT EXISTS budget_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  description TEXT DEFAULT '',
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Transactions table (ID-based expenses)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT DEFAULT '',
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Monthly archives table
CREATE TABLE IF NOT EXISTS monthly_archives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER CHECK (month >= 1 AND month <= 12) NOT NULL,
  total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  max_budget DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, category_id, year, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_allocations_user_id ON budget_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_user_id ON budget_items(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_date ON budget_items(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_monthly_archives_user_id ON monthly_archives(user_id, year, month);
)sql";

// ---------------------------------------------------------------------------
Database::Database(const std::string& connectionString)
    : connectionString_(connectionString) {
    try {
        conn_ = std::make_unique<pqxx::connection>(connectionString_);
        if (!conn_->is_open()) {
            throw std::runtime_error("Failed to open database connection");
        }
        std::cout << "[INFO] Connected to PostgreSQL database" << std::endl;
        applySchema();
    } catch (const std::exception& e) {
        throw std::runtime_error("DB Connection Error: " + std::string(e.what()));
    }
}

Database::~Database() = default;

void Database::exec(const std::string& sql) {
    try {
        std::lock_guard<std::mutex> lk(mtx_);
        ensureConnected();
        pqxx::work txn(*conn_);
        txn.exec(sql);
        txn.commit();
    } catch (const std::exception& e) {
        throw std::runtime_error("SQL Execution Error: " + std::string(e.what()));
    }
}

pqxx::connection& Database::conn() {
    return *conn_;
}

std::unique_lock<std::mutex> Database::connLock() {
    std::unique_lock<std::mutex> lk(mtx_);
    ensureConnected();
    return lk;
}

void Database::ensureConnected() {
    if (conn_ && conn_->is_open()) return;
    std::cerr << "[WARN] Database connection lost. Reconnecting...\n";
    conn_ = std::make_unique<pqxx::connection>(connectionString_);
    if (!conn_->is_open()) {
        throw std::runtime_error("Database reconnection failed");
    }
    std::cout << "[INFO] Database reconnected successfully\n";
}

void Database::applySchema() {
    try {
        exec(SCHEMA_SQL);
        std::cout << "[INFO] Database schema applied successfully" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[WARN] Schema application failed (may already exist): " 
                  << e.what() << std::endl;
    }
}

} // namespace budgie
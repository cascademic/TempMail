-- TempMail - PostgreSQL Migration
-- Run this on your PostgreSQL database to create all tables

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  emails_created INTEGER NOT NULL DEFAULT 0,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_approved ON users(is_approved);

-- ============================================================
-- TEMP_EMAILS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS temp_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_temp_emails_owner ON temp_emails(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_temp_emails_expires ON temp_emails(expires_at);

-- ============================================================
-- MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_email_id UUID NOT NULL REFERENCES temp_emails(id) ON DELETE CASCADE,
  sender VARCHAR(255) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject TEXT DEFAULT '',
  body_text TEXT DEFAULT '',
  body_html TEXT,
  otp VARCHAR(20),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size_bytes INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_temp_email ON messages(temp_email_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);

-- ============================================================
-- APP_CONFIG TABLE (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  email_ttl_seconds INTEGER NOT NULL DEFAULT 3600,
  max_emails_per_user INTEGER NOT NULL DEFAULT 100,
  service_name VARCHAR(100) NOT NULL DEFAULT 'TempMail',
  email_domain VARCHAR(255) NOT NULL DEFAULT 'tempmail.tk',
  smtp_port INTEGER NOT NULL DEFAULT 25,
  smtp_host VARCHAR(255) NOT NULL DEFAULT '0.0.0.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(50),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DEFAULT ADMIN USER
-- ============================================================
-- Username: anshul.madan  Password: P@ssw0rd
INSERT INTO users (username, email, password, is_approved, is_admin)
VALUES (
  'anshul.madan',
  'anshul.madan@tempmail.tk',
  '$2a$10$r20pSo.7W4iTGXGWzqZs/ObO9o3gMMRF5wKQGvfEHmnkvS/z4i2rq',
  true,
  true
)
ON CONFLICT (username) DO NOTHING;

/*
# TempMail - Temporary Email Service Schema

## Overview
Creates the complete database schema for a Mailinator-style temporary email service with user management, dynamic email generation, message storage with OTP extraction, and admin configuration.

## New Tables
1. `profiles` - Extends auth.users with app-specific fields (is_approved, is_admin, emails_created, last_login)
2. `temp_emails` - Temporary email addresses created by users, with TTL-based expiry
3. `messages` - Individual emails received at a temp_email address
4. `app_config` - Single-row configuration table for service settings

## Security
- RLS enabled on all tables
- `profiles`: users can read/update own profile; admin functions via edge function with service role
- `temp_emails`: users can CRUD their own temp emails
- `messages`: users can read messages on their own temp emails; insert via edge function (SMTP ingestion)
- `app_config`: public read (anon + authenticated); update via admin only (through edge function)

## Important Notes
- Uses Supabase auth.users for authentication (email/password)
- profiles.id references auth.users.id (1:1)
- temp_emails.owner_user_id references auth.users.id
- messages.temp_email_id references temp_emails.id (cascade delete)
- TTL is managed at app level (expires_at column) — a cron/edge function cleans up expired rows
- Admin operations (approve user, reset password, deactivate, update config) go through edge functions using service role key
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  is_approved boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  emails_created integer NOT NULL DEFAULT 0,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================================
-- TEMP_EMAILS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS temp_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  message_count integer NOT NULL DEFAULT 0
);

ALTER TABLE temp_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_emails_select_own" ON temp_emails;
CREATE POLICY "temp_emails_select_own" ON temp_emails FOR SELECT
TO authenticated USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "temp_emails_insert_own" ON temp_emails;
CREATE POLICY "temp_emails_insert_own" ON temp_emails FOR INSERT
TO authenticated WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "temp_emails_update_own" ON temp_emails;
CREATE POLICY "temp_emails_update_own" ON temp_emails FOR UPDATE
TO authenticated USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "temp_emails_delete_own" ON temp_emails;
CREATE POLICY "temp_emails_delete_own" ON temp_emails FOR DELETE
TO authenticated USING (auth.uid() = owner_user_id);

-- ============================================================
-- MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  temp_email_id uuid NOT NULL REFERENCES temp_emails(id) ON DELETE CASCADE,
  "from" text NOT NULL,
  "to" text NOT NULL,
  subject text DEFAULT '',
  body_text text DEFAULT '',
  body_html text,
  otp text,
  received_at timestamptz NOT NULL DEFAULT now(),
  size_bytes integer DEFAULT 0
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages on their own temp emails
DROP POLICY IF EXISTS "messages_select_own" ON messages;
CREATE POLICY "messages_select_own" ON messages FOR SELECT
TO authenticated USING (
  EXISTS (
    SELECT 1 FROM temp_emails
    WHERE temp_emails.id = messages.temp_email_id
    AND temp_emails.owner_user_id = auth.uid()
  )
);

-- Insert via edge function (service role bypasses RLS)
-- No INSERT policy for authenticated — only edge function inserts messages

-- ============================================================
-- APP_CONFIG TABLE (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id integer PRIMARY KEY DEFAULT 1,
  email_ttl_seconds integer NOT NULL DEFAULT 3600,
  max_emails_per_user integer NOT NULL DEFAULT 100,
  service_name text NOT NULL DEFAULT 'TempMail',
  email_domain text NOT NULL DEFAULT 'tempmail.tk',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Public read for config (service name, domain, TTL are needed by all users)
DROP POLICY IF EXISTS "app_config_select_all" ON app_config;
CREATE POLICY "app_config_select_all" ON app_config FOR SELECT
TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy for authenticated — only edge function with service role

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_temp_emails_owner ON temp_emails(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_temp_emails_expires ON temp_emails(expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_temp_email ON messages(temp_email_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_is_approved ON profiles(is_approved);

-- ============================================================
-- SEED CONFIG ROW
-- ============================================================
INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TRIGGER: Create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

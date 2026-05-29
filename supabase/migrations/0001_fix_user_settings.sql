-- Migration: align user_settings with the app's write payload
-- Symptom: POST .../rest/v1/user_settings → 400 Bad Request when saving API Key.
-- Cause:   the live user_settings table predates later schema additions (the
--          `theme` column was added after first deploy — see the note in
--          schema.sql), so PostgREST rejects writes that reference a column
--          that doesn't exist in the table's schema cache.
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.
--
-- Note: this project is single-user; user_settings has NO user_id column and
-- RLS is intentionally left disabled (the anon key reads/writes the single
-- settings row). A 400 here is a column/schema mismatch, NOT an RLS issue —
-- RLS denials surface as 401/403 or empty results, never 400.

-- 1. Ensure the ai_provider enum exists (table may predate it)
DO $$ BEGIN
  CREATE TYPE ai_provider AS ENUM ('qwen', 'gpt', 'claude', 'gemini');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Ensure every column the app reads/writes exists
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cooldown_hours integer     NOT NULL DEFAULT 72;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_provider    ai_provider NOT NULL DEFAULT 'qwen';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_model       text        NOT NULL DEFAULT 'qwen-vl-plus';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_api_key     text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS theme          text        NOT NULL DEFAULT 'warm';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now();
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- 3. Add the theme CHECK constraint only if it isn't already present
DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_theme_check
    CHECK (theme IN ('warm', 'cool', 'dark'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Guarantee exactly one settings row (the app reads .limit(1).maybeSingle())
INSERT INTO user_settings (cooldown_hours, ai_provider, ai_model)
SELECT 72, 'qwen', 'qwen-vl-plus'
WHERE NOT EXISTS (SELECT 1 FROM user_settings);

-- 5. Verify the resulting columns (output appears in the SQL Editor results pane)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_settings'
ORDER BY ordinal_position;

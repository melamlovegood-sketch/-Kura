-- Migration: add the user-configurable execution-layer timer duration
-- Feature:  Settings → 默认计时时长 (SPEC §5: 计时时长，默认15min，用户可改).
-- The app reads/writes user_settings.timer_minutes; without this column a write
-- that includes it would 400 (PostgREST schema-cache mismatch — same failure
-- mode as 0001).
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS timer_minutes integer NOT NULL DEFAULT 15;

-- Verify the resulting column (output appears in the SQL Editor results pane)
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_settings' AND column_name = 'timer_minutes';

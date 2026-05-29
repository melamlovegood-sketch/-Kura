-- Migration: Streak + achievements (SPEC_PHASE2 §8 成就系统)
-- Single-user design: no user_id columns, RLS OFF (see 0002_fix_transactions_rls.sql).
-- user_streak is a single-row table. achievements has one row per unlocked badge.
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.

-- ── achievements ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  achievement_key text NOT NULL UNIQUE,   -- first_acorn / iron_heart / …
  unlocked_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE achievements DISABLE ROW LEVEL SECURITY;

-- ── user_streak (single row) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_streak (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_check_date date
);

ALTER TABLE user_streak DISABLE ROW LEVEL SECURITY;

-- Verify (output appears in the SQL Editor results pane):
SELECT 'achievements' AS tbl, count(*) FROM achievements
UNION ALL
SELECT 'user_streak', count(*) FROM user_streak;

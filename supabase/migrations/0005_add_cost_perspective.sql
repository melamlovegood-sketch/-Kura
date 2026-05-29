-- Migration: cost-perspective identity profile on user_settings
-- Feature:  代价视角 (SPEC_PHASE2 §1). Settings gains a 学生 / 工作党 identity so
-- the app can translate a price into a felt cost ("11 天伙食费", "工作 3 小时").
-- The settings store reads/writes these columns; without them a write that
-- includes them would 400 (PostgREST schema-cache mismatch — same as 0001).
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS identity            text
    CHECK (identity IN ('student', 'worker')),
  ADD COLUMN IF NOT EXISTS monthly_income      numeric(10,2),  -- 月生活费 / 月薪
  ADD COLUMN IF NOT EXISTS monthly_food_budget numeric(10,2),  -- 月伙食费（学生）
  ADD COLUMN IF NOT EXISTS daily_work_hours    numeric(4,1);   -- 日工作时长（工作党）

-- Verify the resulting columns (output appears in the SQL Editor results pane)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_settings'
  AND column_name IN ('identity', 'monthly_income', 'monthly_food_budget', 'daily_work_hours')
ORDER BY column_name;

-- Migration: 蹲蹲（手动价格追踪）— extend platform enum + (idempotently) re-assert
-- user_id + RLS on price_tracks / price_records.
--
-- WHY
--   The 蹲蹲 feature lets a user manually log a product's price over time (from a
--   screenshot or a typed line like "耐克跑鞋现在599"). The AI infers the platform.
--   The original price_platform enum only had ('jd','official','taobao_manual'),
--   which doesn't cover the four buckets the UI surfaces: 淘宝 / 京东 / 得物 / 其他.
--
--   user_id + RLS on both tables already landed in 0009 (the multi-user turn); the
--   re-asserts below are IDEMPOTENT and exist only so this migration is
--   self-contained — safe to run on a DB that somehow predates 0009.
--
-- IDEMPOTENT — safe to re-run. Run in Supabase Dashboard → SQL Editor.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside the SAME transaction that then
--       USES the new value. These statements only ADD values, so a plain batch run
--       in the SQL editor is fine.

-- ─── 1. Extend the price_platform enum ─────────────────────────────────────────
-- Keep the legacy values for back-compat; add the four the app now writes.
ALTER TYPE price_platform ADD VALUE IF NOT EXISTS 'taobao';
ALTER TYPE price_platform ADD VALUE IF NOT EXISTS 'dewu';
ALTER TYPE price_platform ADD VALUE IF NOT EXISTS 'other';
-- 'jd' already exists from the original enum.

-- ─── 2. user_id (idempotent — already added in 0009) ───────────────────────────
ALTER TABLE price_tracks  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE price_records ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── 3. RLS + one "user_own" policy each (idempotent) ──────────────────────────
ALTER TABLE price_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON price_tracks;
CREATE POLICY "user_own" ON price_tracks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE price_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON price_records;
CREATE POLICY "user_own" ON price_records USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

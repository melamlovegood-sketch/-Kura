-- Migration: multi-user auth (邮箱 + 密码) — user_id + RLS isolation
--
-- This is the architectural turn from a single-user app (RLS OFF, anon key
-- read/writes everything, see 0008) to a multi-user app where every row belongs
-- to exactly one `auth.users` account and RLS guarantees a user only ever sees
-- their own data.
--
-- WHAT THIS DOES
--   1. Wipes all pre-auth dev data — those rows have no owner and cannot be
--      backfilled (dev data is disposable, per the task brief).
--   2. Adds `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE` to every
--      table.
--   3. Swaps the two GLOBAL unique constraints (monthly_budgets.month,
--      achievements.achievement_key) for PER-USER ones — otherwise two accounts
--      could never share the same month / badge key.
--   4. Re-enables RLS on every table and adds one "user_own" policy each
--      (USING + WITH CHECK = auth.uid() = user_id) so SELECT/INSERT/UPDATE/DELETE
--      are all scoped to the caller.
--   5. Marks the two helper views `security_invoker = on` so they run RLS as the
--      querying user instead of the view owner — without this a logged-in user
--      would read EVERY user's budget / wish pool through the view.
--
-- IDEMPOTENT — safe to re-run. Run it in Supabase Dashboard → SQL Editor.
-- Requires Postgres 15+ (Supabase default) for `security_invoker`.
--
-- ⚠️ Also disable email confirmation: Dashboard → Authentication → Providers →
--    Email → turn OFF "Confirm email", so signUp logs the user in immediately.

-- ─── 1. Wipe disposable pre-auth data ──────────────────────────────────────────
-- CASCADE handles FK-linked child rows; RESTART IDENTITY is a no-op here (all PKs
-- are uuid) but kept for completeness.
TRUNCATE TABLE
  review_results, review_tasks, price_records, price_tracks,
  savings_records, wish_pools, wishlist_items, impulse_records,
  transactions, execution_sessions, brand_library, sop_rules,
  subscriptions, achievements, user_streak, personal_principles,
  monthly_budgets, user_settings
RESTART IDENTITY CASCADE;

-- ─── 2. Add user_id everywhere ─────────────────────────────────────────────────
-- Tables are empty (just truncated), so a NOT NULL column with no default is fine.
ALTER TABLE user_settings        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE monthly_budgets      ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE impulse_records      ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE wishlist_items       ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE wish_pools           ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE savings_records      ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE execution_sessions   ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE transactions         ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE sop_rules            ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE brand_library        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE price_tracks         ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE price_records        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_tasks         ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE review_results       ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE personal_principles  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE subscriptions        ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE achievements         ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_streak          ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── 3. Global → per-user unique constraints ───────────────────────────────────
-- monthly_budgets.month was UNIQUE globally; now one row per (user, month).
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_month_key;
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_user_month_key;
ALTER TABLE monthly_budgets ADD  CONSTRAINT monthly_budgets_user_month_key UNIQUE (user_id, month);

-- achievements.achievement_key was UNIQUE globally; now one row per (user, key).
-- The store upserts with onConflict 'user_id,achievement_key' to match this.
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_achievement_key_key;
ALTER TABLE achievements DROP CONSTRAINT IF EXISTS achievements_user_key_key;
ALTER TABLE achievements ADD  CONSTRAINT achievements_user_key_key UNIQUE (user_id, achievement_key);

-- ─── 4. Re-enable RLS + one "user_own" policy per table ─────────────────────────
-- Reverses 0008's blanket DISABLE. The policy is applied to ALL commands, so it
-- governs SELECT (USING) plus INSERT/UPDATE (WITH CHECK) in one shot.

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON user_settings;
CREATE POLICY "user_own" ON user_settings USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON monthly_budgets;
CREATE POLICY "user_own" ON monthly_budgets USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE impulse_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON impulse_records;
CREATE POLICY "user_own" ON impulse_records USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON wishlist_items;
CREATE POLICY "user_own" ON wishlist_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE wish_pools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON wish_pools;
CREATE POLICY "user_own" ON wish_pools USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE savings_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON savings_records;
CREATE POLICY "user_own" ON savings_records USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE execution_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON execution_sessions;
CREATE POLICY "user_own" ON execution_sessions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON transactions;
CREATE POLICY "user_own" ON transactions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE sop_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON sop_rules;
CREATE POLICY "user_own" ON sop_rules USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE brand_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON brand_library;
CREATE POLICY "user_own" ON brand_library USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE price_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON price_tracks;
CREATE POLICY "user_own" ON price_tracks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE price_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON price_records;
CREATE POLICY "user_own" ON price_records USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE review_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON review_tasks;
CREATE POLICY "user_own" ON review_tasks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE review_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON review_results;
CREATE POLICY "user_own" ON review_results USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE personal_principles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON personal_principles;
CREATE POLICY "user_own" ON personal_principles USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON subscriptions;
CREATE POLICY "user_own" ON subscriptions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON achievements;
CREATE POLICY "user_own" ON achievements USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE user_streak ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON user_streak;
CREATE POLICY "user_own" ON user_streak USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── 5. Views run RLS as the caller, not the owner ─────────────────────────────
-- Without this the JOINs in these views bypass the base-table RLS and leak every
-- user's rows. With security_invoker on, each view returns only the caller's data.
ALTER VIEW v_current_budget  SET (security_invoker = on);
ALTER VIEW v_active_wish_pool SET (security_invoker = on);

-- ─── Verify ────────────────────────────────────────────────────────────────────
-- Every table should now read relrowsecurity = t (true).
SELECT relname, relrowsecurity
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY relname;

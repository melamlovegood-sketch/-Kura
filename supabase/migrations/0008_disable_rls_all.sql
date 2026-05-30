-- Migration: disable RLS on EVERY remaining table (P0 root-cause fix)
--
-- Symptom: console floods with 401 Unauthorized on wish_pools / execution_sessions
--          / brand_library / sop_rules / savings_records / wishlist_items /
--          impulse_records / review_* / personal_principles … and the execution
--          layer throws `invalid input syntax for type uuid: ""` because
--          createSession() got a 401, returned no row, and the empty session id
--          was then sent to transactions.execution_session_id.
--
-- Cause:   this project is single-user with NO auth and NO user_id columns. The
--          embedded anon key is meant to read/write directly. Earlier migrations
--          only turned RLS off on transactions (0002), subscriptions (0006),
--          achievements + user_streak (0007). Every OTHER table still has RLS
--          ENABLED with no policy, so anon reads/writes are rejected (401/42501).
--
-- Fix:     bring all remaining tables in line with the single-user design by
--          disabling RLS. Idempotent — safe to run multiple times. Run it in
--          Supabase Dashboard → SQL Editor.

ALTER TABLE user_settings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_budgets      DISABLE ROW LEVEL SECURITY;
ALTER TABLE impulse_records      DISABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items       DISABLE ROW LEVEL SECURITY;
ALTER TABLE wish_pools           DISABLE ROW LEVEL SECURITY;
ALTER TABLE savings_records      DISABLE ROW LEVEL SECURITY;
ALTER TABLE execution_sessions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE sop_rules            DISABLE ROW LEVEL SECURITY;
ALTER TABLE brand_library        DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_tracks         DISABLE ROW LEVEL SECURITY;
ALTER TABLE price_records        DISABLE ROW LEVEL SECURITY;
ALTER TABLE review_tasks         DISABLE ROW LEVEL SECURITY;
ALTER TABLE review_results       DISABLE ROW LEVEL SECURITY;
ALTER TABLE personal_principles  DISABLE ROW LEVEL SECURITY;
-- already disabled by earlier migrations, repeated here so a fresh DB is fully
-- covered by running schema.sql + this single file:
ALTER TABLE transactions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        DISABLE ROW LEVEL SECURITY;
ALTER TABLE achievements         DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_streak          DISABLE ROW LEVEL SECURITY;

-- Verify: every relrowsecurity should read `f` (false).
SELECT relname, relrowsecurity
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY relname;

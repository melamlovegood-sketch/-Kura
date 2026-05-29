-- Migration: allow the anon key to write to transactions
-- Symptom: clicking 「确认记账」 does nothing — the card stays, no row is written.
-- Cause:   POST .../rest/v1/transactions → 401, code 42501,
--          "new row violates row-level security policy for table \"transactions\"".
--          RLS is ENABLED on transactions but no policy permits inserts, so every
--          write is rejected. (Reads via the v_current_budget view still worked,
--          which is why the failure was silent until insert.)
--
-- Design:  this project is single-user; tables carry NO user_id column and RLS is
--          intentionally left disabled — the embedded anon key reads/writes directly
--          (see the note in 0001_fix_user_settings.sql). transactions diverged from
--          that design, so this migration brings it back in line.
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.
--
-- NOTE: if other writes later fail the same way (42501 on impulse_records,
-- wishlist_items, monthly_budgets, savings_records, personal_principles, …),
-- apply the same `DISABLE ROW LEVEL SECURITY` to those tables.

ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;

-- Verify the result (output appears in the SQL Editor results pane):
-- relrowsecurity = false means RLS is off and anon inserts are allowed.
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'transactions';

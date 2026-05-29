-- Migration: add an optional shelf-life / expiry date to transactions
-- Feature:  保质期提醒 (SPEC_PHASE2 §9). Food / cosmetics / health purchases can
-- carry a 保质期; the app surfaces a Home reminder 7 days and 1 day before it.
-- The confirm card writes transactions.expiry_date; without this column that
-- write would 400 (PostgREST schema-cache mismatch — same failure mode as 0001).
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS expiry_date date;

-- Verify the resulting column (output appears in the SQL Editor results pane)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'expiry_date';

-- Migration: subscription tracker (SPEC_PHASE2 §2 订阅管理)
-- Subscriptions are recurring fixed costs. They live under 基础支出, auto-generate
-- one transaction per month on their billing day, and surface a Home reminder
-- 3 days before the charge.
--
-- This project is single-user: no user_id columns, RLS intentionally OFF (see
-- 0002_fix_transactions_rls.sql). New tables created here follow the same design.
--
-- This migration is IDEMPOTENT — safe to run multiple times. Run it in
-- Supabase Dashboard → SQL Editor.

-- ── 1. New enum value for the auto-generated transactions ──────────────────────
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the SAME transaction that adds
-- it. The SQL Editor runs each statement on its own, so this is fine. If you ever
-- get "unsafe use of new value", just run this one line by itself first.
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'subscription';

-- ── 2. subscriptions table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        text NOT NULL,
  amount      numeric(10,2) NOT NULL,
  billing_day smallint NOT NULL CHECK (billing_day BETWEEN 1 AND 31), -- 每月几号扣
  category    text NOT NULL DEFAULT 'other'
    CHECK (category IN ('streaming', 'tools', 'transport', 'other')), -- 流媒体/工具/出行/其他
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;

-- ── 3. link generated transactions back to their subscription ──────────────────
-- Used to detect "已为本月生成过扣款记录" so we never double-charge a month.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions (id) ON DELETE SET NULL;

-- Verify (output appears in the SQL Editor results pane):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'subscriptions'
ORDER BY ordinal_position;

-- Migration: 懒人五件套 — 蹲蹲目标价 + AI 预算建议表。
--
-- WHAT THIS DOES
--   1. price_tracks.target_price：蹲蹲的「目标价」。用户填了之后，每次追加新价格
--      记录时若 新价 <= target_price，主页推「到价提醒」卡。base schema.sql 里这一列
--      早已存在；这里用 ADD COLUMN IF NOT EXISTS 兜底那些先于 schema.sql 建库的环境，
--      保持 migration 自包含、可重复执行。
--   2. monthly_budget_plans：AI 生成的「下月预算建议」。预算自动延续(功能2)会查这张
--      表：若当月已自动复制上月预算、且存在一条针对本月的 AI 建议，主页推一条轻量
--      提示卡让用户决定是否微调。目前没有写入方(留给后续 AI 任务)，先把表建好，使
--      客户端的查询在真实 Supabase 上不会因表缺失而报错。
--
-- IDEMPOTENT — 可在 Supabase Dashboard → SQL Editor 重复执行。

-- ─── 1. 蹲蹲目标价 ──────────────────────────────────────────────────────────────
ALTER TABLE price_tracks ADD COLUMN IF NOT EXISTS target_price numeric(10,2);

-- ─── 2. AI 下月预算建议 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_budget_plans (
  id                  uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  month               text NOT NULL,           -- 建议针对的月份 'YYYY-MM'
  basic_life_limit    numeric(10,2),
  discretionary_limit numeric(10,2),
  reason              text,                     -- AI 给的一句话理由
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'dismissed')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS monthly_budget_plans_user_month_idx
  ON monthly_budget_plans (user_id, month);

ALTER TABLE monthly_budget_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON monthly_budget_plans;
CREATE POLICY "user_own" ON monthly_budget_plans
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

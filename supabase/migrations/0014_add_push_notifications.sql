-- Migration: PWA 推送通知 — push_subscriptions 表 + user_settings 通知开关。
--
-- WHAT THIS DOES
--   1. push_subscriptions: 每个浏览器/设备的 Web Push 订阅。一个用户可有多条
--      (多设备)。endpoint 全局唯一，所以重新订阅同一设备走 upsert(onConflict
--      'endpoint') 覆盖而不堆积。subscription 存完整的 PushSubscription JSON，
--      Edge Function(send-reminders) 用它向 web-push 发推。RLS user_own：客户端
--      只能读写自己的订阅；Edge Function 用 service role 跳过 RLS 读取全部。
--   2. user_settings 三个通知开关(默认开)：关掉的类型 Edge Function 直接跳过。
--
-- IDEMPOTENT — 可在 Supabase Dashboard → SQL Editor 重复执行。

-- ─── 1. push_subscriptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON push_subscriptions;
CREATE POLICY "user_own" ON push_subscriptions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── 2. user_settings 通知开关 ─────────────────────────────────────────────────
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_cooldown     boolean NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_subscription boolean NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_expiry       boolean NOT NULL DEFAULT true;

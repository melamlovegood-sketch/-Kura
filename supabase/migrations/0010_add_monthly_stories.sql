-- Migration: 月度复盘故事 (monthly review story)
--
-- One AI-generated narrative per (user, month). The story text plus the
-- aggregated snapshot it was built from are stored together so the embedded
-- "问我这个月的事" chat can rebuild its context without re-querying, and so the
-- same month is never regenerated (UNIQUE (user_id, month)).
--
-- Follows the multi-user conventions from 0009: user_id NOT NULL → auth.users,
-- RLS ON with a single "user_own" policy governing all commands.
--
-- IDEMPOTENT — safe to re-run. Run it in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS monthly_stories (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month       text NOT NULL,              -- 'YYYY-MM' of the narrated month
  story       text NOT NULL,              -- AI-generated narrative
  persona_key text,                       -- persona label at generation time (nullable)
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- aggregated data used for the story + chat context
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One story per user per month; the store upserts on this key when regenerating.
ALTER TABLE monthly_stories DROP CONSTRAINT IF EXISTS monthly_stories_user_month_key;
ALTER TABLE monthly_stories ADD  CONSTRAINT monthly_stories_user_month_key UNIQUE (user_id, month);

ALTER TABLE monthly_stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON monthly_stories;
CREATE POLICY "user_own" ON monthly_stories USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

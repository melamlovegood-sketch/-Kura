-- Migration: 复盘「一句话说说？」— optional free-text note on a review result.
--
-- WHY
--   ReviewCard lets the user pick frequency + worthiness; this adds an optional
--   one-liner (e.g. 「穿了一次」) captured at the same time. The monthly story then
--   prefers this raw quote over the frequency-derived phrase when narrating.
--
-- RLS: review_results already has its "user_own" policy (migration 0009); a new
-- column is automatically covered by the table-level policy, so nothing else is
-- needed. The idempotent re-assert below just keeps this migration self-contained.
--
-- IDEMPOTENT — safe to re-run in Supabase Dashboard → SQL Editor.

ALTER TABLE review_results ADD COLUMN IF NOT EXISTS usage_note text;

ALTER TABLE review_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_own" ON review_results;
CREATE POLICY "user_own" ON review_results USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

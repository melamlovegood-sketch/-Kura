-- Migration: 历史账单批量导入 — 去重唯一索引 + source 允许 'import'。
--
-- WHY
--   1. 导入页用 upsert(onConflict 'user_id,date,amount,description', ignoreDuplicates)
--      写库，反复导入同一份微信/支付宝账单不会产生重复记录。Postgres 的 ON CONFLICT
--      需要一个匹配这些列的唯一索引来推断冲突目标，这里把它建出来。
--      description 为 NULL 时 Postgres 视为互不冲突；导入记录的 description 始终有值。
--   2. transactions.source 原 CHECK 只允许 'screenshot' / 'text'。导入记录用 'import'
--      标记来源，便于区分手动记账与批量导入，需要放开这个约束。
--
-- IDEMPOTENT — 可在 Supabase Dashboard → SQL Editor 重复执行。

-- ─── 1. 去重唯一索引 ────────────────────────────────────────────────────────────
create unique index if not exists transactions_import_dedup_idx
  on transactions (user_id, date, amount, description);

-- ─── 2. source 允许 'import' ────────────────────────────────────────────────────
alter table transactions drop constraint if exists transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('screenshot', 'text', 'import'));

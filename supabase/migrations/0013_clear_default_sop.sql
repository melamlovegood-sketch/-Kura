-- Migration: 删除执行层 SOP 的 5 条默认 seed 规则。
--
-- WHY
--   schema.sql 早期给 sop_rules 灌了 5 条示例规则（裤子 / 上衣 / 搜索决策 / 品牌优先 /
--   计时器）。它们是产品占位文案，不该出现在真实用户的执行清单里——执行层 SOP 应由
--   用户自己沉淀。这里按标题精确删除这 5 条；用户自建的规则不受影响。
--
--   只按这 5 个标题删除（而非清空整表），所以即便用户已经加了同名以外的自定义规则也安全。
--
-- IDEMPOTENT — 可在 Supabase Dashboard → SQL Editor 重复执行。

DELETE FROM sop_rules
WHERE title IN ('裤子', '上衣', '搜索决策', '品牌优先', '计时器');

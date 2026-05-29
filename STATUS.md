# Kura 完成度报告

> 对照 `SPEC.md` 逐模块审计当前代码实现。
> 审计日期：2026-05-29 · 审计基准 commit：`8b74d32`

---

## 总览

| 模块 | 状态 |
| --- | --- |
| 0. 记账 | 部分完成 |
| 1. 月度预算 | 部分完成 |
| 2. 冲动过滤 | 完成 |
| 3. 待购清单 | 部分完成 |
| 4. 许愿池 | 部分完成 |
| 5. 执行层 | 部分完成 |
| 6. 价格追踪 | **未完成（完全缺失）** |
| 7. 复盘 | 完成 |
| 交互范式（AI 对话框） | 部分完成 |
| 主页布局 | 完成 |

已知三个 Bug（截图发送无反应 / JSON 暴露 / 切页状态重置）均已在 `8b74d32` 修复，详见末尾「已知 Bug 状态」。

---

## 0. 记账（基础数据层）
- **状态：部分完成**
- **已实现：**
  - AI 对话解析 → `routeIntent` 返回 `transaction` 模块数据（金额/描述/分类/主分类/日期）
  - `ConfirmTransactionCard` 可编辑确认卡（tap-to-edit、blur 保存）
  - `addTransaction()` 写库并返回 id；`addExecutionTransaction()` 从执行层落库（猜测分类）
  - 两级分类体系完整（`categories.ts` + `CategoryPicker`），与 SPEC 分类树一致
  - 支持文字 + 图片（截图）输入，`source` 字段记录来源
- **缺失/有问题：**
  - ❌ **截图未持久化**：`transactions` 表有 `image_url` 字段，但 `addTransaction` 不上传/不保存图片，截图仅发给 AI 解析后丢弃
  - ❌ **超市小票多分类按金额比例拆分** 未实现，一张截图只生成一条交易
  - ⚠️ AI 误判分类时只能在确认卡里改分类，无「一键改模块归属」（见交互范式）

---

## 1. 月度预算
- **状态：部分完成**
- **已实现：**
  - `BudgetCard` 两态（未设置 / 已设置进度条）+ 内联修改表单
  - `budget` store 查 `v_current_budget` view，实时计算 `basic_life_used` / `discretionary_used`
  - 主页两个大数字进度条，>80% 变琥珀色、≥100% 变红色
  - AI 对话可设置预算（`budget` 模块 → `BudgetConfirmCard`）
- **缺失/有问题：**
  - ❌ **AI 根据上月支出建议分配额度** 未实现（`ai_suggested` 字段存在但无生成逻辑）
  - ❌ **特殊月份备注（旅游月等）** 未实现，`note`/`total_income` 字段在 UI 中不可填
  - ⚠️ **「锁死感」强提醒** 仅做了颜色变化，没有 SPEC 要求的接近上限时的强提醒交互

---

## 2. 冲动过滤
- **状态：完成**
- **已实现：**
  - `impulse` store：`add`（按 `cooldownHours` 设 `expires_at`）/ `approve`（→ wishlist）/ `dismiss`
  - AI 解析填字段（item_name / estimated_price / season_tag / source）
  - 72h 冷静期可在设置页全局修改（默认 72h）
  - `ImpulseExpiredCard`（主页到期推送：还想要 / 不要了）
  - 清单页「冷静期中」区显示倒计时
  - 还想要 → 流入待购清单；不要了 → dismissed 不再出现
- **缺失/有问题：** 无明显缺失，符合 SPEC。

---

## 3. 待购清单（含许愿池待选）
- **状态：部分完成**
- **已实现：**
  - `wishlist` store：`add` / `pin`（→ wish_pool）/ `dismiss` / `markNudged`
  - AI 预填 season_tag / need_intensity / worthiness_score / worthiness_reason
  - `Wishlist` 页展示待购项（估价、季节、值得度星级、理由）
  - Pin 一件商品作为许愿池 focus；× 删除
  - `WishlistNudgeCard`：主页推送「你还想要 XX 吗」，优先推 7 天未回应项
- **缺失/有问题：**
  - ❌ **手动调整 priority 排序 UI** 未实现（`priority` 字段存在，无拖拽/上下移交互）
  - ⚠️ **点「还想要」→ priority 加权** 未实现，`onKeep` 仅调用 `markNudged` 更新推送时间，不增加权重

---

## 4. 许愿池
- **状态：部分完成**
- **已实现：**
  - `wishpool` store：`addSavings`（无确认卡，直接累积）、查 `v_active_wish_pool`
  - 「忍住了」AI 解析金额 + 描述 → 自动累积进度
  - `WishPoolCard`：琥珀色进度条 + 数字 count-up 动画（`useCountUp` ease-out）+ 金额变化时 shadow pulse 仪式感
  - 达到目标金额自动写 `completed_at`，卡片显示「目标达成 ✓」
  - 同时只有一个 focus（由 wishlist pin 控制）
- **缺失/有问题：**
  - ⚠️ **达标后「解锁购买提示」** 仅显示「目标达成 ✓」徽标，没有引导进入执行层/购买的提示动作
  - ⚠️ 完成后无「换下一个 focus」的显式流程（completed 后卡片仍占位，需手动再 pin）

---

## 5. 执行层
- **状态：部分完成**
- **已实现：**
  - 完整状态机：setup → timing → expired → recording → done
  - 倒计时组件（最后 60s 变红 + 进度条）
  - 品牌库：按品类筛选、按 weight 排序展示、内联添加品牌
  - SOP 规则折叠面板（seed 了 5 条默认规则）
  - 购买完成 → 写交易 + 触发复盘任务（7d/30d）
  - 「提前决策」可跳过计时
- **缺失/有问题：**
  - ❌ **计时时长用户可改** 未实现，`DEFAULT_DURATION` 硬编码 15min，无设置入口（SPEC 要求「默认 15min，用户可改」）
  - ❌ **品牌库冷启动引导对话**（第一次进 app 问「你信任哪些品牌」）未实现，品牌只能在执行页手动逐个添加
  - ❌ **SOP 用户可编辑** 未实现，规则为只读展示（SPEC 要求「固定内容，用户可编辑」）

---

## 6. 价格追踪
- **状态：未完成（完全缺失）**
- **已实现：**
  - 仅数据库层：`price_tracks` / `price_records` 表 + `price_platform` 枚举已在 schema 中定义
- **缺失/有问题：**
  - ❌ 无 store、无页面、无组件、无任何 UI 入口
  - ❌ 京东/官网爬虫未实现
  - ❌ 淘宝手动记录券后价未实现
  - ❌ 价格降到目标价时主页提示未实现
  - 说明：属 SPEC「第四阶段」，按规划尚未开发

---

## 7. 复盘
- **状态：完成**
- **已实现：**
  - `review` store：`createTasksForPurchase`（购买后 +7d/+30d 两条任务）
  - `load` 只拉 `status=pending` 且已到期（`due_at <= now`）的任务
  - `ReviewCard`：两题（使用频率 + 值得度），两项选满自动确认（约 5 秒）
  - `complete` 写 `review_results` + 反哺品牌库权重（worth → weight+1，regret → weight-1）
  - 主页待处理卡按优先级展示（过期冲动 > 复盘 > 清单提醒）
- **缺失/有问题：**
  - ⚠️ 权重反哺依赖 `task.brand` 与品牌库精确匹配（大小写不敏感），录入购买时未选品牌则不反哺——属预期行为，非 Bug

---

## 交互范式（AI 对话框）
- **状态：部分完成**
- **已实现：**
  - 统一对话框（文字输入 + 图片上传按钮 + 拖拽 `ImageDropZone`），固定底部
  - 多模态：文字 + 图片统一走 `routeIntent`，4 个可插拔适配器（Qwen/GPT/Claude/Gemini）
  - 意图路由分发到 transaction / impulse / wishlist / wish_pool / budget / execution / principles / unknown
  - AI 做初稿、用户确认/纠错（确认卡可编辑）
- **缺失/有问题：**
  - ❌ **AI 判断错误时的「一键修改模块归属」轻量纠错** 未实现。用户只能取消当前卡片重新输入，无法把误判到 A 模块的内容一键改投到 B 模块
  - ⚠️ `execution` 意图在主页 dispatch 的 `switch` 中无 case 处理（路由能识别但主页不跳转执行层）

---

## 主页布局
- **状态：完成**
- **已实现：** 自上而下 = 预算进度条 → 许愿池进度条 → 待处理卡片区（三类交替，每次一条）→ 固定底部对话框，与 SPEC 建议布局一致。
- **缺失/有问题：** 无明显偏差。

---

## 已知 Bug 状态（均已修复，commit `8b74d32`）

1. ✅ **截图上传发送无反应** — 原因：`routeIntent` 内部失败被裸 `console.error` 吞掉，UI 无反馈。已修复：错误上抛并以友好文案展示；Qwen 流读取增强（200 body 内的 API error 重新抛出、`delta.content` 兼容数组分片）。
2. ✅ **AI 返回 JSON 暴露给用户** — 原因：原始结构化 JSON 被直接流式渲染进聊天气泡。已修复：不再把流接到 UI，仅显示「正在分析」指示器，最终只渲染解析后的确认卡 / 友好 `display_text`。
3. ✅ **切换页面状态重置** — 原因：Zustand store 未持久化，刷新/重开丢数据。已修复：对 budget / impulse / wishlist / wishpool / execution / review / principles 七个 store 包裹 `persist` 中间件，localStorage 即时恢复 + Supabase 后台刷新保鲜。

---

## 数据库迁移状态

> 迁移文件在 `supabase/migrations/`，按编号顺序在 Supabase Dashboard → SQL Editor 执行。
> 线上验证日期：2026-05-29（用 anon key 实测，非仅看文件）。

| 迁移 | 内容 | 线上状态 |
| --- | --- | --- |
| `0001_fix_user_settings.sql` | 补齐 `user_settings` 列（`cooldown_hours` / `ai_provider` / `ai_model` / `ai_api_key` / `theme` / `created_at` / `updated_at`）+ `theme` CHECK 约束 + 保证单行 | ✅ **已应用并验证** |
| `0002_fix_transactions_rls.sql` | `ALTER TABLE transactions DISABLE ROW LEVEL SECURITY`（修复确认记账 401 / 42501） | ✅ **已应用并验证** |
| `0003_add_timer_minutes.sql` | `ALTER TABLE user_settings ADD COLUMN timer_minutes`（执行层默认计时时长，默认 15min，用户可改） | ⏳ **待应用**（在 SQL Editor 执行） |

**验证方式：**
- 0001 — 一次性 SELECT 全部新增列返回 200（缺列会 400）；`user_settings` 行数 = 1；`theme=warm`、`ai_api_key` 已设置。
- 0002 — 用之前会触发 42501 的同形 insert 实测：写入返回 **201**，清理 DELETE 成功，复查无残留测试行。
- 0003 — 应用后 SELECT `timer_minutes` 返回 200 且默认值为 15；设置页保存计时时长应返回 200（未应用时含该字段的写入会 400）。

> 重建数据库时：先跑 `schema.sql`，再按 0001 → 0002 → 0003 顺序应用迁移，即可复现完整可用状态。

---

## 下一步建议（按 SPEC 阶段优先级）

- **补全第三阶段细节**：执行层计时时长可调、SOP 可编辑、品牌库冷启动引导
- **补全第二阶段细节**：待购清单 priority 手动排序 + 「还想要」加权、许愿池达标后的购买引导
- **第四阶段（全新）**：价格追踪（store + 页面 + 京东/官网爬虫 + 淘宝手动 + 降价提示）、AI 预算建议、「你还想要吗」推送间隔优化
- **交互纠错**：AI 误判时的一键改模块归属
- **记账增强**：截图持久化（`image_url`）、超市小票多分类按金额比例拆分

> 报告结束，等待你的指令，未自行开始修复。

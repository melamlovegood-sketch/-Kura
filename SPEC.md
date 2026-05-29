# Kura — 项目交接文档

## 项目定位

**Kura**（日语"蔵"，仓库/收着）是一个个人购物决策与消费感知 PWA 应用。

核心理念：**重建金钱感知 + 提速购物决策**。不是反消费，是消费得更值。

目标用户：用户本人（单用户），未来可能开放多用户，但当前阶段不考虑。

---

## 交互范式（最重要）

**所有录入入口 = 一个对话框（文字输入 + 图片上传按钮）**

- 用户说话或上传截图，AI 解析意图，自动分发到对应模块并填写字段
- AI 做初稿，用户只做纠错，不需要用户主动填任何表单
- 所有 AI 接口统一支持文字 + 图片（多模态），不区分入口
- 没有语音输入，只有文字输入框

意图识别示例：
- "刚买了一杯奶茶28块" → 记账，日常分类
- "种草了一双鞋大概300" → 冲动记录，自动设置72h冷静期
- "忍住了一顿海底捞大概120" → 许愿池累积
- "决定买那双鞋了" → 进执行层
- 上传外卖订单截图 → 记账，AI解析金额+商品+分类

AI 判断错误时，提供轻量纠错机制（用户可一键修改模块归属），不需要重新输入。

---

## 七个模块详细说明

### 0. 记账（基础数据层）

**作用**：所有其他模块的数据地基，支撑预算统计、AI建议、复盘触发。

**录入方式**：
- 文字输入：说一句话，AI解析
- 图片上传：支付宝/微信支付截图（日常小额消费）、外卖/快递订单页截图

**字段**：
```
Transaction {
  id
  date
  amount
  category        // 细分类（见分类体系）
  category_main   // 主分类：基础生活 | 可支配消费（AI自动归）
  description     // AI解析的商品/消费描述
  source          // 截图 | 文字
  image_url       // 截图存储路径（可选）
  created_at
}
```

**分类体系**：
```
基础生活
  ├── 食堂（基础餐饮，食堂消费）
  ├── 交通
  └── 日用物资（洗发水、沐浴露、洗衣液等消耗品）

可支配消费
  ├── 日常（外卖、奶茶、聚餐、线下超市改善伙食、订阅如88VIP等）
  ├── 网购（淘宝、京东等平台购物）
  ├── 娱乐（电影、演出）
  └── 其他
```

超市小票同时含多个分类时，AI 按金额比例拆分。

**主页展示**：只显示两个大数字——基础生活已用/额度、可支配消费已用/额度。细分类在明细页查看。

---

### 1. 月度预算

**字段**：
```
MonthlyBudget {
  id
  month           // YYYY-MM
  total_income
  basic_life_limit      // 基础生活额度
  discretionary_limit   // 可支配消费额度（含外卖+购物共享池）
  basic_life_used       // 从记账模块实时计算
  discretionary_used    // 从记账模块实时计算
  note            // 特殊月份备注（如"旅游月"）
  ai_suggested    // boolean，是否采用AI建议
  created_at
}
```

**逻辑**：
- 用户每月手动设定或让AI根据上月支出建议分配
- 可支配额度接近上限时主页出现强提醒（锁死感）
- 特殊月份（旅游等）单独调整当月额度
- AI建议可手动覆盖

---

### 2. 冲动过滤

**字段**：
```
ImpulseRecord {
  id
  item_name
  estimated_price
  season_tag      // 常年 | 夏季 | 冬季 | 特定场合（AI预填，用户可改）
  source          // 在哪里看到的（AI解析或用户说）
  recorded_at
  expires_at      // recorded_at + 72h（默认，可在设置全局修改）
  status          // pending | approved（还想要）| dismissed（不要了）
}
```

**逻辑**：
- 用户说话或截图，AI解析填入字段
- 72h冷静期倒计时（全局设置，默认72h，用户可改）
- 到期后在主页推送极简卡片：还想要 / 不要了
- 点"还想要" → 自动流入待购清单
- 点"不要了" → 记录dismissed，不再出现

---

### 3. 待购清单（含许愿池待选列表）

**字段**：
```
WishlistItem {
  id
  item_name
  category        // 商品品类
  estimated_price
  season_tag      // 常年 | 夏季 | 冬季 | 特定场合（AI预填）
  added_at        // 从冲动过滤流入的时间
  priority        // 用户手动排序（整数）
  need_intensity  // AI分析需求强度（1-10）
  worthiness_score // AI分析值得度（1-10）
  worthiness_reason // AI分析理由（需求持续时长+使用场景宽窄+季节匹配度）
  is_focus        // boolean，是否为许愿池当前focus目标
  last_nudged_at  // 最近一次"你还想要吗"推送时间
  status          // active | purchased | dismissed
}
```

**逻辑**：
- 从冲动过滤自动流入，或用户直接对话添加
- AI自动预填season_tag、need_intensity、worthiness_score（用户可改）
- 用户手动调整priority为主，AI建议为辅
- 按月预算逐步消化
- 主页定期推送"你还想要吗"——每次一条，优先推加入时间久远的
  - 点"还想要" → priority加权
  - 点"不想了" → status改为dismissed
- 无数量上限

---

### 4. 许愿池

**字段**：
```
WishPool {
  id
  focus_item_id   // 关联WishlistItem.id，当前focus目标
  target_amount   // 目标金额（=focus商品估价）
  saved_amount    // 已攒金额（从savings_records计算）
  savings_records // 忍住记录数组（见下）
  created_at
  completed_at    // 达到目标金额的时间
}

SavingsRecord {
  id
  wish_pool_id
  amount          // 忍住的金额
  description     // 忍住了什么（AI解析，如"海底捞120"）
  recorded_at
}
```

**逻辑**：
- 从待购清单 pin 一个商品作为 focus（同时只有一个focus）
- 用户说"忍住了一顿外卖50"，AI解析金额+描述，累积进savings_records
- 进度条可视化（saved_amount / target_amount）
- 达到目标金额解锁购买提示
- **UI重点**：进度条涨的动画要有仪式感，即时正反馈，打开→输入金额→看进度条涨，最多两步
- 许愿池是欲望替代机制：用户有即时消费冲动时，打开app看进度条，多巴胺可部分抵消冲动

---

### 5. 执行层

**字段**：
```
ExecutionSession {
  id
  category        // 用户选择的品类
  timer_duration  // 计时时长（默认15min，用户可改）
  started_at
  ended_at
  decision        // bought | skipped | undecided
  item_purchased  // 购买了什么（可选，关联记账）
}

SOPRule {
  id
  title
  content
  order
}

BrandLibrary {
  id
  category        // 品类
  brand_name
  weight          // 权重分（初始由冷启动对话设定，动态调整）
  note            // 用户备注（如"线下优先"、"闲鱼找二手"）
  created_at
  updated_at
}
```

**逻辑**：
- 用户选品类 → 自动显示该品类的信任品牌（按weight排序）
- 设置计时器（默认15min）开始计时
- 时间到强制决策，不拖延
- SOP规则随时查阅（固定内容，用户可编辑）

**品牌库冷启动**：
- 第一次进app，引导用户对话："你平时买衣服信任哪些品牌？"
- AI解析填入品牌库，用户确认
- 初始SOP内容来自用户自己总结的购物规则（见SOP内容）

**SOP默认内容**（用户可编辑）：
1. 裤子只去线下试穿，满意再线上买
2. 上衣优先有品牌背书的；贵的好牌子去闲鱼找二手
3. 搜索品类时看AI总结，前几个推荐快速决断；决断不了就都买货比三家
4. 优先从品牌库里选信任品牌
5. 购物前设定计时器，时间到立刻下单当前最优选

---

### 6. 价格追踪

**字段**：
```
PriceTrack {
  id
  wishlist_item_id  // 关联WishlistItem
  item_name
  target_price      // 用户设定的可接受价格
  current_price     // 最新抓取价格
  price_history     // 价格记录数组
  source_url        // 追踪的商品链接
  platform          // jd | official | taobao_manual
  last_checked_at
  created_at
}

PriceRecord {
  id
  price_track_id
  price
  is_manual       // 淘宝手动记录
  recorded_at
}
```

**逻辑**：
- 追踪对象：待购清单里的商品
- 京东/官网：爬虫自动追踪
- 淘宝：手动记录券后价（因券后价更准确）
- 目标不是最低价，是建立价格认知
- 价格降到目标价时主页提示

---

### 7. 复盘

**字段**：
```
ReviewTask {
  id
  transaction_id  // 关联记账（购买记录）
  item_name
  brand
  category
  due_at          // 购买后7天 或 30天
  review_type     // day7 | day30
  status          // pending | completed
  created_at
}

ReviewResult {
  id
  review_task_id
  usage_frequency // everyday | sometimes | rarely
  worthiness      // worth | okay | regret
  completed_at
}
```

**逻辑**：
- 执行层购买完成时，自动生成两条ReviewTask（7天后、30天后）
- 主页常驻复盘模块，优先展示"买了超过7天未复盘"的条目
- 每次展示一条，两题点击完成（约5秒）
- 复盘结果反哺品牌库权重：
  - worthiness = worth → 对应brand的weight +1
  - worthiness = regret → 对应brand的weight -1

---

## 数据关联总图

```
记账（Transaction）
  ↓ 实际支出
月度预算（MonthlyBudget）← 计算已用额度

冲动过滤（ImpulseRecord）
  ↓ 还想要
待购清单（WishlistItem）
  ↓ pin一个
许愿池（WishPool）← 忍住记录累积
  ↓ 决定买
执行层（ExecutionSession）→ 调用品牌库（BrandLibrary）
  ↓ 购买完成
记账（Transaction）+ 触发复盘任务（ReviewTask）
  ↓ 复盘结果
品牌库权重更新（BrandLibrary.weight）

待购清单（WishlistItem）→ 价格追踪（PriceTrack）
```

---

## 主页布局（建议）

从上到下：
1. **预算进度条** — 基础生活 xx/xx · 可支配 xx/xx（两个大数字）
2. **许愿池进度条** — focus商品名 + 进度条 + 已攒/目标
3. **待处理卡片区** — 以下三类交替出现，每次各一条：
   - 冷静期到期卡片："还想要 / 不要了"
   - 复盘卡片："用了多久？值不值？"
   - 待购清单提醒："你还想要XX吗？"
4. **对话框** — 固定在底部，文字输入 + 图片上传按钮

---

## 技术方向

- **形态**：PWA
- **前端**：React（用户有PWA开发经验）
- **AI**：Anthropic Claude API（claude-sonnet，多模态，支持文字+图片）
- **云同步**：Supabase（免费额度够单用户使用）
- **爬虫**：京东/官网价格追踪（淘宝手动）

---

## 开发优先级建议

**第一阶段（核心闭环）**：
记账（截图解析）→ 月度预算 → 主页预算展示

**第二阶段（过滤+计划）**：
冲动过滤 → 待购清单 → 许愿池

**第三阶段（执行+复盘）**：
执行层 + 品牌库冷启动 → 复盘模块

**第四阶段（补全）**：
价格追踪 → "你还想要吗"推送 → AI预算建议

---

## 设计原则

1. **AI做初稿，用户只做纠错** — 所有录入AI先填，用户确认或改一个字段
2. **操作步骤越少越好** — 许愿池累积最多两步，复盘两题五秒
3. **主页只展示最重要的数字** — 两个预算大数字 + 一个许愿池进度条
4. **仪式感** — 许愿池进度条涨的动画要有即时正反馈
5. **克制** — 不做社交、不做成就系统、不做复杂统计图表

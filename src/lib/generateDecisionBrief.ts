import { supabase } from '@/lib/supabase'
import { formatAmount } from '@/lib/utils'
import type { AIAdapter, AIMessage } from '@/lib/ai/types'
import type { BudgetData, WishPoolData } from '@/types/db'
import type { BrandEntry, SOPRule } from '@/store/execution'

// ─── Mode ──────────────────────────────────────────────────────────────────────

export type DecisionMode = 'fast' | 'research'

// 品类含「电子」「数码」(及常见电子品类) → 研究模式
const RESEARCH_KEYWORDS = [
  '电子', '数码', '手机', '电脑', '笔记本', '耳机', '相机', '镜头', '显示器',
  '平板', '键盘', '鼠标', '手表', '智能', '家电', '主机', '显卡', '路由',
]

/**
 * 模式建议（SPEC_PHASE3 §4.1）：估价 > ¥500 或品类含电子 / 数码 → 研究模式，
 * 否则快速决策模式。纯函数，执行层进入时立即可算，无需等 AI。
 */
export function suggestMode(category: string, estimatedPrice: number | null): DecisionMode {
  if (estimatedPrice != null && estimatedPrice > 500) return 'research'
  if (RESEARCH_KEYWORDS.some((k) => category.includes(k))) return 'research'
  return 'fast'
}

// ─── Aggregated context ─────────────────────────────────────────────────────────

export type Worthiness = 'worth' | 'okay' | 'regret'

export const WORTHINESS_LABEL: Record<Worthiness, string> = {
  worth: '值',
  okay: '还行',
  regret: '后悔',
}

export interface PurchaseHistory {
  /** Most recent bought session of this category. */
  lastPurchase: { item: string | null; relativeTime: string } | null
  /** Most recent review verdict for this category. */
  lastVerdict: Worthiness | null
  /** Same-category regret rate (deduped one-verdict-per-purchase). */
  regret: { rate: number; total: number; regretCount: number } | null
}

export interface ExecutionContext {
  category: string
  estimatedPrice: number | null
  /** 本月还能花 — 可支配剩余额度. null when no budget set. */
  discretionaryRemaining: number | null
  /** Top brands by weight (already weight-sorted), capped to 3. */
  topBrands: { name: string; weight: number }[]
  /** First SOP rules, capped to 2. */
  sopRules: { title: string; content: string }[]
  /** Active wish-pool goal, if any. */
  wishPool: { name: string; saved: number; target: number } | null
  history: PurchaseHistory
}

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return '今天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

/** Synchronous slice of the context from already-loaded stores. */
interface StoreSlice {
  budget: BudgetData | null
  brands: BrandEntry[]
  sopRules: SOPRule[]
  pool: WishPoolData | null
}

/**
 * Build the full execution context for a category. Pulls budget / brands / SOP /
 * wish-pool from the already-loaded stores (synchronous) and queries Supabase for
 * same-category purchase history + regret rate.
 */
export async function gatherExecutionContext(
  category: string,
  estimatedPrice: number | null,
  stores: StoreSlice,
): Promise<ExecutionContext> {
  const lower = category.trim().toLowerCase()

  const discretionaryRemaining = stores.budget
    ? stores.budget.discretionary_limit - stores.budget.discretionary_used
    : null

  const topBrands = [...stores.brands]
    .filter((b) => b.category.toLowerCase() === lower)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((b) => ({ name: b.brand_name, weight: b.weight }))

  const sopRules = stores.sopRules
    .slice(0, 2)
    .map((r) => ({ title: r.title, content: r.content }))

  const wishPool = stores.pool
    ? { name: stores.pool.focus_item_name, saved: stores.pool.saved_amount, target: stores.pool.target_amount }
    : null

  const history = await gatherHistory(category)

  return { category, estimatedPrice, discretionaryRemaining, topBrands, sopRules, wishPool, history }
}

async function gatherHistory(category: string): Promise<PurchaseHistory> {
  const lower = category.trim().toLowerCase()

  // 同品类最近一次购买 — execution_sessions links the free-text Chinese category
  // to an actual bought decision (transactions itself only stores enum categories).
  const sessionsQuery = supabase
    .from('execution_sessions')
    .select('item_purchased, ended_at')
    .ilike('category', category.trim())
    .eq('decision', 'bought')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)

  // 同品类复盘后悔率 — fetch recent review verdicts and filter / dedupe in JS so a
  // mismatch in casing or PostgREST embedded-filter quirks can't silently drop data.
  const reviewsQuery = supabase
    .from('review_results')
    .select('worthiness, completed_at, review_tasks!inner(category, transaction_id)')
    .order('completed_at', { ascending: false })
    .limit(300)

  const [sessionsRes, reviewsRes] = await Promise.all([sessionsQuery, reviewsQuery])

  let lastPurchase: PurchaseHistory['lastPurchase'] = null
  const session = sessionsRes.data?.[0] as { item_purchased: string | null; ended_at: string } | undefined
  if (session?.ended_at) {
    lastPurchase = { item: session.item_purchased, relativeTime: relativeTime(session.ended_at) }
  }

  type ReviewRow = {
    worthiness: Worthiness
    completed_at: string
    review_tasks: { category: string | null; transaction_id: string | null } | null
  }
  const rows = ((reviewsRes.data as ReviewRow[] | null) ?? []).filter(
    (r) => r.review_tasks?.category?.toLowerCase() === lower,
  )

  let lastVerdict: Worthiness | null = rows[0]?.worthiness ?? null

  // One purchase spawns day7 + day30 tasks; dedupe by transaction_id (keeping the
  // most recent verdict, since rows are ordered desc) so a purchase counts once.
  const seen = new Set<string>()
  const verdicts: Worthiness[] = []
  for (const r of rows) {
    const key = r.review_tasks?.transaction_id ?? `t:${r.completed_at}`
    if (seen.has(key)) continue
    seen.add(key)
    verdicts.push(r.worthiness)
  }

  let regret: PurchaseHistory['regret'] = null
  if (verdicts.length > 0) {
    const regretCount = verdicts.filter((w) => w === 'regret').length
    regret = { rate: regretCount / verdicts.length, total: verdicts.length, regretCount }
  }

  return { lastPurchase, lastVerdict, regret }
}

/**
 * Duration (seconds) of the previous same-category bought session, excluding the
 * current one. Used by the wrap-up card for "比上次快了 X 分钟". null when there's
 * no comparable history.
 */
export async function getPreviousSessionDuration(
  category: string,
  excludeSessionId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('execution_sessions')
    .select('id, started_at, ended_at')
    .ilike('category', category.trim())
    .eq('decision', 'bought')
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(2)

  const rows = (data as { id: string; started_at: string | null; ended_at: string | null }[] | null) ?? []
  const prev = rows.find((r) => r.id !== excludeSessionId)
  if (!prev?.started_at || !prev.ended_at) return null

  const secs = Math.round((new Date(prev.ended_at).getTime() - new Date(prev.started_at).getTime()) / 1000)
  return secs > 0 ? secs : null
}

// ─── Prompt building ─────────────────────────────────────────────────────────────

/** Human-readable fact block, shared by the brief and the chat assistant. */
export function describeContext(ctx: ExecutionContext): string {
  const lines: string[] = []
  lines.push(`品类：${ctx.category}`)
  lines.push(`预估价格：${ctx.estimatedPrice != null ? formatAmount(ctx.estimatedPrice) : '未知'}`)
  lines.push(
    `本月还能花（可支配剩余）：${ctx.discretionaryRemaining != null ? formatAmount(ctx.discretionaryRemaining) : '未设置预算'}`,
  )

  if (ctx.history.lastPurchase) {
    const item = ctx.history.lastPurchase.item ? `（${ctx.history.lastPurchase.item}）` : ''
    lines.push(`上次买${ctx.category}：${ctx.history.lastPurchase.relativeTime}${item}`)
  } else {
    lines.push(`上次买${ctx.category}：无记录`)
  }
  if (ctx.history.lastVerdict) lines.push(`上次复盘结论：${WORTHINESS_LABEL[ctx.history.lastVerdict]}`)
  if (ctx.history.regret) {
    const pct = Math.round(ctx.history.regret.rate * 100)
    lines.push(`同品类后悔率：${pct}%（${ctx.history.regret.total} 笔里 ${ctx.history.regret.regretCount} 笔后悔）`)
  } else {
    lines.push('同品类后悔率：无足够复盘数据')
  }

  lines.push(
    ctx.topBrands.length
      ? `信任品牌：${ctx.topBrands.map((b) => `${b.name}(${b.weight})`).join(' · ')}`
      : '信任品牌：暂无',
  )

  if (ctx.sopRules.length) {
    const sop = ctx.sopRules
      .map((r) => (r.content && r.content !== r.title ? `${r.title}—${r.content}` : r.title))
      .join('；')
    lines.push(`购物原则(SOP)：${sop}`)
  } else {
    lines.push('购物原则(SOP)：暂无')
  }

  if (ctx.wishPool) {
    lines.push(
      `许愿池目标：${ctx.wishPool.name}（已攒 ${formatAmount(ctx.wishPool.saved)} / ${formatAmount(ctx.wishPool.target)}）`,
    )
  }

  return lines.join('\n')
}

const BRIEF_SYSTEM = `你是 Kura 执行层的「决策简报」助手。用户即将做一个购买决策，进入了执行层。
根据下面提供的结构化数据，生成一份让用户 10 秒读完、0 输入成本的开场简报。

要求：
1. 只陈述数据中真实存在的事实，绝不编造任何数字、品牌或历史。标注「无记录 / 无 / 未设置」的项直接整段省略，不要写出来。
2. 用自然语言分段，参考以下结构（有数据才写该段）：
   你要买：<品类>
   预算上限 / 本月还能花：<金额>
   （空行）
   你的历史：
   <上次购买时间 + 复盘结论>
   <同品类后悔率>
   （空行）
   信任品牌：<品牌(权重) · …>
   （空行）
   你的 SOP 提醒你：
   <精炼成一两句>
   （空行）
   本次建议：<模式 + 时长>
3. 中文，简洁，短句，不要用 markdown 符号（不要 #、*、-、>、表格），就是纯文本分段。
4. 语气像一个熟悉你消费习惯的朋友，冷静、克制、不说教。`

/**
 * Generate the opening decision brief as a natural-language paragraph (not a
 * hard-coded template). Streams via onChunk; returns the full text.
 */
export async function generateDecisionBrief(
  adapter: AIAdapter,
  ctx: ExecutionContext,
  mode: DecisionMode,
  timerMinutes: number,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const modeLine =
    mode === 'research'
      ? '系统建议模式：研究模式（无倒计时，先做完功课再下单）'
      : `系统建议模式：快速决策模式（${timerMinutes}min 倒计时）`

  const body = `${describeContext(ctx)}\n${modeLine}`

  const messages: AIMessage[] = [
    { role: 'system', content: BRIEF_SYSTEM },
    { role: 'user', content: body },
  ]

  return adapter.streamChat(messages, onChunk, signal)
}

const CHECKLIST_SYSTEM = `你是 Kura 执行层的研究助手。用户要买一件需要做功课的商品，请生成一份「买之前你需要做的事」清单。
要求：
1. 4~6 条，每条是一个可勾选的具体动作，针对该品类（如评测、比价、退换货、二手价、试用 / 试穿等）。
2. 每条 10 个汉字以内，简洁祈使句，不要编号、不要标点结尾、不要 markdown 符号。
3. 只输出清单，每行一条，不要任何额外说明文字。`

const DEFAULT_CHECKLIST = ['看一篇评测', '比较 3 个选项', '确认退换货政策', '查二手价']

/**
 * AI-generated research checklist for a category. Returns plain item strings.
 * Falls back to a sensible default list when the AI is unavailable or returns
 * nothing usable.
 */
export async function generateResearchChecklist(
  adapter: AIAdapter,
  category: string,
  estimatedPrice: number | null,
  signal?: AbortSignal,
): Promise<string[]> {
  const priceText = estimatedPrice != null ? `，预估 ${formatAmount(estimatedPrice)}` : ''
  const messages: AIMessage[] = [
    { role: 'system', content: CHECKLIST_SYSTEM },
    { role: 'user', content: `品类：${category}${priceText}` },
  ]

  let raw = ''
  try {
    raw = await adapter.streamChat(messages, () => {}, signal)
  } catch {
    return DEFAULT_CHECKLIST
  }

  const items = raw
    .split('\n')
    .map((l) => l.replace(/^[\s\-*•·\d.、)]+/, '').replace(/[。.]$/, '').trim())
    .filter((l) => l.length > 0 && l.length <= 20)
    .slice(0, 6)

  return items.length > 0 ? items : DEFAULT_CHECKLIST
}

const CHAT_SYSTEM = `你是 Kura 执行层的「决策助手」。用户正处在购买决策的临场时刻，把纠结丢给你。
你拥有这个用户此刻的完整上下文（见下）。请给出针对「这个用户此刻处境」的具体建议，不是通用建议。

原则：
1. 结合用户的 SOP、品牌库权重、许愿池目标、本月剩余预算、同品类历史与后悔率来回答。
2. 用户要结论就直接给结论，并简短说理由；要比较就分点对比。
3. 中文，简洁，口语，不堆砌；不要 markdown 标题，可用简单换行。
4. 只用上下文里真实的数据，不编造价格 / 历史；不确定就说不确定。如果有图片，先简要识别再结合上下文判断。`

/** System prompt for the persistent decision-chat, embedding the live context. */
export function buildDecisionChatSystemPrompt(ctx: ExecutionContext): string {
  return `${CHAT_SYSTEM}\n\n--- 当前决策上下文 ---\n${describeContext(ctx)}\n---`
}

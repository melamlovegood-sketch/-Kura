import { db } from '@/lib/db'
import { analyzePersona, PERSONAS, type PersonaKey } from '@/lib/personaAnalysis'
import type { AIAdapter, AIMessage } from '@/lib/ai/types'

/**
 * 月度复盘故事 — aggregate one month of activity into a compact data snapshot, then
 * have the user's chosen model narrate it. The narration is strictly grounded:
 * the prompt forbids inventing anything not in the snapshot. The same snapshot is
 * later handed to the embedded "问我这个月的事" chat as its only context, so the
 * assistant can only speak to this one month, never the whole app.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** One big-ticket reviewed purchase (worth / okay / regret + how much it got used). */
export interface StoryPurchase {
  item_name: string
  amount: number | null
  worthiness: 'worth' | 'okay' | 'regret'
  usage_frequency: 'everyday' | 'sometimes' | 'rarely'
  usage_note: string | null // the user's optional 「一句话」, quoted verbatim when present
  usage_label: string // usage_note if given, else a phrase derived from usage_frequency
}

export interface MonthlyStorySnapshot {
  month: string            // 'YYYY-MM'
  monthLabel: string       // '3月'
  isCurrentMonth: boolean
  // 必写：总支出 + 超支
  totalSpent: number
  prevMonthSpent: number | null
  spendDelta: number | null            // totalSpent - prevMonthSpent
  discretionaryLimit: number | null
  discretionaryUsed: number
  discretionaryOverspent: boolean
  // 复盘 / 后悔榜
  reviewed: StoryPurchase[]
  worthCount: number
  regretCount: number
  regrets: StoryPurchase[]
  topRegretCategory: string | null
  // 许愿池
  savingsCount: number                 // 忍住次数 (each "忍住了" logs a savings record)
  savingsAdded: number
  wishPoolName: string | null
  wishPoolPct: number | null
  // 冲动过滤
  impulseHeld: number                  // impulses dismissed this month (拦住)
  impulseApproved: number              // impulses approved this month (最终还是要了)
  // streak
  streak: number
  // 人格（结论）
  persona: { key: PersonaKey; emoji: string; title: string; description: string; advice: string } | null
}

const USAGE_LABEL: Record<StoryPurchase['usage_frequency'], string> = {
  everyday:  '几乎天天用',
  sometimes: '偶尔用用',
  rarely:    '几乎没怎么用',
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1) // exclusive
  const prevStart = new Date(y, m - 2, 1)
  return {
    startISO: `${y}-${pad(m)}-01`,
    endISO: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-01`,
    prevStartISO: `${prevStart.getFullYear()}-${pad(prevStart.getMonth() + 1)}-01`,
    startTs: start.toISOString(),
    endTs: end.toISOString(),
    monthNum: m,
  }
}

/** "YYYY-MM" of the month N months before `from` (default: now → last month with N=1). */
export function monthString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function previousMonthString(now: Date): string {
  return monthString(new Date(now.getFullYear(), now.getMonth() - 1, 1))
}

/**
 * Pull every signal the story needs for `month` ('YYYY-MM'). All queries run under
 * RLS as the current user. Returns null only if there's genuinely no activity to
 * narrate (no transactions and no held impulses) — callers skip generation then.
 */
export async function aggregateMonthData(month: string, now = new Date()): Promise<MonthlyStorySnapshot | null> {
  const r = monthRange(month)

  const [txnsRes, prevTxnsRes, budgetRes, reviewsRes, impulsesRes, savingsRes, poolRes, streakRes] = await Promise.all([
    db.from('transactions').select('amount, category, category_main, description').gte('date', r.startISO).lt('date', r.endISO),
    db.from('transactions').select('amount').gte('date', r.prevStartISO).lt('date', r.startISO),
    db.from('monthly_budgets').select('discretionary_limit').eq('month', month).maybeSingle(),
    db
      .from('review_results')
      .select('usage_frequency, worthiness, usage_note, review_tasks!inner(item_name, category, transaction_id, transactions(amount))')
      .gte('completed_at', r.startTs).lt('completed_at', r.endTs)
      .order('completed_at', { ascending: false }),
    db.from('impulse_records').select('status').gte('recorded_at', r.startTs).lt('recorded_at', r.endTs),
    db.from('savings_records').select('amount').gte('recorded_at', r.startTs).lt('recorded_at', r.endTs),
    db.from('v_active_wish_pool').select('focus_item_name, target_amount, saved_amount').maybeSingle(),
    db.from('user_streak').select('current_streak, longest_streak').limit(1).maybeSingle(),
  ])

  type Txn = { amount: number | string; category: string; category_main: string; description: string | null }
  const txns = (txnsRes.data as Txn[] | null) ?? []
  const prevTxns = (prevTxnsRes.data as { amount: number | string }[] | null) ?? []
  const impulses = (impulsesRes.data as { status: string }[] | null) ?? []
  const savings = (savingsRes.data as { amount: number | string }[] | null) ?? []

  const totalSpent = txns.reduce((s, t) => s + Number(t.amount), 0)
  const disc = txns.filter((t) => t.category_main === 'discretionary')
  const discretionaryUsed = disc.reduce((s, t) => s + Number(t.amount), 0)

  const impulseHeld = impulses.filter((i) => i.status === 'dismissed').length
  const impulseApproved = impulses.filter((i) => i.status === 'approved').length

  // No activity at all → nothing to narrate.
  if (txns.length === 0 && impulseHeld === 0 && impulseApproved === 0 && savings.length === 0) return null

  const prevMonthSpent = prevTxns.length > 0 ? prevTxns.reduce((s, t) => s + Number(t.amount), 0) : null
  const spendDelta = prevMonthSpent != null ? totalSpent - prevMonthSpent : null

  const discretionaryLimit = (budgetRes.data as { discretionary_limit: number | string } | null)?.discretionary_limit ?? null
  const discretionaryLimitNum = discretionaryLimit != null ? Number(discretionaryLimit) : null
  const discretionaryOverspent = discretionaryLimitNum != null && discretionaryUsed > discretionaryLimitNum

  // ── reviewed purchases (worth/okay/regret) ──
  type ReviewRow = {
    usage_frequency: StoryPurchase['usage_frequency']
    worthiness: StoryPurchase['worthiness']
    usage_note: string | null
    review_tasks: {
      item_name: string
      category: string | null
      transaction_id: string | null
      transactions: { amount: number | string | null } | null
    } | null
  }
  const seen = new Set<string>()
  const reviewed: StoryPurchase[] = []
  for (const row of (reviewsRes.data as ReviewRow[] | null) ?? []) {
    const task = row.review_tasks
    if (!task) continue
    // A purchase spawns day7 + day30 tasks; dedupe so one purchase counts once.
    const key = task.transaction_id ?? `name:${task.item_name}`
    if (seen.has(key)) continue
    seen.add(key)
    const amt = task.transactions?.amount
    // Prefer the user's own words ("穿了一次") over the frequency-derived phrase.
    const note = row.usage_note?.trim() || null
    reviewed.push({
      item_name: task.item_name,
      amount: amt == null ? null : Number(amt),
      worthiness: row.worthiness,
      usage_frequency: row.usage_frequency,
      usage_note: note,
      usage_label: note ?? USAGE_LABEL[row.usage_frequency],
    })
  }
  const worthCount = reviewed.filter((p) => p.worthiness === 'worth').length
  const regrets = reviewed.filter((p) => p.worthiness === 'regret')
  const regretCount = regrets.length

  // most-regretted category (by review_tasks.category, tracked separately)
  const regretCatCounts = new Map<string, number>()
  for (const row of (reviewsRes.data as ReviewRow[] | null) ?? []) {
    if (row.worthiness !== 'regret') continue
    const cat = row.review_tasks?.category
    if (cat) regretCatCounts.set(cat, (regretCatCounts.get(cat) ?? 0) + 1)
  }
  let topRegretCategory: string | null = null
  let topN = 0
  for (const [cat, n] of regretCatCounts) if (n > topN) { topRegretCategory = cat; topN = n }

  // ── wish pool (current focus, not month-scoped) ──
  const pool = poolRes.data as { focus_item_name: string; target_amount: number | string; saved_amount: number | string } | null
  const wishPoolName = pool?.focus_item_name ?? null
  const wishPoolPct = pool && Number(pool.target_amount) > 0
    ? Math.round((Number(pool.saved_amount) / Number(pool.target_amount)) * 100)
    : null

  const streakRow = streakRes.data as { current_streak: number; longest_streak: number } | null
  const streak = streakRow?.current_streak ?? 0
  const longestStreak = streakRow?.longest_streak ?? 0

  // ── persona (the "conclusion" merged into the card) ──
  const catCounts = new Map<string, number>()
  for (const t of disc) catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1)
  const maxCategoryCount = catCounts.size ? Math.max(...catCounts.values()) : 0
  const personaKey = analyzePersona({
    monthNum: r.monthNum,
    discTxnCount: disc.length,
    discTotal: discretionaryUsed,
    maxCategoryCount,
    top3WindowShare: 0, // intra-month timing isn't loaded here; persona is a soft label
    impulseDismissed: impulseHeld,
    regretCount,
    longestStreak,
    hasAnyActivity: true,
  })
  const persona = personaKey ? { ...PERSONAS[personaKey] } : null

  const [y, m] = month.split('-').map(Number)

  return {
    month,
    monthLabel: `${m}月`,
    isCurrentMonth: now.getFullYear() === y && now.getMonth() + 1 === m,
    totalSpent,
    prevMonthSpent,
    spendDelta,
    discretionaryLimit: discretionaryLimitNum,
    discretionaryUsed,
    discretionaryOverspent,
    reviewed,
    worthCount,
    regretCount,
    regrets,
    topRegretCategory,
    savingsCount: savings.length,
    savingsAdded: savings.reduce((s, x) => s + Number(x.amount), 0),
    wishPoolName,
    wishPoolPct,
    impulseHeld,
    impulseApproved,
    streak,
    persona,
  }
}

/** Render the snapshot into the compact, labelled fact list the model narrates from. */
function snapshotFacts(s: MonthlyStorySnapshot): string {
  const yuan = (n: number) => `¥${Math.round(n)}`
  const lines: string[] = []
  lines.push(`月份：${s.monthLabel}${s.isCurrentMonth ? '（本月，尚未结束）' : ''}`)
  lines.push(`本月总支出：${yuan(s.totalSpent)}`)
  if (s.prevMonthSpent != null && s.spendDelta != null) {
    const dir = s.spendDelta > 0 ? `比上月多花了 ${yuan(Math.abs(s.spendDelta))}` : s.spendDelta < 0 ? `比上月少花了 ${yuan(Math.abs(s.spendDelta))}` : '和上月持平'
    lines.push(`上月总支出：${yuan(s.prevMonthSpent)}（${dir}）`)
  } else {
    lines.push('上月无支出数据，不要做对比')
  }
  if (s.discretionaryLimit != null) {
    lines.push(`可支配预算：上限 ${yuan(s.discretionaryLimit)}，已用 ${yuan(s.discretionaryUsed)}，${s.discretionaryOverspent ? '已超支' : '未超支'}`)
  } else {
    lines.push(`可支配消费已用 ${yuan(s.discretionaryUsed)}（未设预算上限，不要说超支与否）`)
  }

  if (s.reviewed.length > 0) {
    lines.push(`本月完成复盘的消费 ${s.reviewed.length} 笔：值得 ${s.worthCount} 笔，后悔 ${s.regretCount} 笔`)
    for (const p of s.reviewed) {
      const tag = p.worthiness === 'worth' ? '觉得值' : p.worthiness === 'regret' ? '后悔了' : '还行'
      // When the user left their own one-liner, mark it as a quotable verbatim note.
      const usage = p.usage_note ? `用户原话「${p.usage_note}」` : p.usage_label
      lines.push(`  - 「${p.item_name}」${p.amount != null ? yuan(p.amount) : '金额未知'}，${tag}，${usage}`)
    }
    if (s.topRegretCategory) lines.push(`后悔最多的品类：${s.topRegretCategory}`)
  } else {
    lines.push('本月没有完成任何购买复盘，不要编造后悔或值得')
  }

  if (s.savingsCount > 0) {
    lines.push(`忍住了 ${s.savingsCount} 次，攒进许愿池 ${yuan(s.savingsAdded)}`)
  } else {
    lines.push('本月没有往许愿池攒钱')
  }
  if (s.wishPoolName && s.wishPoolPct != null) {
    lines.push(`当前许愿池目标：${s.wishPoolName}，进度 ${s.wishPoolPct}%`)
  }

  if (s.impulseHeld > 0 || s.impulseApproved > 0) {
    lines.push(`冲动过滤：拦下 ${s.impulseHeld} 件进入冷静期后放弃，${s.impulseApproved} 件最终还是要了`)
  }

  if (s.streak > 0) lines.push(`当前连续克制 ${s.streak} 天`)

  // 消费人格不喂给叙事正文——它由卡片顶部单独展示，正文重复会显得啰嗦。
  return lines.join('\n')
}

const STYLE_EXAMPLE = `3月，你花了 ¥3,240。

大额消费 3 笔，2 笔觉得值，1 笔后悔——
那件毛衣你说「穿了一次」。

忍住了 6 次，攒进许愿池 ¥340，
AirPods Pro 进度 26%。

那件毛衣的钱，下次留给许愿池吧。`

/** Build the messages that narrate `snapshot` into the Kura monthly story. */
export function buildStoryPrompt(snapshot: MonthlyStorySnapshot): AIMessage[] {
  const system =
    '你是 Kura 的月度复盘叙事者，为用户把这个月的消费数据写成一段克制、温和、略带自嘲的短故事。\n' +
    '硬性规则：\n' +
    '1. 只说下面数据里真实出现的事，绝不编造、不推断没有的细节，不杜撰商品名或金额。\n' +
    '2. 必写段落：开头一句点出月份与总支出；如果有预算上限，说明可支配消费是否超支。\n' +
    '3. 条件段落：只有数据里有时才写——后悔的消费（可引用「几乎没怎么用」这类使用情况）、忍住次数与许愿池进度、冲动过滤。没有就整段跳过，不要写「没有后悔」这类填充。\n' +
    '4. 不要在正文里写「消费人格 / 本月人格 / 人格标签」那段——卡片顶部已单独展示，正文重复即啰嗦。\n' +
    '5. 结尾永远只用一句话收束，克制、略带自嘲、不说教、不喊口号。\n' +
    '6. 语气像写给自己看的随手记，短句分行，不用列表符号，不用 Markdown，不输出 JSON。总长控制在 6 段以内。\n' +
    '7. 金额直接用数据里的数字，格式如 ¥3240。\n\n' +
    `风格参考（只学语气和节奏，不要照抄内容）：\n${STYLE_EXAMPLE}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: `这个月的数据如下：\n\n${snapshotFacts(snapshot)}\n\n请据此写月度复盘故事。` },
  ]
}

/** Generate the story text for a snapshot using the user's adapter. */
export async function generateStoryText(adapter: AIAdapter, snapshot: MonthlyStorySnapshot, signal?: AbortSignal): Promise<string> {
  const text = await adapter.streamChat(buildStoryPrompt(snapshot), () => {}, signal)
  return text.trim()
}

/**
 * System prompt for the embedded "问我这个月的事" chat. The assistant is locked to
 * this single month: the snapshot + the story it already told are its ONLY context.
 */
export function buildStoryChatSystemPrompt(snapshot: MonthlyStorySnapshot, story: string): string {
  return (
    `你是 Kura 的月度复盘助手，只回答用户关于「${snapshot.monthLabel}」这一个月的问题。\n` +
    '你不是全局助手：不要回答与这个月无关的事，被问到就说「我只清楚这个月的情况哦」。\n' +
    '可以做的事：解释这个月某笔具体消费、总结消费规律、按当前攒钱速度预测许愿池还要多久、基于剩余预算给下个月的建议。\n' +
    '只用下面提供的数据，不要编造没有的消费、金额或商品。不确定就直说。语气克制、简短、不说教。不要输出 JSON 或 Markdown 表格。\n\n' +
    `【这个月的数据】\n${snapshotFacts(snapshot)}\n\n` +
    `【你之前给出的月度故事】\n${story}`
  )
}

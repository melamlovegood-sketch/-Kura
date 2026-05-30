/**
 * 历史账单导入 — AI 批量分类。
 *
 * 把商品名列表分批（每批最多50条）交给 AI，按输入顺序返回等长的分类数组。
 * AI 返回中文标签，这里映射回内部枚举；category_main 一律由 category 反推，
 * 避免 AI 把大类/小类搞错时两者不一致。置信度低于 0.7 的标 needs_review。
 */
import type { AIAdapter, AIMessage } from '@/lib/ai/types'
import { getCategoryMain } from '@/lib/categories'
import type { CategoryMain, ItemCategory } from '@/types/db'

export interface Classification {
  category: ItemCategory
  category_main: CategoryMain
  needs_review: boolean
}

export const BATCH_SIZE = 50

const SYSTEM_PROMPT = `系统将以下消费逐条归类。输入是一个 JSON 字符串数组（商品/交易描述）。
请严格按输入顺序返回一个等长的 JSON 数组，每个元素是对象：
{ "category": "食堂"|"交通"|"日用物资"|"外卖奶茶"|"网购"|"娱乐"|"其他", "needs_review": boolean }
其中 needs_review 表示置信度低于 0.7（无法确定分类）时为 true。
只返回 JSON 数组，不要任何解释或代码块标记。`

const ZH_TO_CATEGORY: Record<string, ItemCategory> = {
  食堂: 'canteen',
  交通: 'transport',
  日用物资: 'daily_supplies',
  日用: 'daily_supplies',
  订阅: 'subscription',
  外卖奶茶: 'daily',
  外卖: 'daily',
  奶茶: 'daily',
  日常: 'daily',
  网购: 'online_shopping',
  购物: 'online_shopping',
  娱乐: 'entertainment',
  其他: 'other',
}

function mapOne(item: unknown): Classification {
  const d = (item ?? {}) as Record<string, unknown>
  const zh = typeof d.category === 'string' ? d.category.trim() : ''
  const category: ItemCategory = ZH_TO_CATEGORY[zh] ?? 'other'
  // AI 没给到/没匹配上视为低置信，需要人工确认。
  const needs_review = d.needs_review === true || !(zh in ZH_TO_CATEGORY)
  return { category, category_main: getCategoryMain(category), needs_review }
}

const FALLBACK: Classification = { category: 'other', category_main: 'discretionary', needs_review: true }

async function classifyBatch(
  adapter: AIAdapter,
  descs: string[],
  signal?: AbortSignal,
): Promise<Classification[]> {
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(descs) },
  ]
  let raw: string
  try {
    raw = await adapter.streamChat(messages, () => {}, signal)
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return descs.map(() => FALLBACK)
  }
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
  let arr: unknown
  try { arr = JSON.parse(cleaned) } catch { return descs.map(() => FALLBACK) }
  if (!Array.isArray(arr)) return descs.map(() => FALLBACK)
  // 对齐长度：多退少补（缺的用 fallback，标待确认）。
  return descs.map((_, i) => (i < arr.length ? mapOne(arr[i]) : FALLBACK))
}

/**
 * 分批分类全部描述。onProgress(done, totalCount) 在每批完成后回调，驱动进度文案。
 */
export async function classifyDescriptions(
  adapter: AIAdapter,
  descs: string[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Classification[]> {
  const out: Classification[] = []
  for (let i = 0; i < descs.length; i += BATCH_SIZE) {
    const batch = descs.slice(i, i + BATCH_SIZE)
    const res = await classifyBatch(adapter, batch, signal)
    out.push(...res)
    onProgress?.(Math.min(i + BATCH_SIZE, descs.length), descs.length)
  }
  return out
}

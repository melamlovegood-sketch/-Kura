import type { AIAdapter, AIMessage, ContentPart } from '@/lib/ai/types'
import { routeIntent } from '@/lib/ai/router'
import { CATEGORY_META, getCategoryMain } from '@/lib/categories'
import type { ItemCategory, ParsedTransaction } from '@/types/db'

function isItemCategory(v: unknown): v is ItemCategory {
  return typeof v === 'string' && v in CATEGORY_META
}

/**
 * Run the AI parse (free text + optional screenshot) and reduce it to a single
 * transaction draft for the 账单页 AI 记账 flow. The result is always usable: the
 * amount/description/category fall back to safe defaults so the confirm card can
 * render even on a low-confidence parse, and the user tweaks before saving.
 */
export async function parseTransaction(
  adapter: AIAdapter,
  text: string,
  imageBase64?: string,
  signal?: AbortSignal,
): Promise<ParsedTransaction> {
  const fallback = text.trim() || '（图片输入）'
  const result = await routeIntent(adapter, fallback, imageBase64, undefined, signal)
  const d = result.data as Record<string, unknown>

  const amountRaw = d.amount
  const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw) || 0

  const description = typeof d.description === 'string' && d.description.trim()
    ? d.description.trim()
    : (text.trim() || '')

  const category: ItemCategory = isItemCategory(d.category) ? d.category : 'other'
  const category_main = getCategoryMain(category)

  const today = new Date().toISOString().slice(0, 10)
  const date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today

  const expiry_date = typeof d.expiry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.expiry_date)
    ? d.expiry_date
    : null

  return { amount, description, category, category_main, date, expiry_date }
}

const RECEIPT_SYSTEM_PROMPT = `这张收据/小票包含多种商品，请把它拆分为多条记账记录。
每条返回一个对象：{ "description": string, "amount": number, "category": string, "category_main": "basic_life"|"discretionary" }。
category 取值：canteen(食堂)、transport(交通)、daily_supplies(日用物资)、subscription(订阅)、daily(日常/外卖奶茶)、online_shopping(网购)、entertainment(娱乐)、other(其他)。
category_main：基础生活类(canteen/transport/daily_supplies/subscription)→basic_life；可支配类(daily/online_shopping/entertainment/other)→discretionary。
所有 amount 之和必须等于小票总额。
只返回 JSON 数组，不要任何解释或代码块标记。`

const SUPERMARKET_RE = /超市|便利店|大卖场|卖场|沃尔玛|永辉|家乐福|盒马|华润|万家|大润发|麦德龙|罗森|全家|7-?11|便利蜂|联华|物美|山姆|costco|奥乐齐|ole/i

/** Heuristic: a multi-item supermarket/convenience receipt worth splitting (功能4). */
export function isSupermarketReceipt(parsed: ParsedTransaction, text: string): boolean {
  if (parsed.amount < 30) return false // 小额/单品不拆
  return SUPERMARKET_RE.test(parsed.description) || SUPERMARKET_RE.test(text)
}

/**
 * Ask the AI to split a supermarket receipt (free text + optional screenshot) into
 * several transaction drafts (功能4). Returns [] if the AI didn't return a usable JSON
 * array, so the caller can drop back to a single record.
 */
export async function parseReceipt(
  adapter: AIAdapter,
  text: string,
  imageBase64?: string,
  signal?: AbortSignal,
): Promise<ParsedTransaction[]> {
  const userContent: string | ContentPart[] = imageBase64
    ? [{ type: 'text', text: text.trim() || '（小票图片）' }, { type: 'image_url', image_url: { url: imageBase64 } }]
    : (text.trim() || '（小票）')
  const messages: AIMessage[] = [
    { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ]

  const raw = await adapter.streamChat(messages, () => {}, signal)
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

  let arr: unknown
  try { arr = JSON.parse(cleaned) } catch { return [] }
  if (!Array.isArray(arr)) return []

  const today = new Date().toISOString().slice(0, 10)
  return arr
    .map((item): ParsedTransaction | null => {
      const d = item as Record<string, unknown>
      const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount)
      if (!Number.isFinite(amount) || amount <= 0) return null
      const description = typeof d.description === 'string' && d.description.trim() ? d.description.trim() : '商品'
      const category: ItemCategory = isItemCategory(d.category) ? d.category : 'other'
      return { amount, description, category, category_main: getCategoryMain(category), date: today, expiry_date: null }
    })
    .filter((t): t is ParsedTransaction => t !== null)
}

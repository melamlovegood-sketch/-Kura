import type { AIAdapter } from '@/lib/ai/types'
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

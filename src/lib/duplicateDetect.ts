import type { AIAdapter, AIMessage } from '@/lib/ai/types'

/**
 * 同类替代提醒 (SPEC_PHASE2 §3). When an item is added to the wishlist we scan the
 * last 12 months of purchases for functionally-similar items (same category +
 * functional overlap, e.g. 黑色外套 ≈ 深色风衣) and warn if the user already owns
 * enough of them.
 */

/** "超过 2 件同类时触发提醒" — warn once the user already owns this many similar items. */
export const DUPLICATE_THRESHOLD = 2

export interface PastPurchase {
  description: string
  date: string // YYYY-MM-DD
}

export interface DuplicateMatch {
  count: number          // number of similar past purchases
  categoryLabel: string  // short label, e.g. "黑色外套"
  recentDate: string | null
}

function parseJSON<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
  try { return JSON.parse(cleaned) as T } catch { return null }
}

/**
 * Ask the model which past purchases are the same KIND as `itemName`. Returns a
 * match summary when at least DUPLICATE_THRESHOLD similar items exist, otherwise
 * null. Returns null on any failure — duplicate detection is a soft nudge and
 * must never block adding to the wishlist.
 */
export async function detectDuplicates(
  adapter: AIAdapter,
  itemName: string,
  candidates: PastPurchase[],
  signal?: AbortSignal,
): Promise<DuplicateMatch | null> {
  if (candidates.length === 0) return null

  const list = candidates.map((c) => `- ${c.description}（${c.date}）`).join('\n')
  const messages: AIMessage[] = [
    {
      role: 'system',
      content:
        `你是消费助手。用户想加入待购清单的新商品是：「${itemName}」。\n` +
        `下面是用户近 12 个月已购买的记录。找出其中与新商品「同类」的记录` +
        `（同品类 + 功能重叠，如「黑色外套」与「深色风衣」算同类；不相关的不算）。\n` +
        `只返回 JSON：{"category_label":"用简短词概括这类商品，如 黑色外套/跑鞋/咖啡豆",` +
        `"matched_dates":["YYYY-MM-DD"]}。matched_dates 是匹配记录的购买日期，没有同类则为空数组。`,
    },
    { role: 'user', content: list },
  ]

  let raw = ''
  try {
    raw = await adapter.streamChat(messages, () => {}, signal)
  } catch {
    return null
  }

  const parsed = parseJSON<{ category_label?: string; matched_dates?: string[] }>(raw)
  if (!parsed || !Array.isArray(parsed.matched_dates)) return null

  const dates = parsed.matched_dates.filter((d) => typeof d === 'string')
  if (dates.length < DUPLICATE_THRESHOLD) return null

  const recentDate = dates.reduce<string | null>((max, d) => (max == null || d > max ? d : max), null)

  return {
    count: dates.length,
    categoryLabel: (parsed.category_label || itemName).trim(),
    recentDate,
  }
}

/** "2 个月前" / "10 天前" / "今天" from a YYYY-MM-DD purchase date. */
export function recentLabel(date: string | null): string | null {
  if (!date) return null
  const days = Math.round((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86_400_000)
  if (days <= 0) return '今天'
  if (days < 30) return `${days} 天前`
  const months = Math.round(days / 30)
  return `${months} 个月前`
}

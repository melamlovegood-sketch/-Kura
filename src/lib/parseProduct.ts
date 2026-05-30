import type { AIAdapter, IntentResult } from '@/lib/ai/types'
import { routeIntent } from '@/lib/ai/router'

export interface ParsedProduct {
  item_name: string
  estimated_price: number | null
}

/**
 * Pull a buyable product out of whatever the intent router returned. The router
 * may classify a "想买 X" input as impulse / wishlist / execution / transaction /
 * unknown — each uses slightly different field names — so we coalesce, falling
 * back to the raw text so the caller always gets a usable item name even on a
 * low-confidence parse.
 */
export function extractProduct(result: IntentResult, fallbackText: string): ParsedProduct {
  const d = result.data as Record<string, unknown>
  const name = [d.item_name, d.description, d.category, fallbackText]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0) ?? fallbackText
  // `price` covers the price_track module, whose data carries the amount under
  // that key — so a "耐克跑鞋599" input still yields a price on the buy/wishlist exits.
  const priceRaw = d.estimated_price ?? d.amount ?? d.price
  const price = typeof priceRaw === 'number' && priceRaw > 0 ? priceRaw : null
  return { item_name: name, estimated_price: price }
}

/**
 * Run the AI dialog parse (free text + optional screenshot) and reduce it to a
 * single product. Shared by the home buy-drawer and the execution recording
 * layer so both get identical parsing behaviour.
 */
export async function parseProduct(
  adapter: AIAdapter,
  text: string,
  imageBase64?: string,
  signal?: AbortSignal,
  principles: string[] = [],
): Promise<ParsedProduct> {
  const fallback = text.trim() || '（图片输入）'
  const result = await routeIntent(adapter, fallback, imageBase64, undefined, signal, principles)
  return extractProduct(result, fallback)
}

import type { AIAdapter } from '@/lib/ai/types'
import { routeIntent } from '@/lib/ai/router'
import type { ParsedPriceTrack, PricePlatform } from '@/types/db'

const PLATFORMS: PricePlatform[] = ['taobao', 'jd', 'dewu', 'other']

function coercePlatform(v: unknown): PricePlatform {
  return typeof v === 'string' && (PLATFORMS as string[]).includes(v)
    ? (v as PricePlatform)
    : 'other'
}

/**
 * Parse a "蹲一下价格" input (free text + optional screenshot) into a product
 * name, a numeric price, and the platform it came from.
 *
 * The 蹲一下 button makes the *intent* explicit, so we don't depend on the router
 * classifying the input as `price_track` — we just coalesce whatever buyable
 * fields it returned (price_track / wishlist / impulse / transaction all carry a
 * name and a price under slightly different keys), falling back to the raw text
 * for the name so the caller always gets something usable.
 */
export async function parsePriceTrack(
  adapter: AIAdapter,
  text: string,
  imageBase64?: string,
  signal?: AbortSignal,
): Promise<ParsedPriceTrack> {
  const fallback = text.trim() || '（图片输入）'
  const result = await routeIntent(adapter, fallback, imageBase64, undefined, signal)
  const d = result.data as Record<string, unknown>

  const name = [d.item_name, d.description, d.category, fallback]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0) ?? fallback

  const priceRaw = d.price ?? d.estimated_price ?? d.amount
  const price = typeof priceRaw === 'number' && priceRaw > 0 ? priceRaw : null

  return { item_name: name, price, platform: coercePlatform(d.platform) }
}

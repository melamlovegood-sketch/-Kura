import type { AIAdapter, AIMessage, ContentPart } from '@/lib/ai/types'
import type { WishlistItem } from '@/types/db'
import { formatAmount } from '@/lib/utils'

/**
 * 值不值反查 (SPEC_PHASE2 §4). Category-differentiated assessment of a wishlist
 * item:
 *   - standard (生活用品/电子产品): price-sense judgement (model knowledge — the
 *     chat adapters have no live browsing, so we ask for general guidance, not
 *     fabricated exact prices).
 *   - premium (服饰/包/鞋): optional photo → material / value assessment.
 *   - experience (演出/旅行/餐厅): no price reference, so it's a budget-impact calc.
 */

export type WorthKind = 'standard' | 'premium' | 'experience'

export const WORTH_KIND_LABEL: Record<WorthKind, string> = {
  standard: '标准品',
  premium: '溢价品',
  experience: '体验品',
}

// Checked before premium so "演唱会门票" / "餐厅" win over any incidental overlap.
const EXPERIENCE_KW = [
  '演出', '演唱会', '音乐会', '话剧', '展', '门票', '旅行', '旅游', '机票', '酒店',
  '民宿', '餐', '吃', '饭', '聚会', '聚餐', '体验', '课程', '健身', 'spa', '按摩', '景点', '电影',
]
const PREMIUM_KW = [
  '服', '衣', '裤', '裙', '外套', '大衣', '风衣', '夹克', '卫衣', '衬衫', '毛衣', '羽绒',
  '鞋', '靴', '包', '箱', '帽', '围巾', '配饰', '手表', '首饰', '项链', '戒指', '耳环', '墨镜',
]

export function classifyWorthKind(item: WishlistItem): WorthKind {
  const hay = `${item.item_name} ${item.category ?? ''}`.toLowerCase()
  if (EXPERIENCE_KW.some((k) => hay.includes(k))) return 'experience'
  if (PREMIUM_KW.some((k) => hay.includes(k))) return 'premium'
  return 'standard'
}

export interface ExperienceBudget {
  discretionaryLimit: number | null
}

/** Budget-impact verdict for experience goods — deterministic, no AI needed. */
export function analyzeExperience(item: WishlistItem, budget: ExperienceBudget): string {
  const price = item.estimated_price
  if (price == null || price <= 0) return '还没填价格，填上预估价格再评估这次体验的预算影响。'
  const limit = budget.discretionaryLimit
  if (!limit || limit <= 0) return '还没设置本月可支配预算，先去设个预算，更好判断这次体验的占比。'

  const pct = Math.round((price / limit) * 100)
  let advice: string
  if (pct >= 30) advice = '占比偏高，建议进入冷静期再考虑。'
  else if (pct >= 15) advice = '占比不低，确认这次体验确实值得。'
  else advice = '占比可控，想清楚你期待的体验再决定。'
  return `占本月可支配预算的 ${pct}%，${advice}`
}

const STANDARD_SYSTEM =
  '你是理性购物顾问。针对用户在考虑的标准品（生活用品 / 电子产品），给出值不值得现在买的判断：' +
  '当前价位是否合理、是否值得等促销或更好时机、有没有更划算的同款或平替渠道。' +
  '可以基于你的了解谈不同电商平台的价格差异倾向，但不要编造精确数字。' +
  '语气直接、冷静，3-4 句话，中文，不要用 markdown。'

const PREMIUM_SYSTEM =
  '你是服饰 / 箱包 / 鞋类的理性消费顾问。如果用户提供了图片，先简要识别材质 / 面料。' +
  '然后从以下维度各用一句话简短评估：材质性价比、品牌溢价是否合理、二手保值率、同价位平替建议。' +
  '语气是建议性的、克制，中文，不要用 markdown。'

/**
 * AI assessment for standard / premium goods. Streams via onChunk; returns the
 * full text. Premium goods may include a product photo (base64 data URI).
 */
export async function analyzeWithAI(
  adapter: AIAdapter,
  kind: 'standard' | 'premium',
  item: WishlistItem,
  imageBase64: string | undefined,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const priceText = item.estimated_price != null ? `约 ${formatAmount(item.estimated_price)}` : '未知'
  const body = `商品：${item.item_name}\n预估价格：${priceText}${item.category ? `\n品类：${item.category}` : ''}`

  const content: ContentPart[] = [{ type: 'text', text: body }]
  if (kind === 'premium' && imageBase64) {
    content.push({ type: 'image_url', image_url: { url: imageBase64 } })
  }

  const messages: AIMessage[] = [
    { role: 'system', content: kind === 'standard' ? STANDARD_SYSTEM : PREMIUM_SYSTEM },
    { role: 'user', content: content.length === 1 ? body : content },
  ]

  return adapter.streamChat(messages, onChunk, signal)
}

import type { AIAdapter } from '@/lib/ai/types'
import { routeIntent } from '@/lib/ai/router'
import type { CategoryMain, ParsedBudgetUpdate } from '@/types/db'

/**
 * Parse a "一句话改预算"输入（功能5）into a single budget-bucket change. Reuses the
 * router: accepts a `budget_update` intent, and falls back to a `budget` intent that
 * carries exactly one non-null limit. Returns null when no single positive limit is found.
 */
export async function parseBudgetUpdate(
  adapter: AIAdapter,
  text: string,
  signal?: AbortSignal,
): Promise<ParsedBudgetUpdate | null> {
  const result = await routeIntent(adapter, text.trim(), undefined, undefined, signal)
  const d = result.data as Record<string, unknown>

  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  if (result.module === 'budget_update') {
    const scope: CategoryMain = d.scope === 'basic_life' ? 'basic_life' : 'discretionary'
    const limit = num(d.limit)
    if (limit == null) return null
    const label = typeof d.label === 'string' && d.label.trim()
      ? d.label.trim()
      : scope === 'basic_life' ? '基础生活' : '可支配'
    return { scope, limit, label }
  }

  if (result.module === 'budget') {
    const basic = num(d.basic_life_limit)
    const discr = num(d.discretionary_limit)
    if (basic != null && discr == null) return { scope: 'basic_life', limit: basic, label: '基础生活' }
    if (discr != null && basic == null) return { scope: 'discretionary', limit: discr, label: '可支配' }
  }

  return null
}

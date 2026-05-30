import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth'
import { monthString, previousMonthString } from '@/lib/generateMonthlyStory'
import type { BudgetData, BudgetPlan, CategoryMain } from '@/types/db'

interface BudgetStore {
  data: BudgetData | null
  loading: boolean
  /** AI 建议的下月预算微调（功能2），无则 null。 */
  suggestion: BudgetPlan | null
  refresh: () => Promise<void>
  upsert: (limits: {
    basic_life_limit: number
    discretionary_limit: number
    total_income?: number
  }) => Promise<void>
  /** 每月自动延续：当月无预算则复制上月预算（功能2）。 */
  ensureContinuity: () => Promise<void>
  /** 一句话改预算：只更新某一个桶的上限（功能5）。 */
  updateLimit: (scope: CategoryMain, limit: number) => Promise<void>
  loadSuggestion: () => Promise<void>
  dismissSuggestion: () => Promise<void>
}

export const useBudgetStore = create<BudgetStore>()(persist((set, get) => ({
  data: null,
  loading: false,
  suggestion: null,

  refresh: async () => {
    set({ loading: true })
    try {
      // v_current_budget filters to current month internally
      const { data } = await db.from('v_current_budget').select('*').maybeSingle()
      set({ data: (data as BudgetData | null) ?? null })
    } finally {
      // Always clear the spinner — otherwise a failed query leaves the card stuck on "加载中…"
      set({ loading: false })
    }
  },

  upsert: async ({ basic_life_limit, discretionary_limit, total_income }) => {
    const month = monthString(new Date())
    const { data: existing } = await db
      .from('monthly_budgets').select('id').eq('month', month).maybeSingle()
    const row = { month, basic_life_limit, discretionary_limit, total_income: total_income ?? null }
    if (existing) await db.from('monthly_budgets').update(row).eq('id', existing.id)
    else await db.from('monthly_budgets').insert({ ...row, user_id: await getCurrentUserId() })
    const { data } = await db.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null })
  },

  ensureContinuity: async () => {
    const now = new Date()
    const month = monthString(now)
    // 当月已有预算 → 什么都不做。
    const { data: cur } = await db
      .from('monthly_budgets').select('id').eq('month', month).maybeSingle()
    if (cur) return
    // 复制上月预算到本月；上月也没有 → 新用户，走原引导流程，不动。
    const prev = previousMonthString(now)
    const { data: last } = await db
      .from('monthly_budgets')
      .select('basic_life_limit, discretionary_limit, total_income')
      .eq('month', prev)
      .maybeSingle()
    if (!last) return
    const p = last as Pick<BudgetData, 'basic_life_limit' | 'discretionary_limit' | 'total_income'>
    await db.from('monthly_budgets').insert({
      month,
      basic_life_limit: p.basic_life_limit,
      discretionary_limit: p.discretionary_limit,
      total_income: p.total_income ?? null,
      user_id: await getCurrentUserId(),
    })
    const { data } = await db.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null })
  },

  updateLimit: async (scope, limit) => {
    const month = monthString(new Date())
    const col = scope === 'basic_life' ? 'basic_life_limit' : 'discretionary_limit'
    const { data: existing } = await db
      .from('monthly_budgets').select('id').eq('month', month).maybeSingle()
    if (existing) {
      await db.from('monthly_budgets').update({ [col]: limit }).eq('id', existing.id)
    } else {
      await db.from('monthly_budgets').insert({
        month,
        basic_life_limit: scope === 'basic_life' ? limit : 0,
        discretionary_limit: scope === 'discretionary' ? limit : 0,
        user_id: await getCurrentUserId(),
      })
    }
    const { data } = await db.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null })
  },

  loadSuggestion: async () => {
    const month = monthString(new Date())
    try {
      const { data } = await db
        .from('monthly_budget_plans')
        .select('*')
        .eq('month', month)
        .eq('status', 'pending')
        .maybeSingle()
      set({ suggestion: (data as BudgetPlan | null) ?? null })
    } catch {
      set({ suggestion: null }) // 表不存在/查询失败 → 静默忽略，不影响正常使用
    }
  },

  dismissSuggestion: async () => {
    const s = get().suggestion
    if (s) await db.from('monthly_budget_plans').update({ status: 'dismissed' }).eq('id', s.id)
    set({ suggestion: null })
  },
}), {
  name: 'kura-budget',
  storage: createJSONStorage(() => localStorage),
  // Cache only the data; loading/suggestion are transient.
  partialize: (s) => ({ data: s.data }),
}))

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth'
import type { BudgetData } from '@/types/db'

interface BudgetStore {
  data: BudgetData | null
  loading: boolean
  refresh: () => Promise<void>
  upsert: (limits: {
    basic_life_limit: number
    discretionary_limit: number
    total_income?: number
  }) => Promise<void>
}

export const useBudgetStore = create<BudgetStore>()(persist((set) => ({
  data: null,
  loading: false,

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
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM

    const { data: existing } = await db
      .from('monthly_budgets')
      .select('id')
      .eq('month', month)
      .maybeSingle()

    const row = {
      month,
      basic_life_limit,
      discretionary_limit,
      total_income: total_income ?? null,
    }

    if (existing) {
      await db.from('monthly_budgets').update(row).eq('id', existing.id)
    } else {
      await db.from('monthly_budgets').insert({ ...row, user_id: await getCurrentUserId() })
    }

    // Refetch to get computed used amounts
    const { data } = await db.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null })
  },
}), {
  name: 'kura-budget',
  storage: createJSONStorage(() => localStorage),
  // Cache only the data; `loading` is always transient.
  partialize: (s) => ({ data: s.data }),
}))

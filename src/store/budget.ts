import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
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
      const { data } = await supabase.from('v_current_budget').select('*').maybeSingle()
      set({ data: (data as BudgetData | null) ?? null })
    } finally {
      // Always clear the spinner — otherwise a failed query leaves the card stuck on "加载中…"
      set({ loading: false })
    }
  },

  upsert: async ({ basic_life_limit, discretionary_limit, total_income }) => {
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM

    const { data: existing } = await supabase
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
      await supabase.from('monthly_budgets').update(row).eq('id', existing.id)
    } else {
      await supabase.from('monthly_budgets').insert(row)
    }

    // Refetch to get computed used amounts
    const { data } = await supabase.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null })
  },
}), {
  name: 'kura-budget',
  // Cache only the data; `loading` is always transient.
  partialize: (s) => ({ data: s.data }),
}))

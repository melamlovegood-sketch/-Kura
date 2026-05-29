import { create } from 'zustand'
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

export const useBudgetStore = create<BudgetStore>((set) => ({
  data: null,
  loading: false,

  refresh: async () => {
    set({ loading: true })
    // v_current_budget filters to current month internally
    const { data } = await supabase.from('v_current_budget').select('*').maybeSingle()
    set({ data: (data as BudgetData | null) ?? null, loading: false })
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
}))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface BrandEntry {
  id: string
  category: string
  brand_name: string
  weight: number
  note: string | null
}

export interface SOPRule {
  id: string
  title: string
  content: string
  order: number
}

interface ExecutionStore {
  brands: BrandEntry[]
  sopRules: SOPRule[]
  loaded: boolean
  load: () => Promise<void>
  brandsForCategory: (category: string) => BrandEntry[]
  addBrand: (category: string, brandName: string, note?: string) => Promise<void>
  updateWeight: (id: string, delta: 1 | -1) => Promise<void>
  createSession: (category: string, timerDuration: number) => Promise<string>
  endSession: (
    id: string,
    decision: 'bought' | 'skipped' | 'undecided',
    itemPurchased?: string,
  ) => Promise<void>
}

export const useExecutionStore = create<ExecutionStore>()(persist((set, get) => ({
  brands: [],
  sopRules: [],
  loaded: false,

  load: async () => {
    const [brandsRes, sopRes] = await Promise.all([
      supabase.from('brand_library').select('*').order('weight', { ascending: false }),
      supabase.from('sop_rules').select('*').order('order', { ascending: true }),
    ])
    set({
      brands: (brandsRes.data as BrandEntry[]) ?? [],
      sopRules: (sopRes.data as SOPRule[]) ?? [],
      loaded: true,
    })
  },

  brandsForCategory: (category) => {
    const lower = category.toLowerCase()
    return get()
      .brands.filter((b) => b.category.toLowerCase() === lower)
      .sort((a, b) => b.weight - a.weight)
  },

  addBrand: async (category, brandName, note) => {
    const { data } = await supabase
      .from('brand_library')
      .insert({ category, brand_name: brandName, weight: 5, note: note ?? null })
      .select()
      .single()

    if (data) set({ brands: [data as BrandEntry, ...get().brands] })
  },

  updateWeight: async (id, delta) => {
    const brand = get().brands.find((b) => b.id === id)
    if (!brand) return
    const newWeight = brand.weight + delta
    await supabase
      .from('brand_library')
      .update({ weight: newWeight, updated_at: new Date().toISOString() })
      .eq('id', id)
    set({ brands: get().brands.map((b) => (b.id === id ? { ...b, weight: newWeight } : b)) })
  },

  createSession: async (category, timerDuration) => {
    const { data } = await supabase
      .from('execution_sessions')
      .insert({
        category,
        timer_duration: timerDuration,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    return (data?.id as string) ?? ''
  },

  endSession: async (id, decision, itemPurchased) => {
    await supabase
      .from('execution_sessions')
      .update({
        decision,
        item_purchased: itemPurchased ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq('id', id)
  },
}), {
  name: 'kura-execution',
  partialize: (s) => ({ brands: s.brands, sopRules: s.sopRules }),
}))

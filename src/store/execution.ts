import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'

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

/**
 * Default SOP rules every new user starts with. These used to be seeded globally
 * in schema.sql, but migration 0009 (multi-user) TRUNCATEd that global seed since
 * every row now needs an owner. They're re-seeded per-user when onboarding ends
 * (see seedDefaultsIfEmpty + Onboarding.finish).
 */
const DEFAULT_SOP_RULES: { title: string; content: string; order: number }[] = [
  { title: '裤子',     content: '裤子只去线下试穿，满意再线上买', order: 1 },
  { title: '上衣',     content: '上衣优先有品牌背书的；贵的好牌子去闲鱼找二手', order: 2 },
  { title: '搜索决策', content: '搜索品类时看AI总结，前几个推荐快速决断；决断不了就都买货比三家', order: 3 },
  { title: '品牌优先', content: '优先从品牌库里选信任品牌', order: 4 },
  { title: '计时器',   content: '购物前设定计时器，时间到立刻下单当前最优选', order: 5 },
]

export interface ExecutionStore {
  brands: BrandEntry[]
  sopRules: SOPRule[]
  loaded: boolean
  load: () => Promise<void>
  /** Seed the default SOP rules for a brand-new user. Idempotent (no-op if any
   *  SOP rule already exists for this user). Called when onboarding finishes. */
  seedDefaultsIfEmpty: () => Promise<void>
  brandsForCategory: (category: string) => BrandEntry[]
  addBrand: (category: string, brandName: string, note?: string) => Promise<void>
  updateWeight: (id: string, delta: 1 | -1) => Promise<void>
  addSOPRule: (title: string, content: string) => Promise<void>
  updateSOPRule: (id: string, patch: { title?: string; content?: string }) => Promise<void>
  deleteSOPRule: (id: string) => Promise<void>
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

  seedDefaultsIfEmpty: async () => {
    const userId = await getCurrentUserId()
    // Idempotency: only seed when this user has zero SOP rules. The count query
    // runs under RLS so it sees only the caller's rows — re-running onboarding
    // (or a user who already added their own rules) won't get duplicates.
    const { count } = await supabase
      .from('sop_rules')
      .select('id', { count: 'exact', head: true })
    if ((count ?? 0) > 0) return

    const { data } = await supabase
      .from('sop_rules')
      .insert(DEFAULT_SOP_RULES.map((r) => ({ ...r, user_id: userId })))
      .select()

    if (data) {
      set({ sopRules: (data as SOPRule[]).sort((a, b) => a.order - b.order) })
    }
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
      .insert({ category, brand_name: brandName, weight: 5, note: note ?? null, user_id: await getCurrentUserId() })
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

  addSOPRule: async (title, content) => {
    const rules = get().sopRules
    const nextOrder = rules.length ? Math.max(...rules.map((r) => r.order)) + 1 : 1
    const { data } = await supabase
      .from('sop_rules')
      .insert({ title, content: content || title, order: nextOrder, user_id: await getCurrentUserId() })
      .select()
      .single()

    if (data) set({ sopRules: [...rules, data as SOPRule].sort((a, b) => a.order - b.order) })
  },

  updateSOPRule: async (id, patch) => {
    await supabase.from('sop_rules').update(patch).eq('id', id)
    set({ sopRules: get().sopRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  },

  deleteSOPRule: async (id) => {
    await supabase.from('sop_rules').delete().eq('id', id)
    set({ sopRules: get().sopRules.filter((r) => r.id !== id) })
  },

  createSession: async (category, timerDuration) => {
    const { data, error } = await supabase
      .from('execution_sessions')
      .insert({
        category,
        timer_duration: timerDuration,
        started_at: new Date().toISOString(),
        user_id: await getCurrentUserId(),
      })
      .select('id')
      .single()
    // Surface the failure instead of returning '' — an empty string later lands in
    // transactions.execution_session_id (a uuid column) and triggers the
    // `invalid input syntax for type uuid: ""` 400 the user was seeing.
    if (error || !data?.id) throw new Error(error?.message || '无法创建执行会话，请检查网络与登录态')
    return data.id as string
  },

  endSession: async (id, decision, itemPurchased) => {
    // No-op on an empty id (e.g. a necessity quick-record never opened a session).
    if (!id) return
    const { error } = await supabase
      .from('execution_sessions')
      .update({
        decision,
        item_purchased: itemPurchased ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw new Error(error.message)
  },
}), {
  name: 'kura-execution',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ brands: s.brands, sopRules: s.sopRules }),
}))

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { analyzePersona, PERSONAS, type PersonaKey } from '@/lib/personaAnalysis'

const pad = (n: number) => String(n).padStart(2, '0')

export interface PersonaReport {
  key: PersonaKey
  emoji: string
  title: string
  description: string
  advice: string
  month: string // 'YYYY-MM' of the analysed (previous) month
}

interface PersonaStore {
  report: PersonaReport | null
  dismissedMonth: string | null // month string the user dismissed
  loaded: boolean
  /** Build the previous month's persona report (SPEC_PHASE2 §6). */
  generate: () => Promise<void>
  dismiss: () => void
}

export const usePersonaStore = create<PersonaStore>()(persist((set, get) => ({
  report: null,
  dismissedMonth: null,
  loaded: false,

  generate: async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1) // exclusive
    const monthNum = start.getMonth() + 1
    const monthStr = `${start.getFullYear()}-${pad(monthNum)}`
    const startISO = `${start.getFullYear()}-${pad(monthNum)}-01`
    const endISO = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-01`
    const startTs = start.toISOString()
    const endTs = end.toISOString()

    const [txnsRes, dismissed, regret, streakRow] = await Promise.all([
      supabase.from('transactions').select('date, amount, category, category_main').gte('date', startISO).lt('date', endISO),
      supabase.from('impulse_records').select('*', { count: 'exact', head: true }).eq('status', 'dismissed').gte('recorded_at', startTs).lt('recorded_at', endTs),
      supabase.from('review_results').select('*', { count: 'exact', head: true }).eq('worthiness', 'regret').gte('completed_at', startTs).lt('completed_at', endTs),
      supabase.from('user_streak').select('longest_streak').limit(1).maybeSingle(),
    ])

    type Txn = { date: string; amount: number | string; category: string; category_main: string }
    const txns = (txnsRes.data as Txn[] | null) ?? []
    const disc = txns.filter((t) => t.category_main === 'discretionary')
    const discTotal = disc.reduce((s, t) => s + Number(t.amount), 0)

    // most transactions in a single discretionary category
    const catCounts = new Map<string, number>()
    for (const t of disc) catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1)
    const maxCategoryCount = catCounts.size ? Math.max(...catCounts.values()) : 0

    // largest share of disc spend within any 3-day window
    const byDay = new Map<number, number>()
    for (const t of disc) {
      const day = Number(t.date.slice(8, 10))
      byDay.set(day, (byDay.get(day) ?? 0) + Number(t.amount))
    }
    let topWindow = 0
    for (const d of byDay.keys()) {
      let sum = 0
      for (let k = d; k <= d + 2; k++) sum += byDay.get(k) ?? 0
      if (sum > topWindow) topWindow = sum
    }
    const top3WindowShare = discTotal > 0 ? topWindow / discTotal : 0

    const hasAnyActivity = txns.length > 0 || (dismissed.count ?? 0) > 0

    const key = analyzePersona({
      monthNum,
      discTxnCount: disc.length,
      discTotal,
      maxCategoryCount,
      top3WindowShare,
      impulseDismissed: dismissed.count ?? 0,
      regretCount: regret.count ?? 0,
      longestStreak: (streakRow.data as { longest_streak: number } | null)?.longest_streak ?? 0,
      hasAnyActivity,
    })

    if (!key) { set({ report: null, loaded: true }); return }
    set({ report: { ...PERSONAS[key], month: monthStr }, loaded: true })
  },

  dismiss: () => {
    const m = get().report?.month
    if (m) set({ dismissedMonth: m })
  },
}), {
  name: 'kura-persona',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ dismissedMonth: s.dismissedMonth }),
}))

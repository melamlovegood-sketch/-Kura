import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'

export interface ExpiringItem {
  id: string
  description: string
  expiry_date: string   // YYYY-MM-DD
  days_left: number      // 0 = expires today, negative = already expired
}

/** How many days before expiry we start nudging (SPEC_PHASE2 §9: 7 天 / 1 天). */
const WINDOW_DAYS = 7

interface ExpiryStore {
  items: ExpiringItem[]
  dismissed: string[]    // transaction ids the user dismissed this cycle
  loaded: boolean
  load: () => Promise<void>
  dismiss: (id: string) => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const daysBetween = (from: string, to: string): number => {
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export const useExpiryStore = create<ExpiryStore>()(persist((set, get) => ({
  items: [],
  dismissed: [],
  loaded: false,

  load: async () => {
    const today = todayISO()
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + WINDOW_DAYS)
    const horizonISO = horizon.toISOString().slice(0, 10)

    // Items expiring within the window (today .. +7d), nearest first.
    const { data } = await supabase
      .from('transactions')
      .select('id, description, expiry_date')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', today)
      .lte('expiry_date', horizonISO)
      .order('expiry_date', { ascending: true })

    type Row = { id: string; description: string | null; expiry_date: string }
    const dismissed = get().dismissed
    const items: ExpiringItem[] = ((data as Row[] | null) ?? [])
      .filter((r) => !dismissed.includes(r.id))
      .map((r) => ({
        id: r.id,
        description: r.description || '某样东西',
        expiry_date: r.expiry_date,
        days_left: daysBetween(today, r.expiry_date),
      }))

    set({ items, loaded: true })
  },

  dismiss: (id) => set((s) => ({
    items: s.items.filter((i) => i.id !== id),
    dismissed: [...s.dismissed, id],
  })),
}), {
  name: 'kura-expiry',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ dismissed: s.dismissed }),
}))

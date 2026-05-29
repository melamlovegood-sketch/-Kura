import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { useBudgetStore } from './budget'
import type { ParsedSubscription, Subscription } from '@/types/db'

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate()

/** Reminder window before a charge (SPEC_PHASE2 §2: 扣款日前 3 天). */
const REMINDER_DAYS = 3

export interface UpcomingCharge {
  sub: Subscription
  daysUntil: number    // 1 = 明天, …
  billingDate: string  // YYYY-MM-DD of the next charge
  key: string          // stable dismiss key: `${id}:${billingDate}`
}

/**
 * Days until a subscription's next charge, clamping the billing day to the
 * length of the target month (e.g. billing_day 31 → Feb 28). Returns the next
 * charge's ISO date too. Looks at most one month ahead, which is all the
 * 3-day reminder window ever needs.
 */
function nextCharge(billingDay: number, now: Date): { daysUntil: number; date: string } {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const today = now.getDate()

  const effThis = Math.min(billingDay, daysInMonth(y, m))
  if (effThis >= today) {
    return { daysUntil: effThis - today, date: `${y}-${pad(m + 1)}-${pad(effThis)}` }
  }
  // already past this month → next month
  const ny = m === 11 ? y + 1 : y
  const nm = m === 11 ? 0 : m + 1
  const effNext = Math.min(billingDay, daysInMonth(ny, nm))
  const daysUntil = daysInMonth(y, m) - today + effNext
  return { daysUntil, date: `${ny}-${pad(nm + 1)}-${pad(effNext)}` }
}

/** Active subscriptions whose next charge falls within the reminder window (1..3 days). */
export function upcomingCharges(items: Subscription[], now = new Date()): UpcomingCharge[] {
  return items
    .filter((s) => s.is_active)
    .map((s) => {
      const { daysUntil, date } = nextCharge(s.billing_day, now)
      return { sub: s, daysUntil, billingDate: date, key: `${s.id}:${date}` }
    })
    .filter((c) => c.daysUntil >= 1 && c.daysUntil <= REMINDER_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

interface SubscriptionStore {
  items: Subscription[]
  loaded: boolean
  dismissed: string[] // reminder keys dismissed this cycle
  load: () => Promise<void>
  add: (data: ParsedSubscription) => Promise<Subscription | null>
  update: (id: string, patch: Partial<ParsedSubscription> & { is_active?: boolean }) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  /** Auto-record this month's charge for every active sub whose billing day has passed. */
  generateDueTransactions: () => Promise<void>
  dismissReminder: (key: string) => void
}

export const useSubscriptionStore = create<SubscriptionStore>()(persist((set, get) => ({
  items: [],
  loaded: false,
  dismissed: [],

  load: async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .order('billing_day', { ascending: true })
      .order('created_at', { ascending: true })

    set({ items: (data as Subscription[]) ?? [], loaded: true })
  },

  add: async (parsed) => {
    const { data } = await supabase
      .from('subscriptions')
      .insert({
        name: parsed.name,
        amount: parsed.amount,
        billing_day: parsed.billing_day,
        category: parsed.category,
        is_active: true,
      })
      .select()
      .single()

    if (!data) return null
    const sub = data as Subscription
    set({ items: [...get().items, sub] })
    // A new sub whose billing day already passed should record immediately.
    void get().generateDueTransactions()
    return sub
  },

  update: async (id, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.amount !== undefined) row.amount = patch.amount
    if (patch.billing_day !== undefined) row.billing_day = patch.billing_day
    if (patch.category !== undefined) row.category = patch.category
    if (patch.is_active !== undefined) row.is_active = patch.is_active

    await supabase.from('subscriptions').update(row).eq('id', id)
    set({ items: get().items.map((s) => (s.id === id ? { ...s, ...row } as Subscription : s)) })
  },

  remove: async (id) => {
    await supabase.from('subscriptions').delete().eq('id', id)
    set({ items: get().items.filter((s) => s.id !== id) })
  },

  toggleActive: async (id) => {
    const sub = get().items.find((s) => s.id === id)
    if (!sub) return
    await get().update(id, { is_active: !sub.is_active })
  },

  generateDueTransactions: async () => {
    const active = get().items.filter((s) => s.is_active)
    if (active.length === 0) return

    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const today = now.getDate()
    const dim = daysInMonth(y, m)
    const monthStart = `${y}-${pad(m + 1)}-01`
    const nextMonthStart = m === 11 ? `${y + 1}-01-01` : `${y}-${pad(m + 2)}-01`

    // Which subs already have a generated transaction this month?
    const { data: existing } = await supabase
      .from('transactions')
      .select('subscription_id')
      .not('subscription_id', 'is', null)
      .gte('date', monthStart)
      .lt('date', nextMonthStart)

    const charged = new Set(((existing as { subscription_id: string }[] | null) ?? []).map((r) => r.subscription_id))

    const rows = active
      .filter((s) => {
        const effDay = Math.min(s.billing_day, dim)
        return today >= effDay && !charged.has(s.id)
      })
      .map((s) => ({
        date: `${y}-${pad(m + 1)}-${pad(Math.min(s.billing_day, dim))}`,
        amount: s.amount,
        category: 'subscription',
        category_main: 'basic_life',
        description: s.name,
        source: 'text',
        subscription_id: s.id,
      }))

    if (rows.length === 0) return
    await supabase.from('transactions').insert(rows)
    void useBudgetStore.getState().refresh()
  },

  dismissReminder: (key) => set((s) => ({ dismissed: [...s.dismissed, key] })),
}), {
  name: 'kura-subscriptions',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ dismissed: s.dismissed }),
}))

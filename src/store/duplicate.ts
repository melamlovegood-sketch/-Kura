import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useSettingsStore } from './settings'
import { detectDuplicates } from '@/lib/duplicateDetect'
import type { WishlistItem } from '@/types/db'

export interface DuplicateWarning {
  wishlistItemId: string
  itemName: string
  count: number
  categoryLabel: string
  recentDate: string | null
}

interface DuplicateStore {
  warning: DuplicateWarning | null
  checking: boolean
  /** Background scan run when an item is added to the wishlist (SPEC_PHASE2 §3). */
  detect: (item: WishlistItem) => Promise<void>
  clear: () => void
}

const PURCHASE_LIMIT = 100

export const useDuplicateStore = create<DuplicateStore>((set) => ({
  warning: null,
  checking: false,

  detect: async (item) => {
    const adapter = useSettingsStore.getState().adapter
    if (!adapter) return

    // last 12 months of purchases with a usable description (exclude recurring
    // subscription bills — they aren't "同类商品").
    const since = new Date()
    since.setMonth(since.getMonth() - 12)
    const sinceISO = since.toISOString().slice(0, 10)

    const { data } = await supabase
      .from('transactions')
      .select('description, date')
      .neq('category', 'subscription')
      .not('description', 'is', null)
      .gte('date', sinceISO)
      .order('date', { ascending: false })
      .limit(PURCHASE_LIMIT)

    const candidates = ((data as { description: string | null; date: string }[] | null) ?? [])
      .filter((r) => r.description && r.description.trim())
      .map((r) => ({ description: r.description as string, date: r.date }))

    if (candidates.length === 0) return

    set({ checking: true })
    try {
      const match = await detectDuplicates(adapter, item.item_name, candidates)
      if (match) {
        set({
          warning: {
            wishlistItemId: item.id,
            itemName: item.item_name,
            count: match.count,
            categoryLabel: match.categoryLabel,
            recentDate: match.recentDate,
          },
        })
      }
    } finally {
      set({ checking: false })
    }
  },

  clear: () => set({ warning: null }),
}))

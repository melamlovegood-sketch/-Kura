import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ParsedWishlistItem, WishlistItem } from '@/types/db'

interface WishlistStore {
  items: WishlistItem[]
  loaded: boolean
  load: () => Promise<void>
  add: (data: ParsedWishlistItem, impulseRecordId?: string) => Promise<void>
  /** Set this item as the wish pool focus, create/reuse wish_pool record */
  pin: (item: WishlistItem) => Promise<void>
  dismiss: (id: string) => Promise<void>
  /** Update last_nudged_at (user responded to "还想要吗") */
  markNudged: (id: string) => Promise<void>
}

export const useWishlistStore = create<WishlistStore>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const { data } = await supabase
      .from('wishlist_items')
      .select('*')
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true })

    set({ items: (data as WishlistItem[]) ?? [], loaded: true })
  },

  add: async (parsed, impulseRecordId) => {
    const { data } = await supabase
      .from('wishlist_items')
      .insert({
        item_name: parsed.item_name,
        category: parsed.category ?? null,
        estimated_price: parsed.estimated_price ?? null,
        season_tag: parsed.season_tag,
        need_intensity: parsed.need_intensity ?? null,
        worthiness_score: parsed.worthiness_score ?? null,
        worthiness_reason: parsed.worthiness_reason ?? null,
        impulse_record_id: impulseRecordId ?? null,
        priority: 0,
        status: 'active',
      })
      .select()
      .single()

    if (data) {
      set({ items: [...get().items, data as WishlistItem] })
    }
  },

  pin: async (item) => {
    // Unpin all others
    await supabase
      .from('wishlist_items')
      .update({ is_focus: false })
      .eq('is_focus', true)

    // Pin this item
    await supabase
      .from('wishlist_items')
      .update({ is_focus: true })
      .eq('id', item.id)

    // Create wish_pool if none exists for this item
    const { data: existing } = await supabase
      .from('wish_pools')
      .select('id')
      .eq('focus_item_id', item.id)
      .is('completed_at', null)
      .maybeSingle()

    if (!existing) {
      await supabase.from('wish_pools').insert({
        focus_item_id: item.id,
        target_amount: item.estimated_price ?? 0,
      })
    }

    // Update local state
    set({
      items: get().items.map((i) => ({ ...i, is_focus: i.id === item.id })),
    })
  },

  dismiss: async (id) => {
    await supabase.from('wishlist_items').update({ status: 'dismissed' }).eq('id', id)
    set({ items: get().items.filter((i) => i.id !== id) })
  },

  markNudged: async (id) => {
    const now = new Date().toISOString()
    await supabase.from('wishlist_items').update({ last_nudged_at: now }).eq('id', id)
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, last_nudged_at: now } : i,
      ),
    })
  },
}))

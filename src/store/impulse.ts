import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth'
import type { ImpulseRecord, ParsedImpulse } from '@/types/db'

interface ImpulseStore {
  items: ImpulseRecord[]
  loaded: boolean
  load: () => Promise<void>
  add: (data: ParsedImpulse, cooldownHours: number) => Promise<void>
  /** Approve → create wishlist item, returns new wishlist item id */
  approve: (record: ImpulseRecord) => Promise<string | null>
  dismiss: (id: string) => Promise<void>
}

export const useImpulseStore = create<ImpulseStore>()(persist((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const { data } = await db
      .from('impulse_records')
      .select('*')
      .neq('status', 'dismissed')
      .order('recorded_at', { ascending: false })

    set({ items: (data as ImpulseRecord[]) ?? [], loaded: true })
  },

  add: async (parsed, cooldownHours) => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + cooldownHours * 60 * 60 * 1000)

    const { data } = await db
      .from('impulse_records')
      .insert({
        item_name: parsed.item_name,
        estimated_price: parsed.estimated_price ?? null,
        season_tag: parsed.season_tag,
        source: parsed.source ?? null,
        recorded_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        user_id: await getCurrentUserId(),
      })
      .select()
      .single()

    if (data) {
      set({ items: [data as ImpulseRecord, ...get().items] })
    }
  },

  approve: async (record) => {
    // 1. Mark impulse as approved
    await db
      .from('impulse_records')
      .update({ status: 'approved' })
      .eq('id', record.id)

    // 2. Create wishlist item
    const { data } = await db
      .from('wishlist_items')
      .insert({
        item_name: record.item_name,
        estimated_price: record.estimated_price ?? null,
        season_tag: record.season_tag,
        impulse_record_id: record.id,
        priority: 0,
        status: 'active',
        user_id: await getCurrentUserId(),
      })
      .select('id')
      .single()

    // 3. Remove from local list
    set({ items: get().items.filter((r) => r.id !== record.id) })

    return data?.id ?? null
  },

  dismiss: async (id) => {
    await db.from('impulse_records').update({ status: 'dismissed' }).eq('id', id)
    set({ items: get().items.filter((r) => r.id !== id) })
  },
}), {
  name: 'kura-impulse',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ items: s.items }),
}))

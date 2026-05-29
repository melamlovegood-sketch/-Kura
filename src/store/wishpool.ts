import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import type { WishPoolData } from '@/types/db'

interface WishPoolStore {
  pool: WishPoolData | null
  loaded: boolean
  load: () => Promise<void>
  addSavings: (amount: number, description: string) => Promise<void>
}

export const useWishPoolStore = create<WishPoolStore>()(persist((set, get) => ({
  pool: null,
  loaded: false,

  load: async () => {
    const { data } = await supabase
      .from('v_active_wish_pool')
      .select('*')
      .maybeSingle()

    set({ pool: (data as WishPoolData | null) ?? null, loaded: true })
  },

  addSavings: async (amount, description) => {
    const pool = get().pool
    if (!pool) return

    await supabase.from('savings_records').insert({
      wish_pool_id: pool.id,
      amount,
      description: description || null,
    })

    // Refetch to get updated saved_amount
    const { data } = await supabase
      .from('v_active_wish_pool')
      .select('*')
      .maybeSingle()

    // Mark completed if target reached
    const updated = data as WishPoolData | null
    if (updated && updated.saved_amount >= updated.target_amount && !updated.completed_at) {
      await supabase
        .from('wish_pools')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', pool.id)
    }

    set({ pool: updated })
  },
}), {
  name: 'kura-wishpool',
  partialize: (s) => ({ pool: s.pool }),
}))

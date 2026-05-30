import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth'

export interface Principle {
  id: string
  content: string
  order: number
  created_at: string
}

interface PrinciplesStore {
  items: Principle[]
  loaded: boolean
  load: () => Promise<void>
  add: (contents: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const usePrinciplesStore = create<PrinciplesStore>()(persist((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const { data } = await db
      .from('personal_principles')
      .select('*')
      .order('order', { ascending: true })
      .order('created_at', { ascending: true })

    set({ items: (data as Principle[]) ?? [], loaded: true })
  },

  add: async (contents: string[]) => {
    const existing = get().items
    const maxOrder = existing.reduce((max, p) => Math.max(max, p.order), 0)

    const userId = await getCurrentUserId()
    const rows = contents.map((content, i) => ({
      content,
      order: maxOrder + i + 1,
      user_id: userId,
    }))

    const { data } = await db.from('personal_principles').insert(rows).select()

    if (data) {
      set({ items: [...existing, ...(data as Principle[])] })
    }
  },

  remove: async (id: string) => {
    await db.from('personal_principles').delete().eq('id', id)
    set({ items: get().items.filter((p) => p.id !== id) })
  },
}), {
  name: 'kura-principles',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ items: s.items }),
}))

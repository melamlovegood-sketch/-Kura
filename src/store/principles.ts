import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

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

export const usePrinciplesStore = create<PrinciplesStore>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const { data } = await supabase
      .from('personal_principles')
      .select('*')
      .order('order', { ascending: true })
      .order('created_at', { ascending: true })

    set({ items: (data as Principle[]) ?? [], loaded: true })
  },

  add: async (contents: string[]) => {
    const existing = get().items
    const maxOrder = existing.reduce((max, p) => Math.max(max, p.order), 0)

    const rows = contents.map((content, i) => ({
      content,
      order: maxOrder + i + 1,
    }))

    const { data } = await supabase.from('personal_principles').insert(rows).select()

    if (data) {
      set({ items: [...existing, ...(data as Principle[])] })
    }
  },

  remove: async (id: string) => {
    await supabase.from('personal_principles').delete().eq('id', id)
    set({ items: get().items.filter((p) => p.id !== id) })
  },
}))

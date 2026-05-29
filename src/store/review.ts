import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { useExecutionStore } from './execution'

export interface ReviewTask {
  id: string
  transaction_id: string | null
  item_name: string
  brand: string | null
  category: string | null
  due_at: string
  review_type: 'day7' | 'day30'
  status: 'pending' | 'completed'
  created_at: string
}

interface ReviewStore {
  pendingTasks: ReviewTask[]
  loaded: boolean
  load: () => Promise<void>
  createTasksForPurchase: (opts: {
    item_name: string
    brand?: string
    category?: string
    transactionId?: string
  }) => Promise<void>
  complete: (
    task: ReviewTask,
    result: {
      usage_frequency: 'everyday' | 'sometimes' | 'rarely'
      worthiness: 'worth' | 'okay' | 'regret'
    },
  ) => Promise<void>
}

export const useReviewStore = create<ReviewStore>()(persist((set, get) => ({
  pendingTasks: [],
  loaded: false,

  load: async () => {
    const { data } = await supabase
      .from('review_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })

    set({ pendingTasks: (data as ReviewTask[]) ?? [], loaded: true })
  },

  createTasksForPurchase: async ({ item_name, brand, category, transactionId }) => {
    const now = Date.now()
    await supabase.from('review_tasks').insert([
      {
        transaction_id: transactionId ?? null,
        item_name,
        brand: brand ?? null,
        category: category ?? null,
        due_at: new Date(now + 7 * 86_400_000).toISOString(),
        review_type: 'day7',
        status: 'pending',
      },
      {
        transaction_id: transactionId ?? null,
        item_name,
        brand: brand ?? null,
        category: category ?? null,
        due_at: new Date(now + 30 * 86_400_000).toISOString(),
        review_type: 'day30',
        status: 'pending',
      },
    ])
  },

  complete: async (task, { usage_frequency, worthiness }) => {
    await Promise.all([
      supabase.from('review_results').insert({ review_task_id: task.id, usage_frequency, worthiness }),
      supabase.from('review_tasks').update({ status: 'completed' }).eq('id', task.id),
    ])

    // Feed back to brand library
    if (task.brand && worthiness !== 'okay') {
      const delta = worthiness === 'worth' ? 1 : -1
      const store = useExecutionStore.getState()
      const match = store.brands.find(
        (b) =>
          b.brand_name.toLowerCase() === task.brand!.toLowerCase() &&
          (!task.category || b.category.toLowerCase() === (task.category ?? '').toLowerCase()),
      )
      if (match) await store.updateWeight(match.id, delta)
    }

    set({ pendingTasks: get().pendingTasks.filter((t) => t.id !== task.id) })
  },
}), {
  name: 'kura-review',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ pendingTasks: s.pendingTasks }),
}))

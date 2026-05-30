import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import { getCurrentUserId } from '@/lib/auth'
import { useExecutionStore } from './execution'
import { useSettingsStore } from './settings'
import {
  aggregateMonthData,
  generateStoryText,
  monthString,
  previousMonthString,
  type MonthlyStorySnapshot,
} from '@/lib/generateMonthlyStory'

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

/** One regretted purchase on the monthly board. */
export interface RegretEntry {
  item_name: string
  amount: number | null      // null when the purchase wasn't recorded as a transaction
  category: string | null
  purchase_date: string | null
}

export interface RegretBoard {
  month: string              // 'YYYY-MM'
  entries: RegretEntry[]
  total_wasted: number       // sum of known amounts
  top_category: string | null
}

/** One stored monthly review story (mirrors the monthly_stories row). */
export interface MonthlyStory {
  month: string                    // 'YYYY-MM'
  story: string                    // AI-generated narrative
  persona_key: string | null
  snapshot: MonthlyStorySnapshot   // the data it was built from (also the chat context)
}

/** Outcome of a generate attempt, so the UI can show the right message. */
export type StoryResult =
  | { ok: true; story: MonthlyStory }
  | { ok: false; reason: 'no_adapter' | 'no_activity' | 'error'; message: string }

export interface ReviewStore {
  pendingTasks: ReviewTask[]
  loaded: boolean
  regret: RegretBoard | null
  /** Generated monthly stories, keyed by 'YYYY-MM'. */
  stories: Record<string, MonthlyStory>
  storyBusy: boolean
  load: () => Promise<void>
  /** Build this month's regret board from review_results marked 'regret'. */
  loadRegret: () => Promise<void>
  /** Fetch all stored monthly stories for the current user. */
  loadStories: () => Promise<void>
  /** Generate (or regenerate with force) the story for a given month and store it. */
  generateStory: (month: string, opts?: { force?: boolean }) => Promise<StoryResult>
  /** On startup: generate last month's story once, if missing. No-op without an AI key. */
  ensureLastMonthStory: () => Promise<void>
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
  regret: null,
  stories: {},
  storyBusy: false,

  load: async () => {
    const { data } = await supabase
      .from('review_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })

    set({ pendingTasks: (data as ReviewTask[]) ?? [], loaded: true })
  },

  loadRegret: async () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // regret results this month, with their task + the originating transaction
    const { data } = await supabase
      .from('review_results')
      .select('completed_at, review_tasks!inner(item_name, category, transaction_id, transactions(amount, date))')
      .eq('worthiness', 'regret')
      .gte('completed_at', monthStart.toISOString())
      .lt('completed_at', monthEnd.toISOString())
      .order('completed_at', { ascending: false })

    type Row = {
      completed_at: string
      review_tasks: {
        item_name: string
        category: string | null
        transaction_id: string | null
        transactions: { amount: number | string | null; date: string | null } | null
      } | null
    }

    // A purchase spawns two review tasks (day7 + day30); both can be marked
    // regret. Dedupe by transaction_id so one regret == one purchase. Rows with
    // no transaction fall back to item_name as the dedupe key.
    const seen = new Set<string>()
    const entries: RegretEntry[] = []
    for (const row of (data as Row[] | null) ?? []) {
      const task = row.review_tasks
      if (!task) continue
      const key = task.transaction_id ?? `name:${task.item_name}`
      if (seen.has(key)) continue
      seen.add(key)
      const amt = task.transactions?.amount
      entries.push({
        item_name: task.item_name,
        amount: amt == null ? null : Number(amt),
        category: task.category,
        purchase_date: task.transactions?.date ?? null,
      })
    }

    const total_wasted = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0)

    // most-regretted category
    const counts = new Map<string, number>()
    for (const e of entries) {
      if (!e.category) continue
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
    }
    let top_category: string | null = null
    let topCount = 0
    for (const [cat, n] of counts) {
      if (n > topCount) { top_category = cat; topCount = n }
    }

    set({ regret: { month, entries, total_wasted, top_category } })
  },

  loadStories: async () => {
    const { data } = await supabase
      .from('monthly_stories')
      .select('month, story, persona_key, snapshot')
      .order('month', { ascending: false })

    type Row = { month: string; story: string; persona_key: string | null; snapshot: MonthlyStorySnapshot }
    const stories: Record<string, MonthlyStory> = {}
    for (const row of (data as Row[] | null) ?? []) {
      stories[row.month] = { month: row.month, story: row.story, persona_key: row.persona_key, snapshot: row.snapshot }
    }
    set({ stories })
  },

  generateStory: async (month, opts) => {
    // Same month is never regenerated unless forced.
    const existing = get().stories[month]
    if (existing && !opts?.force) return { ok: true, story: existing }

    const adapter = useSettingsStore.getState().adapter
    if (!adapter) return { ok: false, reason: 'no_adapter', message: '需要先在设置里填入 API Key 才能生成故事' }

    set({ storyBusy: true })
    try {
      const snapshot = await aggregateMonthData(month)
      if (!snapshot) return { ok: false, reason: 'no_activity', message: '这个月还没有可以复盘的消费记录' }

      const story = await generateStoryText(adapter, snapshot)
      const persona_key = snapshot.persona?.key ?? null

      await supabase.from('monthly_stories').upsert(
        { month, story, persona_key, snapshot, user_id: await getCurrentUserId(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id,month' },
      )

      const record: MonthlyStory = { month, story, persona_key, snapshot }
      set({ stories: { ...get().stories, [month]: record } })
      return { ok: true, story: record }
    } catch (err) {
      return { ok: false, reason: 'error', message: `生成失败：${(err as Error).message || '请稍后重试'}` }
    } finally {
      set({ storyBusy: false })
    }
  },

  ensureLastMonthStory: async () => {
    const now = new Date()
    const lastMonth = previousMonthString(now)
    // Only auto-generate once the month is over and we haven't stored it yet.
    if (lastMonth === monthString(now)) return
    if (get().stories[lastMonth]) return
    if (!useSettingsStore.getState().adapter) return // no key → skip silently
    await get().generateStory(lastMonth)
  },

  createTasksForPurchase: async ({ item_name, brand, category, transactionId }) => {
    const now = Date.now()
    const user_id = await getCurrentUserId()
    await supabase.from('review_tasks').insert([
      {
        transaction_id: transactionId ?? null,
        item_name,
        brand: brand ?? null,
        category: category ?? null,
        due_at: new Date(now + 7 * 86_400_000).toISOString(),
        review_type: 'day7',
        status: 'pending',
        user_id,
      },
      {
        transaction_id: transactionId ?? null,
        item_name,
        brand: brand ?? null,
        category: category ?? null,
        due_at: new Date(now + 30 * 86_400_000).toISOString(),
        review_type: 'day30',
        status: 'pending',
        user_id,
      },
    ])
  },

  complete: async (task, { usage_frequency, worthiness }) => {
    await Promise.all([
      supabase.from('review_results').insert({ review_task_id: task.id, usage_frequency, worthiness, user_id: await getCurrentUserId() }),
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

    // A fresh regret changes this month's board — refresh it.
    if (worthiness === 'regret') await get().loadRegret()
  },
}), {
  name: 'kura-review',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ pendingTasks: s.pendingTasks, stories: s.stories }),
}))

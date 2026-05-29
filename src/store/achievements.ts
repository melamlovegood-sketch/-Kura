import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '@/lib/supabase'
import {
  newlyQualified,
  NON_COLLECTOR_KEYS,
  type AchievementKey,
  type AchievementStats,
} from '@/lib/achievements'

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const daysBetween = (fromISO: string, toISO: string) => {
  const a = new Date(fromISO + 'T00:00:00')
  const b = new Date(toISO + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

interface Streak {
  current: number
  longest: number
}

interface AchievementsStore {
  unlocked: AchievementKey[]
  streak: Streak
  stats: AchievementStats | null
  loaded: boolean
  load: () => Promise<void>
  /** Recompute streak + every stat-driven badge from the DB. Idempotent. */
  recompute: () => Promise<void>
  /** Unlock an event-only badge (e.g. light_travel from the duplicate-warning flow). */
  unlock: (key: AchievementKey) => Promise<void>
}

/**
 * Streak = consecutive natural days with no new impulse, counting back from
 * today (SPEC_PHASE2 §8). A new impulse today → 0. Bounded by the first day of
 * any activity so a brand-new user with zero impulses doesn't get an infinite
 * streak.
 */
function computeStreak(impulseDates: Set<string>, firstActivityISO: string | null, today: Date): number {
  if (!firstActivityISO) return 0
  const maxDays = daysBetween(firstActivityISO, localISO(today)) + 1
  let streak = 0
  const d = new Date(today)
  while (streak < maxDays) {
    if (impulseDates.has(localISO(d))) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

async function persistStreak(current: number, longest: number, today: string) {
  const { data: existing } = await supabase.from('user_streak').select('id').limit(1).maybeSingle()
  const row = { current_streak: current, longest_streak: longest, last_check_date: today }
  if (existing) await supabase.from('user_streak').update(row).eq('id', existing.id)
  else await supabase.from('user_streak').insert(row)
}

export const useAchievementsStore = create<AchievementsStore>()(persist((set, get) => ({
  unlocked: [],
  streak: { current: 0, longest: 0 },
  stats: null,
  loaded: false,

  load: async () => {
    const [{ data: ach }, { data: streakRow }] = await Promise.all([
      supabase.from('achievements').select('achievement_key'),
      supabase.from('user_streak').select('current_streak, longest_streak').limit(1).maybeSingle(),
    ])

    set({
      unlocked: ((ach as { achievement_key: AchievementKey }[] | null) ?? []).map((r) => r.achievement_key),
      streak: streakRow
        ? { current: (streakRow as { current_streak: number }).current_streak, longest: (streakRow as { longest_streak: number }).longest_streak }
        : { current: 0, longest: 0 },
      loaded: true,
    })
  },

  recompute: async () => {
    const now = new Date()
    const todayISO = localISO(now)
    const horizon = new Date(now)
    horizon.setDate(horizon.getDate() + 7)
    const horizonISO = localISO(horizon)

    const [
      savings,
      cooldown,
      regret,
      expiry,
      pools,
      impulses,
      firstTx,
    ] = await Promise.all([
      supabase.from('savings_records').select('amount'),
      supabase.from('impulse_records').select('*', { count: 'exact', head: true }).lte('expires_at', now.toISOString()),
      supabase.from('review_results').select('*', { count: 'exact', head: true }).eq('worthiness', 'regret'),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).not('expiry_date', 'is', null).lte('expiry_date', horizonISO),
      supabase.from('wish_pools').select('*', { count: 'exact', head: true }).not('completed_at', 'is', null),
      supabase.from('impulse_records').select('recorded_at'),
      supabase.from('transactions').select('date').order('date', { ascending: true }).limit(1),
    ])

    const savingsRows = (savings.data as { amount: number | string }[] | null) ?? []
    const savingsCount = savingsRows.length
    const savingsSum = savingsRows.reduce((s, r) => s + Number(r.amount), 0)

    // streak inputs
    const impulseRows = (impulses.data as { recorded_at: string }[] | null) ?? []
    const impulseDates = new Set(impulseRows.map((r) => localISO(new Date(r.recorded_at))))
    let firstActivity: string | null = null
    for (const r of impulseRows) {
      const iso = localISO(new Date(r.recorded_at))
      if (!firstActivity || iso < firstActivity) firstActivity = iso
    }
    const firstTxDate = (firstTx.data as { date: string }[] | null)?.[0]?.date ?? null
    if (firstTxDate && (!firstActivity || firstTxDate < firstActivity)) firstActivity = firstTxDate

    const streakCurrent = computeStreak(impulseDates, firstActivity, now)

    const stats: AchievementStats = {
      savingsCount,
      savingsSum,
      cooldownCompleted: cooldown.count ?? 0,
      streakCurrent,
      regretCount: regret.count ?? 0,
      expiryTriggered: expiry.count ?? 0,
      wishPoolCompleted: pools.count ?? 0,
    }

    // ── streak persistence ──
    const longest = Math.max(get().streak.longest, streakCurrent)
    await persistStreak(streakCurrent, longest, todayISO)

    // ── unlock stat-driven badges (+ collector if all others done) ──
    const unlocked = new Set<string>(get().unlocked)
    const toUnlock = newlyQualified(stats, unlocked)
    for (const k of toUnlock) unlocked.add(k)

    const allOthers = NON_COLLECTOR_KEYS.every((k) => unlocked.has(k))
    if (allOthers && !unlocked.has('squirrel_collector')) toUnlock.push('squirrel_collector')

    if (toUnlock.length > 0) {
      await supabase
        .from('achievements')
        .upsert(toUnlock.map((achievement_key) => ({ achievement_key })), { onConflict: 'achievement_key', ignoreDuplicates: true })
    }

    set({
      stats,
      streak: { current: streakCurrent, longest },
      unlocked: [...get().unlocked, ...toUnlock.filter((k) => !get().unlocked.includes(k))],
    })
  },

  unlock: async (key) => {
    if (get().unlocked.includes(key)) return
    await supabase
      .from('achievements')
      .upsert([{ achievement_key: key }], { onConflict: 'achievement_key', ignoreDuplicates: true })

    const unlocked = [...get().unlocked, key]

    // Unlocking this badge may complete the set → collector.
    const set2 = new Set<string>(unlocked)
    if (NON_COLLECTOR_KEYS.every((k) => set2.has(k)) && !set2.has('squirrel_collector')) {
      await supabase
        .from('achievements')
        .upsert([{ achievement_key: 'squirrel_collector' }], { onConflict: 'achievement_key', ignoreDuplicates: true })
      unlocked.push('squirrel_collector')
    }

    set({ unlocked })
  },
}), {
  name: 'kura-achievements',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ unlocked: s.unlocked, streak: s.streak }),
}))

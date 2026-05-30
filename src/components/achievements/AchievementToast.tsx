import { useEffect, useState } from 'react'
import { useAchievementsStore } from '@/store/achievements'
import { ACHIEVEMENTS, type AchievementKey } from '@/lib/achievements'

const BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]))

/**
 * 成就解锁提示. Globally mounted; watches the achievements store for newly-unlocked
 * badges and shows a 2-second auto-dismissing toast for each (queued, one at a
 * time). Style matches the app's cards (bg-card / border-theme / rounded). The
 * store sets `justUnlocked` on recompute/unlock; we ingest it and clear it.
 */
export function AchievementToast() {
  const justUnlocked = useAchievementsStore((s) => s.justUnlocked)
  const clearJustUnlocked = useAchievementsStore((s) => s.clearJustUnlocked)

  const [queue, setQueue] = useState<AchievementKey[]>([])
  const [current, setCurrent] = useState<AchievementKey | null>(null)

  // Ingest new unlocks into the local queue, then clear the store flag.
  useEffect(() => {
    if (justUnlocked.length === 0) return
    setQueue((q) => [...q, ...justUnlocked])
    clearJustUnlocked()
  }, [justUnlocked, clearJustUnlocked])

  // Pull the next badge off the queue when nothing is showing.
  useEffect(() => {
    if (current || queue.length === 0) return
    setCurrent(queue[0])
    setQueue((q) => q.slice(1))
  }, [current, queue])

  // Auto-dismiss after 2s.
  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => setCurrent(null), 2000)
    return () => clearTimeout(t)
  }, [current])

  if (!current) return null
  const def = BY_KEY[current]
  if (!def) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
      <div
        className="pointer-events-auto flex max-w-[420px] items-center gap-3 rounded-2xl border-theme bg-card px-4 py-3 shadow-lg"
        style={{ animation: 'toast-drop-in 0.28s cubic-bezier(0.32,0.72,0,1)' }}
      >
        <span className="text-[26px] leading-none">{def.emoji}</span>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">解锁成就「{def.title}」</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-3">{def.desc}</p>
        </div>
      </div>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAchievementsStore } from '@/store/achievements'
import { ACHIEVEMENTS, NON_COLLECTOR_KEYS, type AchievementDef } from '@/lib/achievements'
import { cn } from '@/lib/utils'

/**
 * 我的成就 (SPEC_PHASE2 §8) — streak header + the 10-badge grid. Unlocked badges
 * are highlighted; locked ones are dimmed with a progress hint where numeric
 * progress applies.
 */
export function AchievementsSection() {
  const { unlocked, streak, stats } = useAchievementsStore()
  const unlockedSet = new Set(unlocked)
  const unlockedOthers = NON_COLLECTOR_KEYS.filter((k) => unlockedSet.has(k)).length

  function hint(def: AchievementDef): string {
    if (def.key === 'squirrel_collector') return `${unlockedOthers} / ${NON_COLLECTOR_KEYS.length}`
    if (stats && def.progress) return def.progress(stats) ?? def.desc
    return def.desc
  }

  return (
    <Card>
      <CardHeader><CardTitle>我的成就</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end gap-5">
          <div>
            <p className="font-serif text-[28px] leading-none text-amber-600 tabular-nums">{streak.current}</p>
            <p className="mt-1 text-[12px] text-ink-4">当前连续自律天数</p>
          </div>
          <div>
            <p className="font-serif text-[20px] leading-none text-ink-3 tabular-nums">{streak.longest}</p>
            <p className="mt-1 text-[12px] text-ink-4">最长记录</p>
          </div>
          <div className="flex-1 text-right">
            <p className="text-[13px] text-ink-3">{unlockedSet.size} / {ACHIEVEMENTS.length}</p>
            <p className="mt-1 text-[12px] text-ink-4">已解锁</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ACHIEVEMENTS.map((def) => {
            const isUnlocked = unlockedSet.has(def.key)
            return (
              <div
                key={def.key}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border-theme p-3 text-center transition-colors',
                  isUnlocked ? 'bg-amber-50/60 border-amber-200' : 'bg-card-alt',
                )}
              >
                <span className={cn('text-[26px] leading-none', !isUnlocked && 'opacity-25 grayscale')}>{def.emoji}</span>
                <span className={cn('text-[13px] font-medium', isUnlocked ? 'text-ink' : 'text-ink-3')}>{def.title}</span>
                <span className="text-[11px] leading-snug text-ink-4">
                  {isUnlocked ? def.desc : hint(def)}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

import { Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAchievementsStore } from '@/store/achievements'
import { ACHIEVEMENTS } from '@/lib/achievements'

/**
 * 我的成就 (SPEC_PHASE2 §8) — streak header + the 10-badge grid.
 *
 * 神秘感 (方案 B / bug5): locked badges keep their name and unlock condition
 * hidden behind a lock silhouette — only the "已解锁 X/10" counter is shown — so
 * discovering each achievement stays a surprise. Unlocked badges show normally.
 */
export function AchievementsSection() {
  const { unlocked, streak } = useAchievementsStore()
  const unlockedSet = new Set(unlocked)

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
            if (!isUnlocked) {
              // 神秘占位：隐藏名称与达成条件，只留剪影/锁。
              return (
                <div
                  key={def.key}
                  className="flex flex-col items-center gap-1 rounded-xl border-theme bg-card-alt p-3 text-center"
                >
                  <span className="flex h-[26px] items-center text-ink-4"><Lock size={20} /></span>
                  <span className="text-[13px] font-medium text-ink-3">？？？</span>
                  <span className="text-[11px] leading-snug text-ink-4">尚未解锁</span>
                </div>
              )
            }
            return (
              <div
                key={def.key}
                className="flex flex-col items-center gap-1 rounded-xl border-amber-200 bg-amber-50/60 p-3 text-center"
              >
                <span className="text-[26px] leading-none">{def.emoji}</span>
                <span className="text-[13px] font-medium text-ink">{def.title}</span>
                <span className="text-[11px] leading-snug text-ink-4">{def.desc}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

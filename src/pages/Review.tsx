import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MonthlyStoryCard } from '@/components/review/MonthlyStoryCard'
import { useReviewStore } from '@/store/review'
import { monthString, previousMonthString } from '@/lib/generateMonthlyStory'
import { formatMonth } from '@/lib/utils'

/**
 * 复盘页. Top is the monthly review story (persona + AI narrative + an embedded
 * month-scoped chat), reached from the bottom nav or the home month-start nudge.
 * Last month's story is auto-generated on startup; this month's can be generated
 * on demand here.
 */
export function Review() {
  const stories = useReviewStore((s) => s.stories)
  const storyBusy = useReviewStore((s) => s.storyBusy)
  const generateStory = useReviewStore((s) => s.generateStory)
  const loadStories = useReviewStore((s) => s.loadStories)

  const [msg, setMsg] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null) // which month is generating

  const now = new Date()
  const thisMonth = monthString(now)
  const lastMonth = previousMonthString(now)

  useEffect(() => { void loadStories() }, [loadStories])

  async function generate(month: string) {
    setMsg(null); setTarget(month)
    const res = await generateStory(month, { force: true })
    setTarget(null)
    if (!res.ok) setMsg(res.message)
  }

  // Newest first: this month (if generated), then last month, then older.
  const ordered = Object.values(stories).sort((a, b) => (a.month < b.month ? 1 : -1))

  return (
    <div className="flex flex-col gap-4 pt-6 w-full max-w-[640px] mx-auto px-6">
      <h1 className="text-base font-medium text-ink">复盘</h1>

      {ordered.length === 0 && (
        <Card>
          <p className="text-[15px] leading-relaxed text-ink-2">还没有月度复盘故事。</p>
          <p className="mt-1 text-[13px] text-ink-3">
            每月初会自动为你生成上个月的复盘故事；你也可以现在手动生成。
          </p>
        </Card>
      )}

      {ordered.map((story) => (
        <MonthlyStoryCard key={story.month} story={story} />
      ))}

      {/* ── generate controls ── */}
      <div className="flex flex-col gap-2">
        {!stories[thisMonth] && (
          <Button variant="outline" onClick={() => void generate(thisMonth)} disabled={storyBusy}>
            {storyBusy && target === thisMonth ? '生成中…' : `生成${formatMonth(thisMonth)}故事`}
          </Button>
        )}
        {!stories[lastMonth] && (
          <Button variant="outline" onClick={() => void generate(lastMonth)} disabled={storyBusy}>
            {storyBusy && target === lastMonth ? '生成中…' : `生成${formatMonth(lastMonth)}故事`}
          </Button>
        )}
      </div>

      {msg && <p className="text-[13px] leading-relaxed text-ink-3">{msg}</p>}

      <div className="h-4" />
    </div>
  )
}

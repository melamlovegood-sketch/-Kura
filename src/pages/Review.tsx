import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MonthlyStoryCard } from '@/components/review/MonthlyStoryCard'
import { RegretBoardCard } from '@/components/review/RegretBoardCard'
import { PersonaCard } from '@/components/review/PersonaCard'
import { ReviewCard } from '@/components/review/ReviewCard'
import { useReviewStore, type ReviewTask } from '@/store/review'
import { monthString } from '@/lib/generateMonthlyStory'
import { formatMonth } from '@/lib/utils'

/**
 * 复盘页. Only the current month is shown (no historical months):
 *   顶部  — 本月故事卡片（没生成则给一个生成按钮）
 *   中部  — 后悔榜 + 消费人格
 *   底部  — 待复盘清单（到期的 7天/30天 复盘任务，点「去复盘」就地展开打分）
 */
export function Review() {
  const stories = useReviewStore((s) => s.stories)
  const storyBusy = useReviewStore((s) => s.storyBusy)
  const generateStory = useReviewStore((s) => s.generateStory)
  const loadStories = useReviewStore((s) => s.loadStories)
  const pendingTasks = useReviewStore((s) => s.pendingTasks)

  const [msg, setMsg] = useState<string | null>(null)

  const thisMonth = monthString(new Date())
  const story = stories[thisMonth]

  useEffect(() => { void loadStories() }, [loadStories])

  async function generate() {
    setMsg(null)
    const res = await generateStory(thisMonth, { force: true })
    if (!res.ok) setMsg(res.message)
  }

  return (
    <div className="flex flex-col gap-4 pt-6 w-full max-w-[640px] mx-auto px-6">
      <h1 className="text-base font-medium text-ink">复盘</h1>

      {/* ── 顶部：本月故事 ── */}
      {story ? (
        <MonthlyStoryCard story={story} />
      ) : (
        <Card>
          <p className="text-[15px] leading-relaxed text-ink-2">{formatMonth(thisMonth)}的复盘故事还没生成。</p>
          <p className="mt-1 text-[13px] text-ink-3">把这个月的消费、克制和复盘串成一段话。</p>
          <Button variant="outline" className="mt-3 w-full" onClick={() => void generate()} disabled={storyBusy}>
            {storyBusy ? '生成中…' : `生成${formatMonth(thisMonth)}故事`}
          </Button>
          {msg && <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{msg}</p>}
        </Card>
      )}

      {/* ── 中部：后悔榜 + 消费人格 ── */}
      <RegretBoardCard />
      <PersonaCard />

      {/* ── 底部：待复盘清单 ── */}
      <PendingReviewList tasks={pendingTasks} />

      <div className="h-4" />
    </div>
  )
}

/** 待复盘清单：列出到期的复盘任务，点「去复盘」就地展开 ReviewCard 打分。 */
function PendingReviewList({ tasks }: { tasks: ReviewTask[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  if (tasks.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">待复盘清单</p>
      {tasks.map((task) =>
        activeId === task.id ? (
          <ReviewCard key={task.id} task={task} />
        ) : (
          <Card key={task.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] text-ink">{task.item_name}</p>
                <p className="mt-0.5 text-[12px] text-ink-4">
                  {task.review_type === 'day7' ? '7天复盘' : '30天复盘'} · 购于 {task.created_at.slice(0, 10)}
                </p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setActiveId(task.id)}>
                去复盘
              </Button>
            </div>
          </Card>
        ),
      )}
    </div>
  )
}

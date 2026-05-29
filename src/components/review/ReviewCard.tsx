import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useReviewStore, type ReviewTask } from '@/store/review'
import { cn } from '@/lib/utils'

type Frequency  = 'everyday' | 'sometimes' | 'rarely'
type Worthiness = 'worth' | 'okay' | 'regret'

const FREQ_OPTIONS:  { value: Frequency;  label: string }[] = [
  { value: 'everyday',  label: '每天用' },
  { value: 'sometimes', label: '偶尔用' },
  { value: 'rarely',    label: '没怎么用' },
]
const WORTH_OPTIONS: { value: Worthiness; label: string }[] = [
  { value: 'worth',  label: '值了' },
  { value: 'okay',   label: '还行' },
  { value: 'regret', label: '后悔了' },
]

export function ReviewCard({ task }: { task: ReviewTask }) {
  const { complete } = useReviewStore()
  const [freq,  setFreq]  = useState<Frequency | null>(null)
  const [worth, setWorth] = useState<Worthiness | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!freq || !worth || saving) return
    setSaving(true)
    void complete(task, { usage_frequency: freq, worthiness: worth })
  }, [freq, worth]) // eslint-disable-line react-hooks/exhaustive-deps

  const daysAgo = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86_400_000)

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
            购买复盘 · {task.review_type === 'day7' ? '7天' : '30天'}
          </p>
          <p className="mt-1.5 text-base font-medium text-ink">{task.item_name}</p>
          <p className="mt-0.5 text-[13px] text-ink-4">
            {daysAgo} 天前入手{task.brand && <span> · {task.brand}</span>}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-3">用了多久？</p>
          <div className="flex gap-1.5">
            {FREQ_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => !saving && setFreq(opt.value)}
                className={cn(
                  'flex-1 rounded-lg border-theme py-2 text-[13px] font-medium transition-colors',
                  freq === opt.value ? 'bg-accent text-on-accent border-transparent' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-3">值得吗？</p>
          <div className="flex gap-1.5">
            {WORTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => !saving && setWorth(opt.value)}
                className={cn(
                  'flex-1 rounded-lg border-theme py-2 text-[13px] font-medium transition-colors',
                  worth === opt.value ? worthSelected(opt.value) : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {saving && <p className="text-center text-[13px] text-ink-4">保存中…</p>}
      </div>
    </Card>
  )
}

function worthSelected(w: Worthiness): string {
  if (w === 'worth')  return 'bg-amber-100 text-amber-700 border-transparent'
  if (w === 'regret') return 'bg-red-50 text-red-600 border-transparent'
  return 'bg-accent text-on-accent border-transparent'
}

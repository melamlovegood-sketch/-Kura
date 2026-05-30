import { useState } from 'react'
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
  const [note,  setNote]  = useState('')
  const [saving, setSaving] = useState(false)

  // Both choices made → reveal the optional 一句话 box and an explicit submit, so
  // the user can add a note (or skip) instead of the card auto-saving on selection.
  const ready = !!freq && !!worth

  function handleSubmit() {
    if (!ready || saving) return
    setSaving(true)
    void complete(task, { usage_frequency: freq!, worthiness: worth!, usage_note: note.trim() || null })
  }

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

        {/* Optional one-liner — appears once both choices are made; can be skipped. */}
        {ready && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-ink-3">一句话说说？<span className="text-ink-4">（可跳过）</span></p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
              placeholder="如：穿了一次就闲置了 / 比想象中实用"
              rows={2}
              className="w-full resize-none rounded-lg border-theme bg-card-alt px-3 py-2 text-[14px] text-ink placeholder:text-ink-4 focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)] transition-colors"
            />
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="self-end rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-on-accent transition-opacity disabled:opacity-50"
            >
              {saving ? '保存中…' : note.trim() ? '提交' : '跳过并提交'}
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}

function worthSelected(w: Worthiness): string {
  if (w === 'worth')  return 'bg-amber-100 text-amber-700 border-transparent'
  if (w === 'regret') return 'bg-red-50 text-red-600 border-transparent'
  return 'bg-accent text-on-accent border-transparent'
}

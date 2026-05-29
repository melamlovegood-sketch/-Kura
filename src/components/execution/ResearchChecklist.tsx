import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/store/settings'
import { generateResearchChecklist } from '@/lib/generateDecisionBrief'
import { cn } from '@/lib/utils'

interface Item { id: string; text: string; done: boolean }

let _seq = 0
const nextId = () => `c${_seq++}`

/**
 * 研究模式任务清单（SPEC_PHASE3 §4.1）. AI generates a category-specific checklist;
 * the user can check / delete / add items. "确认购买" only activates once every
 * item is checked. Research time is measured from `startedAt` (set when the user
 * entered the execute phase) so we can show "你研究了 X 分钟".
 */
export function ResearchChecklist({
  category,
  estimatedPrice,
  startedAt,
  onConfirm,
}: {
  category: string
  estimatedPrice: number | null
  startedAt: number
  onConfirm: () => void
}) {
  const adapter = useSettingsStore((s) => s.adapter)
  const [items, setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [newText, setNewText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    abortRef.current = ctrl
    async function run() {
      setLoading(true)
      const list = adapter
        ? await generateResearchChecklist(adapter, category, estimatedPrice, ctrl.signal)
        : ['看一篇评测', '比较 3 个选项', '确认退换货政策', '查二手价']
      if (cancelled) return
      setItems(list.map((text) => ({ id: nextId(), text, done: false })))
      setLoading(false)
    }
    void run()
    return () => { cancelled = true; ctrl.abort() }
  }, [category, estimatedPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  const allDone = items.length > 0 && items.every((i) => i.done)
  const researchedMinutes = useMemo(() => Math.max(1, Math.round((Date.now() - startedAt) / 60000)), [allDone]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) { setItems((xs) => xs.map((i) => (i.id === id ? { ...i, done: !i.done } : i))) }
  function remove(id: string) { setItems((xs) => xs.filter((i) => i.id !== id)) }
  function add() {
    const t = newText.trim()
    if (!t) return
    setItems((xs) => [...xs, { id: nextId(), text: t, done: false }])
    setNewText(''); setAdding(false)
  }

  return (
    <Card>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">买之前你需要</p>

      {loading ? (
        <p className="flex items-center gap-1.5 py-3 text-[15px] text-ink-3">
          正在生成研究清单<span className="inline-block h-3 w-0.5 animate-pulse bg-ink-4" />
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-2.5 py-1">
              <button onClick={() => toggle(i.id)}
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                  i.done ? 'border-[var(--accent)] bg-accent text-on-accent' : 'border-[var(--border)] hover:border-[var(--text-muted)]',
                )}>
                {i.done && <Check size={12} strokeWidth={3} />}
              </button>
              <span className={cn('flex-1 text-[15px] transition-colors', i.done ? 'text-ink-4 line-through' : 'text-ink-2')}>
                {i.text}
              </span>
              <button onClick={() => remove(i.id)}
                className="shrink-0 text-ink-4 opacity-0 transition-opacity hover:text-ink-3 group-hover:opacity-100">
                <X size={14} />
              </button>
            </li>
          ))}

          {adding ? (
            <li className="flex items-center gap-2 py-1">
              <input type="text" value={newText} onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="加一项要做的事" autoFocus
                className="flex-1 bg-transparent text-[15px] text-ink outline-none border-b-theme focus:border-b-[var(--text-muted)] pb-0.5 placeholder:text-ink-4" />
              <Button size="sm" onClick={add} disabled={!newText.trim()}>添加</Button>
            </li>
          ) : (
            <li>
              <button onClick={() => setAdding(true)} className="mt-1 flex items-center gap-1 text-[13px] text-ink-4 hover:text-ink-3 transition-colors">
                <Plus size={13} /> 添加一项
              </button>
            </li>
          )}
        </ul>
      )}

      {!loading && (
        <div className="mt-4 border-t-theme pt-3">
          {allDone && (
            <p className="mb-3 text-[13px] text-ink-3">你研究了 {researchedMinutes} 分钟，现在可以下单了。</p>
          )}
          <Button className="w-full" disabled={!allDone} onClick={onConfirm}>
            {allDone ? '确认购买 →' : `还有 ${items.filter((i) => !i.done).length} 项没做完`}
          </Button>
        </div>
      )}
    </Card>
  )
}

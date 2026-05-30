import { useState } from 'react'
import { X, Plus, Pencil, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSubscriptionStore } from '@/store/subscriptions'
import { useSettingsStore } from '@/store/settings'
import { routeIntent } from '@/lib/ai/router'
import { formatAmount, cn } from '@/lib/utils'
import type { Subscription, SubscriptionCategory } from '@/types/db'

const SUB_CATEGORIES: SubscriptionCategory[] = ['streaming', 'tools', 'transport', 'other']

const CATEGORIES: { value: SubscriptionCategory; label: string }[] = [
  { value: 'streaming', label: '流媒体' },
  { value: 'tools',     label: '工具' },
  { value: 'transport', label: '出行' },
  { value: 'other',     label: '其他' },
]
const CAT_LABEL: Record<SubscriptionCategory, string> = {
  streaming: '流媒体', tools: '工具', transport: '出行', other: '其他',
}

type Draft = { name: string; amount: string; billing_day: string; category: SubscriptionCategory }
const EMPTY: Draft = { name: '', amount: '', billing_day: '', category: 'other' }

/**
 * 订阅管理 (SPEC_PHASE2 §2) — Settings list with add / edit / delete and an
 * active toggle. Subscriptions auto-record a transaction each month and surface
 * a Home reminder before the charge.
 */
export function SubscriptionManager() {
  const { items, add, update, remove, toggleActive } = useSubscriptionStore()
  const adapter = useSettingsStore((s) => s.adapter)
  const [editingId, setEditingId] = useState<string | null>(null) // null = not editing; 'new' = add form
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)

  // ── AI natural-language add (bug7) ──
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function handleAIParse() {
    const v = aiText.trim()
    if (!v || aiBusy) return
    if (!adapter) { setAiError('请先在设置里填写 API Key'); return }
    setAiBusy(true); setAiError(null)
    try {
      const result = await routeIntent(adapter, v)
      const d = result.data as Record<string, unknown>
      const name = typeof d.name === 'string' ? d.name : ''
      const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount)
      const billingDay = typeof d.billing_day === 'number' ? d.billing_day : Number(d.billing_day)
      if (result.module !== 'subscription' || !name) {
        setAiError('没识别成订阅，请换种说法或手动填写')
        return
      }
      const category = (SUB_CATEGORIES as string[]).includes(String(d.category)) ? (d.category as SubscriptionCategory) : 'other'
      // Drop the parsed result into the edit form so the user confirms/tweaks
      // before it's saved — manual entry stays the fallback.
      setDraft({
        name,
        amount: amount > 0 ? String(amount) : '',
        billing_day: billingDay >= 1 && billingDay <= 31 ? String(billingDay) : '',
        category,
      })
      setEditingId('new')
      setAiText('')
    } catch (err) {
      setAiError(`解析失败：${(err as Error).message || '请稍后重试'}`)
    } finally { setAiBusy(false) }
  }

  function openAdd() { setDraft(EMPTY); setEditingId('new') }
  function openEdit(s: Subscription) {
    setDraft({ name: s.name, amount: String(s.amount), billing_day: String(s.billing_day), category: s.category })
    setEditingId(s.id)
  }
  function cancel() { setEditingId(null); setDraft(EMPTY) }

  const valid =
    draft.name.trim() !== '' &&
    Number(draft.amount) > 0 &&
    Number(draft.billing_day) >= 1 && Number(draft.billing_day) <= 31

  async function save() {
    if (!valid) return
    setBusy(true)
    try {
      const payload = {
        name: draft.name.trim(),
        amount: Number(draft.amount),
        billing_day: Number(draft.billing_day),
        category: draft.category,
      }
      if (editingId === 'new') await add(payload)
      else if (editingId) await update(editingId, payload)
      cancel()
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle>订阅管理</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-4">
          周期性固定订阅。每月扣款日自动记一笔基础支出，扣款前 3 天主页提醒。
        </p>

        {/* AI 自然语言添加（bug7）：一句话解析 → 预填表单确认 */}
        <div className="flex flex-col gap-2 rounded-xl border-theme bg-card-alt p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
            <Sparkles size={13} /> 用一句话添加
          </div>
          <div className="flex gap-2">
            <input
              value={aiText}
              onChange={(e) => { setAiText(e.target.value); setAiError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAIParse() }}
              placeholder="如：百度网盘会员每月 8 号扣 25 块"
              className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
            />
            <Button size="sm" onClick={() => void handleAIParse()} disabled={!aiText.trim() || aiBusy}>{aiBusy ? '识别中…' : 'AI 解析'}</Button>
          </div>
          {aiError && <p className="text-[12px] text-red-500">{aiError}</p>}
        </div>

        {items.length > 0 ? (
          <ul className="flex flex-col">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 border-t-theme first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('truncate text-[15px]', s.is_active ? 'text-ink' : 'text-ink-4 line-through')}>{s.name}</span>
                    <span className="shrink-0 rounded border-theme px-1.5 py-0.5 text-[11px] text-ink-4">{CAT_LABEL[s.category]}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-4">
                    <span className="font-serif text-ink-3">{formatAmount(s.amount)}</span> · 每月 {s.billing_day} 号
                  </p>
                </div>
                <button
                  onClick={() => void toggleActive(s.id)}
                  className={cn('shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium transition-colors',
                    s.is_active ? 'text-ink-3 hover:bg-card-alt' : 'text-ink-4 hover:bg-card-alt')}
                >
                  {s.is_active ? '暂停' : '启用'}
                </button>
                <button onClick={() => openEdit(s)} className="shrink-0 text-ink-4 hover:text-ink-2 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => void remove(s.id)} className="shrink-0 text-ink-4 hover:text-ink-2 transition-colors"><X size={15} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-4">还没有订阅</p>
        )}

        {editingId ? (
          <div className="flex flex-col gap-3 rounded-xl border-theme bg-card-alt p-3">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="名称，如 百度网盘会员" />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] text-ink-4">金额（元）</label>
                <Input type="number" min={0} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="¥" />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] text-ink-4">每月几号扣</label>
                <Input type="number" min={1} max={31} value={draft.billing_day} onChange={(e) => setDraft({ ...draft, billing_day: e.target.value })} placeholder="1-31" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c.value} onClick={() => setDraft({ ...draft, category: c.value })}
                  className={cn('rounded-lg border-theme px-3 py-1.5 text-[13px] font-medium transition-colors',
                    draft.category === c.value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:bg-card hover:text-ink-2')}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={cancel}>取消</Button>
              <Button size="sm" onClick={() => void save()} disabled={!valid || busy}>{busy ? '保存中…' : '保存'}</Button>
            </div>
          </div>
        ) : (
          <button onClick={openAdd} className="flex items-center gap-1.5 self-start text-[13px] text-ink-3 hover:text-ink transition-colors">
            <Plus size={14} /> 添加订阅
          </button>
        )}
      </CardContent>
    </Card>
  )
}

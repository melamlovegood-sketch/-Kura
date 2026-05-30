import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Paperclip, Sparkles, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { ConfirmTransactionCard } from '@/components/transaction/ConfirmTransactionCard'
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager'
import { useSettingsStore } from '@/store/settings'
import { useBudgetStore } from '@/store/budget'
import { db } from '@/lib/db'
import { addTransaction } from '@/store/transactions'
import { parseTransaction } from '@/lib/parseTransaction'
import { CATEGORY_META, CATEGORY_GROUPS } from '@/lib/categories'
import { fileToBase64, formatAmount, formatMonth, cn } from '@/lib/utils'
import { monthString } from '@/lib/generateMonthlyStory'
import type { CategoryMain, ItemCategory, ParsedTransaction } from '@/types/db'

interface TxRow {
  id: string
  date: string
  amount: number | string
  category: ItemCategory
  category_main: CategoryMain
  description: string | null
  source: 'text' | 'screenshot' | null
  created_at: string
}

interface MonthBudget {
  basic_life_limit: number
  discretionary_limit: number
}

const pad = (n: number) => String(n).padStart(2, '0')
function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1) // m is 1-based → Date month index gives the next month
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

/**
 * 账单页 (/billing). Top: this-month 基础/可支配 overview. Then AI 记账 (text +
 * screenshot → confirm → transactions). Then 消费明细 grouped by the two main
 * categories, reverse-chronological, with a month switcher. 订阅管理 lives at the
 * bottom (moved here out of 设置).
 */
export function Billing() {
  const thisMonth = monthString(new Date())
  const [month, setMonth] = useState(thisMonth)
  const [txns, setTxns] = useState<TxRow[]>([])
  const [budget, setBudget] = useState<MonthBudget | null>(null)
  const refreshHomeBudget = useBudgetStore((s) => s.refresh)

  async function reload(m: string) {
    const [txRes, bRes] = await Promise.all([
      db.from('transactions')
        .select('id, date, amount, category, category_main, description, source, created_at')
        .gte('date', `${m}-01`)
        .lt('date', nextMonthStart(m))
        .order('created_at', { ascending: false }),
      db.from('monthly_budgets')
        .select('basic_life_limit, discretionary_limit')
        .eq('month', m)
        .maybeSingle(),
    ])
    setTxns((txRes.data as TxRow[] | null) ?? [])
    setBudget((bRes.data as MonthBudget | null) ?? null)
  }

  useEffect(() => { void reload(month) }, [month])

  const basicUsed = txns.filter((t) => t.category_main === 'basic_life').reduce((s, t) => s + Number(t.amount), 0)
  const discrUsed = txns.filter((t) => t.category_main === 'discretionary').reduce((s, t) => s + Number(t.amount), 0)

  async function handleSaved() {
    await reload(month)
    // Keep Home's budget card in sync when we just recorded into the current month.
    if (month === thisMonth) void refreshHomeBudget()
  }

  const canGoNext = month < thisMonth

  return (
    <div className="flex flex-col gap-5 pt-6 w-full max-w-[640px] mx-auto px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-medium text-ink">账单</h1>
        <MonthSwitcher
          month={month}
          canGoNext={canGoNext}
          onPrev={() => setMonth(shiftMonth(month, -1))}
          onNext={() => canGoNext && setMonth(shiftMonth(month, 1))}
        />
      </div>

      {/* ① 本月概览 */}
      <Card>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
          {month === thisMonth ? '本月概览' : `${formatMonth(month)}概览`}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <OverviewRow label="基础支出" used={basicUsed} limit={budget?.basic_life_limit ?? null} />
          <OverviewRow label="可支配"   used={discrUsed} limit={budget?.discretionary_limit ?? null} />
        </div>
      </Card>

      {/* ② AI 记账入口 */}
      <AIRecordCard onSaved={handleSaved} />

      {/* ③ 消费明细 */}
      <TransactionDetail txns={txns} />

      {/* ④ 订阅管理（从设置页迁移过来） */}
      <SubscriptionManager />

      <div className="h-16 md:h-4" />
    </div>
  )
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function MonthSwitcher({ month, canGoNext, onPrev, onNext }: {
  month: string; canGoNext: boolean; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-ink-3">
      <button onClick={onPrev} className="rounded-md p-1 text-ink-4 transition-colors hover:text-ink-2">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[72px] text-center tabular-nums">{formatMonth(month)}</span>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="rounded-md p-1 text-ink-4 transition-colors hover:text-ink-2 disabled:opacity-30"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

function OverviewRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const over = limit != null && used > limit
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[14px] text-ink-2">{label}</span>
      <span className="font-serif tabular-nums">
        <span className={cn('text-[18px]', over ? 'text-red-500' : 'text-ink')}>{formatAmount(used)}</span>
        <span className="text-[13px] text-ink-4"> / {limit != null ? formatAmount(limit) : '未设置'}</span>
      </span>
    </div>
  )
}

/* ── ② AI 记账 ─────────────────────────────────────────────────────────────── */

function AIRecordCard({ onSaved }: { onSaved: () => Promise<void> }) {
  const adapter = useSettingsStore((s) => s.adapter)
  const [text, setText] = useState('')
  const [image, setImage] = useState<{ file: File; base64: string } | null>(null)
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null)
  const [source, setSource] = useState<'text' | 'screenshot'>('text')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasInput = !!text.trim() || !!image

  function pickImage(base64: string, file: File) {
    setImage({ file, base64 }); setParsed(null); setError(null)
  }
  async function onInputFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    pickImage(await fileToBase64(file), file)
    e.target.value = ''
  }

  async function handleParse() {
    if (busy || !hasInput) return
    if (!adapter) { setError('请先在设置里填写 API Key'); return }
    setBusy(true); setError(null)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const tx = await parseTransaction(adapter, text, image?.base64, ctrl.signal)
      setSource(image ? 'screenshot' : 'text')
      setParsed(tx)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(`解析失败：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm(tx: ParsedTransaction) {
    await addTransaction(tx, source)
    setParsed(null); setText(''); setImage(null)
    await onSaved()
  }

  if (parsed) {
    return (
      <ConfirmTransactionCard
        initial={parsed}
        source={source}
        onConfirm={handleConfirm}
        onCancel={() => setParsed(null)}
      />
    )
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-3">
        <Sparkles size={14} /> AI 记账
      </div>
      <ImageDropZone onFile={pickImage} className="flex flex-col gap-2.5">
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setError(null) }}
          placeholder="说一句话，如「中午食堂15块」，或拖拽 / 上传支付截图…"
          rows={2}
          className="w-full resize-none rounded-xl border-theme bg-card-alt px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-4 transition-colors focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)]"
          style={{ maxHeight: 140 }}
        />

        {image && (
          <div className="flex items-center gap-2">
            <span className="max-w-[240px] truncate text-[13px] text-ink-4">{image.file.name}</span>
            <button onClick={() => { setImage(null); setParsed(null) }} className="text-ink-4 transition-colors hover:text-ink-3">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink-2"
          >
            <Paperclip size={14} /> 上传截图
          </button>
          <Button size="sm" onClick={() => void handleParse()} disabled={!hasInput || busy}>
            {busy ? '识别中…' : 'AI 解析'}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInputFile} />
      </ImageDropZone>

      {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
    </Card>
  )
}

/* ── ③ 消费明细 ─────────────────────────────────────────────────────────────── */

function TransactionDetail({ txns }: { txns: TxRow[] }) {
  if (txns.length === 0) {
    return (
      <Card>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">消费明细</p>
        <p className="mt-2 text-[13px] text-ink-4">这个月还没有记账</p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">消费明细</p>
      {CATEGORY_GROUPS.map((group) => {
        const rows = txns.filter((t) => t.category_main === group.main)
        if (rows.length === 0) return null
        const total = rows.reduce((s, t) => s + Number(t.amount), 0)
        return <CategoryGroup key={group.main} label={group.label} total={total} rows={rows} />
      })}
    </div>
  )
}

function CategoryGroup({ label, total, rows }: { label: string; total: number; rows: TxRow[] }) {
  const [open, setOpen] = useState(true)
  return (
    <Card className="py-0 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-4">
        <span className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
          {label}
          <ChevronDown size={14} className={cn('text-ink-4 transition-transform', !open && '-rotate-90')} />
          <span className="text-[12px] font-normal text-ink-4">{rows.length} 笔</span>
        </span>
        <span className="font-serif text-[15px] text-ink-2 tabular-nums">{formatAmount(total)}</span>
      </button>
      {open && (
        <ul className="flex flex-col pb-2">
          {rows.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-3 border-t-theme py-2.5">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[14px] text-ink-2">{t.description || CATEGORY_META[t.category].label}</span>
                <span className="shrink-0 rounded border-theme px-1.5 py-0.5 text-[11px] text-ink-4">{CATEGORY_META[t.category].label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[11px] text-ink-4 tabular-nums">{t.date.slice(5)}</span>
                <span className="font-serif text-[15px] text-ink tabular-nums">{formatAmount(Number(t.amount))}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

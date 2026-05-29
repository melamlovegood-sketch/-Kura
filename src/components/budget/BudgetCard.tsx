import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBudgetStore } from '@/store/budget'
import { useCountUp } from '@/hooks/useCountUp'
import { daysUntilMonthEnd, dailyRemaining } from '@/lib/budget'
import { formatAmount, cn } from '@/lib/utils'
import type { BudgetData } from '@/types/db'

export function BudgetCard() {
  const { data, loading, upsert } = useBudgetStore()
  const [setupOpen, setSetupOpen] = useState(false)

  if (loading && !data) {
    return (
      <Card>
        <p className="text-[13px] text-ink-4">加载中…</p>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">本月预算</p>
          {!setupOpen && (
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
              设置预算
            </Button>
          )}
        </div>
        {setupOpen ? (
          <div className="mt-3">
            <BudgetSetupForm
              onSave={async (l) => { await upsert(l); setSetupOpen(false) }}
              onCancel={() => setSetupOpen(false)}
            />
          </div>
        ) : (
          <p className="mt-2 text-[15px] text-ink-3">未设置本月预算</p>
        )}
      </Card>
    )
  }

  const discrRemaining = data.discretionary_limit - data.discretionary_used
  const basicRemaining = data.basic_life_limit - data.basic_life_used
  const isOverspent = discrRemaining + basicRemaining < 0

  return (
    <Card className={cn(isOverspent && 'bg-red-50/50 border-red-200/50')}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
          {isOverspent ? '本月已超支' : '还能花'}
        </p>
        <button
          onClick={() => setSetupOpen((o) => !o)}
          className="text-[11px] text-ink-4 hover:text-ink-3 transition-colors"
        >
          {setupOpen ? '收起' : '修改'}
        </button>
      </div>

      {setupOpen ? (
        <div className="mt-3">
          <BudgetSetupForm
            initial={{ basic_life_limit: data.basic_life_limit, discretionary_limit: data.discretionary_limit }}
            onSave={async (l) => { await upsert(l); setSetupOpen(false) }}
            onCancel={() => setSetupOpen(false)}
          />
        </div>
      ) : (
        <BudgetDisplay data={data} />
      )}
    </Card>
  )
}

function BudgetDisplay({ data }: { data: BudgetData }) {
  const discrRemaining = Math.round(data.discretionary_limit - data.discretionary_used)
  const basicRemaining = Math.round(data.basic_life_limit - data.basic_life_used)
  const totalRemaining = discrRemaining + basicRemaining
  const totalLimit = data.discretionary_limit + data.basic_life_limit
  const remainPct = totalLimit > 0 ? (totalRemaining / totalLimit) * 100 : 0
  const days = daysUntilMonthEnd()

  const animValue = useCountUp(Math.max(0, totalRemaining), 800)

  const prevRef = useRef(totalRemaining)
  const [flash, setFlash] = useState<'none' | 'amber' | 'red'>('none')
  const [pctInfo, setPctInfo] = useState<{ value: number; visible: boolean }>({ value: 0, visible: false })

  useEffect(() => {
    const prev = prevRef.current
    const delta = prev - totalRemaining
    if (delta > 0 && prev > 0) {
      if ('vibrate' in navigator) navigator.vibrate(30)

      if (delta >= 200) {
        setFlash('red')
        setPctInfo({ value: Math.round((delta / Math.max(prev, 1)) * 100), visible: true })
        const t = setTimeout(() => {
          setFlash('none')
          setPctInfo((p) => ({ ...p, visible: false }))
        }, 2000)
        prevRef.current = totalRemaining
        return () => clearTimeout(t)
      } else if (delta >= 50) {
        setFlash('amber')
        const t = setTimeout(() => setFlash('none'), 600)
        prevRef.current = totalRemaining
        return () => clearTimeout(t)
      }
    }
    prevRef.current = totalRemaining
  }, [totalRemaining])

  const isOverspent = totalRemaining < 0
  const isCritical = !isOverspent && remainPct < 20
  const isCaution = !isOverspent && !isCritical && remainPct < 50

  const numColorClass =
    isOverspent || isCritical || flash === 'red'
      ? 'text-red-500'
      : isCaution || flash === 'amber'
        ? 'text-amber-600'
        : 'text-ink'

  return (
    <div className="mt-1 flex flex-col gap-2">
      <span
        className={cn(
          'font-serif tabular-nums leading-none transition-colors duration-300',
          numColorClass,
          isCritical ? 'text-[60px]' : 'text-[52px]',
        )}
      >
        {isOverspent ? formatAmount(Math.abs(totalRemaining)) : formatAmount(animValue)}
      </span>

      <div className="flex gap-3 text-[13px] text-ink-4">
        <span>
          可支配{' '}
          <span className={cn('text-ink-3', discrRemaining < 0 && 'text-red-400')}>
            {formatAmount(Math.max(0, discrRemaining))}
          </span>
        </span>
        <span>·</span>
        <span>
          基础生活{' '}
          <span className={cn('text-ink-3', basicRemaining < 0 && 'text-red-400')}>
            {formatAmount(Math.max(0, basicRemaining))}
          </span>
        </span>
      </div>

      {isCaution && days > 0 && (
        <p className="text-[12px] text-amber-600">距月底还有 {days} 天</p>
      )}
      {isCritical && (
        <p className="text-[12px] text-red-500">
          平均每天只剩 ¥{dailyRemaining(Math.max(0, totalRemaining), Math.max(1, days))}
        </p>
      )}
      {pctInfo.visible && (
        <p className="text-[12px] text-ink-4">这笔占本月剩余的 {pctInfo.value}%</p>
      )}
    </div>
  )
}

interface SetupFormProps {
  initial?: { basic_life_limit: number; discretionary_limit: number }
  onSave: (l: { basic_life_limit: number; discretionary_limit: number }) => Promise<void>
  onCancel: () => void
}

function BudgetSetupForm({ initial, onSave, onCancel }: SetupFormProps) {
  const [basicLimit, setBasicLimit] = useState(initial?.basic_life_limit ?? 0)
  const [discrLimit, setDiscrLimit] = useState(initial?.discretionary_limit ?? 0)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (basicLimit <= 0 || discrLimit <= 0) return
    setSaving(true)
    try { await onSave({ basic_life_limit: basicLimit, discretionary_limit: discrLimit }) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border-theme bg-card-alt p-4">
      <AmountRow label="基础生活" value={basicLimit} onChange={setBasicLimit} />
      <AmountRow label="可支配"   value={discrLimit} onChange={setDiscrLimit} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
        <Button size="sm" onClick={() => void handleSave()} disabled={saving || basicLimit <= 0 || discrLimit <= 0}>
          {saving ? '保存中…' : '确认'}
        </Button>
      </div>
    </div>
  )
}

function AmountRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[13px] text-ink-3">{label}</span>
      <div className="flex flex-1 items-center gap-1 border-b-theme pb-0.5 focus-within:border-b-[var(--text-muted)] transition-colors">
        <span className="text-[13px] text-ink-4">¥</span>
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder="0"
          min={0}
          className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4"
        />
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useBudgetStore } from '@/store/budget'
import { formatAmount } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function BudgetCard() {
  const { data, loading, upsert } = useBudgetStore()
  const [setupOpen, setSetupOpen] = useState(false)

  if (loading && !data) {
    return (
      <Card><CardHeader><CardTitle>本月预算</CardTitle></CardHeader>
        <CardContent><p className="text-[13px] text-ink-4">加载中…</p></CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle>本月预算</CardTitle></CardHeader>
        <CardContent>
          {setupOpen ? (
            <BudgetSetupForm
              onSave={async (l) => { await upsert(l); setSetupOpen(false) }}
              onCancel={() => setSetupOpen(false)}
            />
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-[15px] text-ink-3">未设置本月预算</p>
              <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>设置预算</Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>本月预算</CardTitle>
        <button
          onClick={() => setSetupOpen((o) => !o)}
          className="text-[11px] text-ink-4 hover:text-ink-3 transition-colors"
        >
          {setupOpen ? '收起' : '修改'}
        </button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {setupOpen ? (
          <BudgetSetupForm
            initial={{ basic_life_limit: data.basic_life_limit, discretionary_limit: data.discretionary_limit }}
            onSave={async (l) => { await upsert(l); setSetupOpen(false) }}
            onCancel={() => setSetupOpen(false)}
          />
        ) : (
          <>
            <BudgetRow label="基础生活" used={data.basic_life_used} limit={data.basic_life_limit} />
            <BudgetRow label="可支配"   used={data.discretionary_used} limit={data.discretionary_limit} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function BudgetRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct  = limit > 0 ? (used / limit) * 100 : 0
  const warn = pct > 80
  const over = pct >= 100

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <span className="text-[13px] text-ink-3">{label}</span>
        <span>
          <span className={cn('font-serif text-[16px]', over ? 'text-red-500' : warn ? 'text-amber-600' : 'text-ink')}>
            {formatAmount(used)}
          </span>
          <span className="font-serif text-[13px] text-ink-4"> / {formatAmount(limit)}</span>
        </span>
      </div>
      <Progress
        value={Math.min(pct, 100)}
        barClassName={over ? 'bg-red-400' : warn ? 'bg-amber-400' : undefined}
      />
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

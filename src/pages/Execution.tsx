import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useExecutionStore, type BrandEntry } from '@/store/execution'
import { useReviewStore } from '@/store/review'
import { addExecutionTransaction } from '@/store/transactions'
import { useBudgetStore } from '@/store/budget'
import { cn } from '@/lib/utils'

type Phase =
  | { name: 'setup' }
  | { name: 'timing';    category: string; sessionId: string; totalSeconds: number }
  | { name: 'expired';   category: string; sessionId: string }
  | { name: 'recording'; category: string; sessionId: string }
  | { name: 'done'; decision: 'skipped' | 'undecided' }

const DEFAULT_DURATION = 15 * 60

export function Execution() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const execStore   = useExecutionStore()
  const reviewStore = useReviewStore()
  const budgetStore = useBudgetStore()
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })

  // Optional prefill passed from Home's intent routing (e.g. "我要去买球鞋").
  const prefill = (location.state as { prefill?: { category?: string } } | null)?.prefill
  const initialCategory = prefill?.category ?? ''

  return (
    <div className="flex flex-col gap-4 pt-6 w-full max-w-[640px] mx-auto px-6">
      <h1 className="text-base font-medium text-ink">执行层</h1>

      {phase.name === 'setup' && (
        <SetupPhase execStore={execStore} initialCategory={initialCategory}
          onStart={(category, sessionId) => setPhase({ name: 'timing', category, sessionId, totalSeconds: DEFAULT_DURATION })}
        />
      )}
      {phase.name === 'timing' && (
        <TimingPhase phase={phase} execStore={execStore}
          onExpire={() => setPhase({ name: 'expired', category: phase.category, sessionId: phase.sessionId })}
          onEarlyDecide={() => setPhase({ name: 'expired', category: phase.category, sessionId: phase.sessionId })}
        />
      )}
      {phase.name === 'expired' && (
        <ExpiredPhase phase={phase} execStore={execStore}
          onBought={() => setPhase({ name: 'recording', category: phase.category, sessionId: phase.sessionId })}
          onSkip={async () => { await execStore.endSession(phase.sessionId, 'skipped'); setPhase({ name: 'done', decision: 'skipped' }) }}
          onUndecided={async () => { await execStore.endSession(phase.sessionId, 'undecided'); setPhase({ name: 'done', decision: 'undecided' }) }}
        />
      )}
      {phase.name === 'recording' && (
        <RecordingPhase phase={phase} execStore={execStore} reviewStore={reviewStore}
          onDone={async () => { void budgetStore.refresh(); navigate('/') }}
        />
      )}
      {phase.name === 'done' && (
        <DonePhase decision={phase.decision} onBack={() => navigate('/')} />
      )}
    </div>
  )
}

function SetupPhase({ execStore, onStart, initialCategory = '' }: { execStore: ReturnType<typeof useExecutionStore>; onStart: (c: string, id: string) => void; initialCategory?: string }) {
  const [category, setCategory] = useState(initialCategory)
  const [starting, setStarting] = useState(false)
  const categoryBrands = category.trim() ? execStore.brandsForCategory(category.trim()) : []

  async function handleStart() {
    if (!category.trim()) return
    setStarting(true)
    const id = await execStore.createSession(category.trim(), DEFAULT_DURATION)
    setStarting(false); onStart(category.trim(), id)
  }

  return (
    <>
      <Card>
        <CardHeader><CardTitle>买什么？</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            type="text" value={category} onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleStart() }}
            placeholder="品类，如：球鞋、裤子、耳机…" autoFocus
            className="w-full bg-transparent text-[15px] text-ink outline-none border-b-theme focus:border-b-[var(--text-muted)] pb-1 placeholder:text-ink-4 transition-colors"
          />
          <Button onClick={() => void handleStart()} disabled={!category.trim() || starting}>
            {starting ? '准备中…' : '开始 15 分钟计时 →'}
          </Button>
        </CardContent>
      </Card>
      {category.trim() && <BrandSection category={category.trim()} brands={categoryBrands} execStore={execStore} />}
      <SOPSection rules={execStore.sopRules} defaultOpen />
    </>
  )
}

function TimingPhase({ phase, execStore, onExpire, onEarlyDecide }: {
  phase: Extract<Phase, { name: 'timing' }>; execStore: ReturnType<typeof useExecutionStore>; onExpire: () => void; onEarlyDecide: () => void
}) {
  const remaining = useCountdown(phase.totalSeconds, onExpire)
  const brands = execStore.brandsForCategory(phase.category)
  return (
    <>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-4">
          <p className="text-[13px] text-ink-4">{phase.category}</p>
          <CountdownDisplay remaining={remaining} total={phase.totalSeconds} />
          <Button variant="outline" size="sm" onClick={onEarlyDecide}>提前决策</Button>
        </CardContent>
      </Card>
      {brands.length > 0 && <BrandSection category={phase.category} brands={brands} execStore={execStore} readonly />}
      <SOPSection rules={execStore.sopRules} />
    </>
  )
}

function ExpiredPhase({ phase, execStore, onBought, onSkip, onUndecided }: {
  phase: Extract<Phase, { name: 'expired' }>; execStore: ReturnType<typeof useExecutionStore>
  onBought: () => void; onSkip: () => Promise<void>; onUndecided: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const brands = execStore.brandsForCategory(phase.category)
  async function handle(action: () => Promise<void>) { setLoading(true); try { await action() } finally { setLoading(false) } }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="font-serif text-2xl text-ink">时间到了</p>
          <p className="text-[15px] text-ink-3">{phase.category} · 做出决定</p>
          <div className="flex w-full gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => void handle(onSkip)} disabled={loading}>跳过</Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => void handle(onUndecided)} disabled={loading}>留着想</Button>
            <Button size="sm" className="flex-1" onClick={onBought} disabled={loading}>买了 →</Button>
          </div>
        </CardContent>
      </Card>
      {brands.length > 0 && <BrandSection category={phase.category} brands={brands} execStore={execStore} readonly />}
    </>
  )
}

function RecordingPhase({ phase, execStore, reviewStore, onDone }: {
  phase: Extract<Phase, { name: 'recording' }>; execStore: ReturnType<typeof useExecutionStore>
  reviewStore: ReturnType<typeof useReviewStore>; onDone: () => Promise<void>
}) {
  const [itemName, setItemName] = useState('')
  const [amount, setAmount]     = useState(0)
  const [brand, setBrand]       = useState('')
  const [saving, setSaving]     = useState(false)
  const brands = execStore.brandsForCategory(phase.category)

  async function handleConfirm() {
    if (amount <= 0) return; setSaving(true)
    try {
      const name = itemName.trim() || phase.category
      await execStore.endSession(phase.sessionId, 'bought', name)
      const txId = await addExecutionTransaction({ amount, description: name, executionCategory: phase.category, executionSessionId: phase.sessionId })
      await reviewStore.createTasksForPurchase({ item_name: name, brand: brand.trim() || undefined, category: phase.category, transactionId: txId })
      await onDone()
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle>记录购买</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-1.5 border-b-theme pb-3">
          <span className="text-lg text-ink-4">¥</span>
          <input type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="0" autoFocus
            className="w-full bg-transparent font-serif text-4xl text-ink outline-none placeholder:text-ink-4" />
        </div>
        <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder={`买了什么（默认：${phase.category}）`}
          className="w-full bg-transparent text-[15px] text-ink-2 outline-none border-b-theme focus:border-b-[var(--text-muted)] transition-colors pb-1 placeholder:text-ink-4" />

        {brands.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-ink-4">买的哪个品牌？</p>
            <div className="flex flex-wrap gap-1.5">
              {brands.map((b) => (
                <button key={b.id} onClick={() => setBrand(b.brand_name === brand ? '' : b.brand_name)}
                  className={cn('rounded-lg border-theme px-3 py-1.5 text-[13px] font-medium transition-colors', brand === b.brand_name ? 'bg-accent text-on-accent' : 'text-ink-2 hover:bg-card-alt')}>
                  {b.brand_name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="品牌（可选）"
            className="w-full bg-transparent text-[15px] text-ink-2 outline-none border-b-theme focus:border-b-[var(--text-muted)] transition-colors pb-1 placeholder:text-ink-4" />
        )}

        <p className="text-[13px] text-ink-4">会自动生成 7 天和 30 天复盘提醒</p>
        <div className="flex justify-end border-t-theme pt-3">
          <Button onClick={() => void handleConfirm()} disabled={saving || amount <= 0}>{saving ? '保存中…' : '确认'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DonePhase({ decision, onBack }: { decision: 'skipped' | 'undecided'; onBack: () => void }) {
  return (
    <Card className="py-8 text-center">
      <p className="font-serif text-lg text-ink">{decision === 'skipped' ? '理智战胜冲动' : '先记着，慢慢想'}</p>
      <Button variant="ghost" size="sm" className="mt-4" onClick={onBack}>回首页</Button>
    </Card>
  )
}

function BrandSection({ category, brands, execStore, readonly = false }: {
  category: string; brands: BrandEntry[]; execStore: ReturnType<typeof useExecutionStore>; readonly?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!newBrand.trim()) return; setSaving(true)
    await execStore.addBrand(category, newBrand.trim()); setNewBrand(''); setAdding(false); setSaving(false)
  }

  return (
    <Card>
      <CardHeader><CardTitle>信任品牌 · {category}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {brands.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <div key={b.id} className="flex items-center gap-1.5 rounded-lg border-theme bg-card-alt px-2.5 py-1.5">
                <span className="text-[13px] font-medium text-ink-2">{b.brand_name}</span>
                <span className="text-[11px] text-amber-500">★{b.weight}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-4">暂无 {category} 品牌</p>
        )}
        {!readonly && (
          adding ? (
            <div className="flex gap-2">
              <input type="text" value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
                placeholder="品牌名称" autoFocus
                className="flex-1 rounded-lg border-theme bg-card-alt px-3 py-1.5 text-[15px] text-ink outline-none focus:ring-1 focus:ring-[var(--border)]" />
              <Button size="sm" onClick={() => void handleAdd()} disabled={saving || !newBrand.trim()}>添加</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>取消</Button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-[13px] text-ink-4 hover:text-ink-3 transition-colors">
              <Plus size={13} /> 添加品牌
            </button>
          )
        )}
      </CardContent>
    </Card>
  )
}

function SOPSection({ rules, defaultOpen = false }: { rules: ReturnType<typeof useExecutionStore>['sopRules']; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (rules.length === 0) return null

  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <CardTitle>购物原则</CardTitle>
        {open ? <ChevronDown size={14} className="text-ink-4" /> : <ChevronRight size={14} className="text-ink-4" />}
      </button>
      {open && (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rules.map((rule, i) => (
            <li key={rule.id} className="flex gap-2.5 text-[15px]">
              <span className="mt-0.5 shrink-0 text-[13px] text-ink-4">{i + 1}.</span>
              <div>
                <span className="font-medium text-ink-2">{rule.title}</span>
                {rule.content !== rule.title && <span className="text-ink-3"> — {rule.content}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function useCountdown(totalSeconds: number, onExpire: () => void): number {
  const [remaining, setRemaining] = useState(totalSeconds)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) { clearInterval(id); setTimeout(() => onExpireRef.current(), 0); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return remaining
}

function CountdownDisplay({ remaining, total }: { remaining: number; total: number }) {
  const mins   = Math.floor(remaining / 60)
  const secs   = remaining % 60
  const pct    = (remaining / total) * 100
  const urgent = remaining <= 60

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <span className={cn('font-serif text-6xl tabular-nums transition-colors', urgent ? 'text-red-500' : 'text-ink')}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-track">
        <div className={cn('h-full rounded-full transition-all duration-1000 ease-linear', urgent ? 'bg-red-400' : 'bg-progress')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

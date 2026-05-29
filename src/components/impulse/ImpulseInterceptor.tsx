import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/store/settings'
import { useWishPoolStore } from '@/store/wishpool'
import { useImpulseStore } from '@/store/impulse'
import { formatAmount, cn } from '@/lib/utils'
import type { AIAdapter } from '@/lib/ai/types'
import type { WishPoolData } from '@/types/db'

async function parseImpulse(
  adapter: AIAdapter,
  input: string,
): Promise<{ item_name: string; estimated_price: number | null }> {
  const messages = [
    {
      role: 'system' as const,
      content:
        '从用户描述中提取商品名和估计金额。只返回JSON: {"item_name":"商品名","estimated_price":数字或null}',
    },
    { role: 'user' as const, content: input },
  ]
  try {
    const full = await adapter.streamChat(messages, () => {})
    const cleaned = full.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
    const parsed = JSON.parse(cleaned) as { item_name?: string; estimated_price?: number | null }
    return {
      item_name: String(parsed.item_name || input),
      estimated_price: typeof parsed.estimated_price === 'number' ? parsed.estimated_price : null,
    }
  } catch {
    return { item_name: input, estimated_price: null }
  }
}

type Step = 'input' | 'parsing' | 'cost' | 'savings-confirm'

export function ImpulseInterceptor({ onClose }: { onClose: () => void }) {
  const { adapter, cooldownHours } = useSettingsStore()
  const wishPoolStore = useWishPoolStore()
  const impulseStore = useImpulseStore()

  const [step, setStep] = useState<Step>('input')
  const [inputText, setInputText] = useState('')
  const [parsed, setParsed] = useState<{ item_name: string; estimated_price: number | null } | null>(null)
  const [savingsAmount, setSavingsAmount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'input') inputRef.current?.focus()
  }, [step])

  async function handleConfirm() {
    if (!inputText.trim() || !adapter) return
    setStep('parsing')

    const item = await parseImpulse(adapter, inputText.trim())
    setParsed(item)
    setSavingsAmount(item.estimated_price ?? 0)

    if (wishPoolStore.pool) {
      setStep('cost')
    } else {
      // No wish pool — record directly as impulse
      await impulseStore.add(
        { item_name: item.item_name, estimated_price: item.estimated_price, season_tag: 'year_round', source: '冲动拦截' },
        cooldownHours,
      )
      onClose()
    }
  }

  async function handleImpulse() {
    if (!parsed) return
    await impulseStore.add(
      { item_name: parsed.item_name, estimated_price: parsed.estimated_price, season_tag: 'year_round', source: '冲动拦截' },
      cooldownHours,
    )
    onClose()
  }

  async function handleSaveConfirm() {
    if (!parsed || savingsAmount <= 0) return
    await wishPoolStore.addSavings(savingsAmount, `忍住了：${parsed.item_name}`)
    onClose()
  }

  if (step === 'cost' && parsed && wishPoolStore.pool) {
    return (
      <WishPoolCostScreen
        item={parsed}
        pool={wishPoolStore.pool}
        onImpulse={() => void handleImpulse()}
        onSaveIntent={() => setStep('savings-confirm')}
      />
    )
  }

  if (step === 'savings-confirm' && parsed) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
        onClick={(e) => { if (e.target === e.currentTarget) setStep('cost') }}
      >
        <div className="w-full max-w-[640px] rounded-t-2xl bg-card px-6 pt-6 pb-8">
          <h3 className="text-[17px] font-medium text-ink">攒入许愿池</h3>
          <p className="mt-1 mb-4 text-[13px] text-ink-4">
            忍住了「{parsed.item_name}」，把这笔钱攒进去
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-card-alt px-4 py-3">
            <span className="text-[15px] text-ink-4">¥</span>
            <input
              autoFocus
              type="number"
              value={savingsAmount || ''}
              onChange={(e) => setSavingsAmount(Number(e.target.value) || 0)}
              className="flex-1 bg-transparent font-serif text-[22px] text-ink outline-none"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('cost')}>返回</Button>
            <Button
              size="sm"
              onClick={() => void handleSaveConfirm()}
              disabled={savingsAmount <= 0}
            >
              攒入 {savingsAmount > 0 ? formatAmount(savingsAmount) : ''}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Input / parsing step
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[640px] rounded-t-2xl bg-card px-6 pt-6 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-medium text-ink">你现在想买什么？</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-3 transition-colors">
            <X size={18} />
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm() }}
          placeholder="例如：Nike 跑鞋 大概 500 块"
          disabled={step === 'parsing'}
          className="w-full rounded-xl border-theme bg-card-alt px-4 py-3 text-[16px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-[var(--border)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={step === 'parsing'}>
            算了
          </Button>
          <Button
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={!inputText.trim() || step === 'parsing'}
          >
            {step === 'parsing' ? '分析中…' : '确认'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function WishPoolCostScreen({
  item,
  pool,
  onImpulse,
  onSaveIntent,
}: {
  item: { item_name: string; estimated_price: number | null }
  pool: WishPoolData
  onImpulse: () => void
  onSaveIntent: () => void
}) {
  const cost = item.estimated_price ?? 0
  const newSaved = Math.max(0, pool.saved_amount - cost)
  const currentPct = pool.target_amount > 0
    ? Math.min((pool.saved_amount / pool.target_amount) * 100, 100)
    : 0
  const newPct = pool.target_amount > 0 ? (newSaved / pool.target_amount) * 100 : 0
  const resetToZero = cost >= pool.saved_amount

  const [barPct, setBarPct] = useState(currentPct)

  useEffect(() => {
    const t = setTimeout(() => setBarPct(newPct), 400)
    return () => clearTimeout(t)
  }, [newPct])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card">
      <div className="flex flex-1 flex-col justify-center px-8 py-12 max-w-[640px] mx-auto w-full">
        {/* What user wants to buy */}
        <div className="mb-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4 mb-2">
            你现在想买
          </p>
          <p className="font-serif text-[30px] leading-tight text-ink">{item.item_name}</p>
          {item.estimated_price != null && (
            <p className="mt-1 font-serif text-[22px] text-ink-3">
              约 {formatAmount(item.estimated_price)}
            </p>
          )}
        </div>

        {/* Wish pool cost */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4 mb-3">
            你的许愿池目标
          </p>
          <div className="flex items-baseline justify-between mb-3">
            <p className="font-serif text-[20px] text-ink">{pool.focus_item_name}</p>
          </div>
          <div className="flex justify-between text-[14px] text-ink-3 mb-3">
            <span>已攒 {formatAmount(pool.saved_amount)}</span>
            <span>目标 {formatAmount(pool.target_amount)}</span>
          </div>

          {/* Progress bar animates backward */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-in-out"
              style={{ width: `${barPct}%` }}
            />
          </div>

          <p className={cn('mt-3 text-[14px] font-medium', resetToZero ? 'text-red-500' : 'text-amber-700')}>
            {resetToZero
              ? '买这个 = 许愿池退回到 ¥0'
              : `买这个 = 许愿池退回到 ${formatAmount(newSaved)}`}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-8 pb-12 max-w-[640px] mx-auto w-full flex flex-col gap-3">
        <button
          onClick={onSaveIntent}
          className="w-full rounded-2xl bg-amber-400 py-4 text-[16px] font-medium text-white transition-opacity active:opacity-90"
        >
          算了，我忍了
        </button>
        <button
          onClick={onImpulse}
          className="w-full rounded-2xl border-theme py-4 text-[15px] text-ink-3 transition-colors active:bg-card-alt"
        >
          还是想买，记录冲动
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/store/settings'
import { useBudgetStore } from '@/store/budget'
import { useWishPoolStore } from '@/store/wishpool'
import type { ExecutionStore } from '@/store/execution'
import {
  gatherExecutionContext,
  generateDecisionBrief,
  suggestMode,
  type DecisionMode,
  type ExecutionContext,
} from '@/lib/generateDecisionBrief'

/**
 * 开场决策简报（SPEC_PHASE3 §4.2）. Aggregates the user's data, asks the AI to
 * write a 10-second natural-language brief, then lets the user start the timing /
 * research phase. Hands the gathered context up so the chat assistant can reuse it
 * without re-querying.
 */
export function DecisionBrief({
  category,
  estimatedPrice,
  execStore,
  onStart,
}: {
  category: string
  estimatedPrice: number | null
  execStore: ExecutionStore
  onStart: (mode: DecisionMode, ctx: ExecutionContext) => void
}) {
  const adapter      = useSettingsStore((s) => s.adapter)
  const timerMinutes = useSettingsStore((s) => s.timerMinutes)
  const budgetData   = useBudgetStore((s) => s.data)
  const pool         = useWishPoolStore((s) => s.pool)

  const suggested = suggestMode(category, estimatedPrice)
  const [mode, setMode] = useState<DecisionMode>(suggested)
  const [brief, setBrief]   = useState('')
  const [ctx, setCtx]       = useState<ExecutionContext | null>(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    abortRef.current = ctrl

    async function run() {
      setLoading(true); setBrief('')
      const gathered = await gatherExecutionContext(category, estimatedPrice, {
        budget: budgetData, brands: execStore.brands, sopRules: execStore.sopRules, pool,
      })
      if (cancelled) return
      setCtx(gathered)
      const initialMode = suggestMode(category, estimatedPrice)
      setMode(initialMode)

      if (!adapter) {
        setBrief(fallbackBrief(gathered, initialMode, timerMinutes))
        setLoading(false)
        return
      }

      try {
        await generateDecisionBrief(
          adapter, gathered, initialMode, timerMinutes,
          (delta) => { if (!cancelled) setBrief((b) => b + delta) },
          ctrl.signal,
        )
      } catch (err) {
        if (!cancelled && (err as Error).name !== 'AbortError') {
          setBrief(fallbackBrief(gathered, initialMode, timerMinutes))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true; ctrl.abort() }
  }, [category, estimatedPrice]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">决策简报</p>
        {loading && !brief ? (
          <p className="flex items-center gap-1.5 py-2 text-[15px] text-ink-3">
            正在准备你的决策简报<span className="inline-block h-3 w-0.5 animate-pulse bg-ink-4" />
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">
            {brief}
            {loading && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-ink-4 align-middle" />}
          </p>
        )}
      </Card>

      <Card>
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">决策模式</p>
        <div className="flex gap-2">
          <ModeButton active={mode === 'fast'} onClick={() => setMode('fast')}
            label="⚡ 快速决策" hint={`${timerMinutes}min 倒计时`} suggested={suggested === 'fast'} />
          <ModeButton active={mode === 'research'} onClick={() => setMode('research')}
            label="🔍 研究模式" hint="无倒计时 · 任务清单" suggested={suggested === 'research'} />
        </div>
        <Button className="mt-4 w-full" disabled={loading || !ctx}
          onClick={() => ctx && onStart(mode, ctx)}>
          {loading ? '准备中…' : '开始 →'}
        </Button>
      </Card>
    </>
  )
}

function ModeButton({ active, onClick, label, hint, suggested }: {
  active: boolean; onClick: () => void; label: string; hint: string; suggested: boolean
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active ? 'border-[var(--accent)] bg-card-alt' : 'border-theme hover:bg-card-alt'
      }`}>
      <span className={`text-[14px] font-medium ${active ? 'text-ink' : 'text-ink-2'}`}>{label}</span>
      <span className="text-[12px] text-ink-4">
        {hint}{suggested && <span className="text-[var(--accent)]"> · 建议</span>}
      </span>
    </button>
  )
}

/** Deterministic brief used when AI is unavailable (no key / request failed). */
function fallbackBrief(ctx: ExecutionContext, mode: DecisionMode, timerMinutes: number): string {
  const lines: string[] = [`你要买：${ctx.category}`]
  if (ctx.discretionaryRemaining != null) lines.push(`本月还能花：¥${ctx.discretionaryRemaining.toFixed(0)}`)
  if (ctx.history.lastPurchase) {
    lines.push('', '你的历史：', `上次买${ctx.category}是${ctx.history.lastPurchase.relativeTime}`)
  }
  if (ctx.history.regret) {
    const pct = Math.round(ctx.history.regret.rate * 100)
    lines.push(`${ctx.category}类后悔率：${pct}%（${ctx.history.regret.total} 笔里 ${ctx.history.regret.regretCount} 笔后悔）`)
  }
  if (ctx.topBrands.length) {
    lines.push('', `信任品牌：${ctx.topBrands.map((b) => `${b.name}(${b.weight})`).join(' · ')}`)
  }
  if (ctx.sopRules.length) {
    lines.push('', '你的 SOP 提醒你：', ...ctx.sopRules.map((r) => r.content || r.title))
  }
  lines.push('', `本次建议：${mode === 'research' ? '研究模式' : `快速决策模式 · ${timerMinutes}min`}`)
  return lines.join('\n')
}

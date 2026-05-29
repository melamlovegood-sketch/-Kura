import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useBudgetStore } from '@/store/budget'
import { useWishlistStore } from '@/store/wishlist'
import { useWishPoolStore } from '@/store/wishpool'
import { useSettingsStore } from '@/store/settings'
import { routeIntent } from '@/lib/ai/router'
import type { ParsedWishlistItem } from '@/types/db'

const DONE_KEY = 'kura-onboarding-done'

type Phase = 'checking' | 'hidden' | 1 | 2 | 3

/**
 * Cold-start guide. Shows a 3-step full-screen flow only on a genuinely fresh
 * install — no budget, no transactions, no wishlist items. Any step can be
 * skipped (which exits straight to Home). Marks `kura-onboarding-done` once
 * finished or skipped so it never shows again.
 */
export function Onboarding() {
  const [phase, setPhase] = useState<Phase>('checking')

  useEffect(() => {
    if (localStorage.getItem(DONE_KEY) === 'true') { setPhase('hidden'); return }
    let cancelled = false
    void (async () => {
      try {
        const [b, t, w] = await Promise.all([
          supabase.from('monthly_budgets').select('id', { count: 'exact', head: true }),
          supabase.from('transactions').select('id', { count: 'exact', head: true }),
          supabase.from('wishlist_items').select('id', { count: 'exact', head: true }),
        ])
        if (cancelled) return
        const errored = !!(b.error || t.error || w.error)
        const empty = (b.count ?? 0) === 0 && (t.count ?? 0) === 0 && (w.count ?? 0) === 0
        if (empty && !errored) {
          setPhase(1)
        } else {
          // Returning user (or query failed) — never show, and remember that.
          if (!errored) localStorage.setItem(DONE_KEY, 'true')
          setPhase('hidden')
        }
      } catch {
        if (!cancelled) setPhase('hidden')
      }
    })()
    return () => { cancelled = true }
  }, [])

  function finish() {
    localStorage.setItem(DONE_KEY, 'true')
    setPhase('hidden')
  }

  if (phase === 'checking' || phase === 'hidden') return null

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-page px-6">
      <div className="w-full max-w-[420px]">
        {phase === 1 && <BudgetStep onSkip={finish} onNext={() => setPhase(2)} />}
        {phase === 2 && <WishStep onSkip={finish} onNext={() => setPhase(3)} />}
        {phase === 3 && <DoneStep onStart={finish} />}
      </div>
    </div>
  )
}

function StepShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-6" style={{ animation: 'milestone-pop-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>{children}</div>
}

function BudgetStep({ onSkip, onNext }: { onSkip: () => void; onNext: () => void }) {
  const [basic, setBasic] = useState('')
  const [discr, setDiscr] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleNext() {
    const b = Number(basic), d = Number(discr)
    setSaving(true)
    try {
      if (b > 0 && d > 0) {
        await useBudgetStore.getState().upsert({ basic_life_limit: b, discretionary_limit: d })
      }
      onNext()
    } finally { setSaving(false) }
  }

  return (
    <StepShell>
      <div>
        <p className="font-serif text-[22px] text-ink">欢迎来到 Kura 🌰</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">先告诉我这个月你能花多少？</p>
      </div>

      <div className="flex flex-col gap-3">
        <Field label="基础生活额度">
          <Input type="number" inputMode="numeric" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="¥" min={0} autoFocus />
        </Field>
        <Field label="可支配消费额度">
          <Input type="number" inputMode="numeric" value={discr} onChange={(e) => setDiscr(e.target.value)} placeholder="¥" min={0} />
        </Field>
      </div>

      <Actions skipLabel="跳过" onSkip={onSkip} nextLabel={saving ? '保存中…' : '确认，下一步'} onNext={() => void handleNext()} nextDisabled={saving} />
    </StepShell>
  )
}

function WishStep({ onSkip, onNext }: { onSkip: () => void; onNext: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleNext() {
    const v = text.trim()
    if (!v) { onNext(); return }
    setBusy(true)
    try {
      const parsed = await parseWish(v)
      const item = await useWishlistStore.getState().add(parsed)
      if (item) {
        await useWishlistStore.getState().pin(item)
        await useWishPoolStore.getState().load()
      }
      onNext()
    } finally { setBusy(false) }
  }

  return (
    <StepShell>
      <div>
        <p className="font-serif text-[22px] text-ink">你现在最想买的一件东西是什么？</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">说一句话就好，比如「一双 Nike 699 块」</p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="一双 Nike 699 块…"
        rows={2}
        autoFocus
        className="w-full resize-none rounded-xl border-theme bg-card-alt px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-4 focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)] transition-colors"
      />

      <Actions skipLabel="跳过" onSkip={onSkip} nextLabel={busy ? '处理中…' : '确认，下一步'} onNext={() => void handleNext()} nextDisabled={busy} />
    </StepShell>
  )
}

function DoneStep({ onStart }: { onStart: () => void }) {
  return (
    <StepShell>
      <div className="text-center">
        <p className="font-serif text-[24px] text-ink">好了，Kura 准备好了 🎉</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-3">
          记账、忍住、许愿池——<br />从对话框开始就行。
        </p>
      </div>
      <Button className="w-full" onClick={onStart}>开始使用</Button>
    </StepShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-3">{label}</span>
      {children}
    </label>
  )
}

function Actions({ skipLabel, onSkip, nextLabel, onNext, nextDisabled }: {
  skipLabel: string; onSkip: () => void; nextLabel: string; onNext: () => void; nextDisabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="sm" onClick={onSkip}>{skipLabel}</Button>
      <Button size="sm" onClick={onNext} disabled={nextDisabled}>{nextLabel}</Button>
    </div>
  )
}

/** AI-parse the wish into a wishlist item; fall back to a naive local parse when
 *  there's no API key yet (a brand-new user usually hasn't set one). */
async function parseWish(text: string): Promise<ParsedWishlistItem> {
  const adapter = useSettingsStore.getState().adapter
  if (adapter) {
    try {
      const r = await routeIntent(adapter, text)
      if (r.module === 'wishlist' && typeof (r.data as { item_name?: unknown }).item_name === 'string') {
        return r.data as unknown as ParsedWishlistItem
      }
    } catch { /* fall through to local parse */ }
  }
  return localParse(text)
}

function localParse(text: string): ParsedWishlistItem {
  const m = text.match(/\d+(?:\.\d+)?/)
  return {
    item_name: text,
    estimated_price: m ? Number(m[0]) : null,
    category: null,
    season_tag: 'year_round',
    need_intensity: null,
    worthiness_score: null,
    worthiness_reason: null,
  }
}

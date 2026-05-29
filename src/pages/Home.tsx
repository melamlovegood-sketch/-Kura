import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { BudgetCard } from '@/components/budget/BudgetCard'
import { WishPoolCard } from '@/components/wishpool/WishPoolCard'
import { WishPoolReachedCard } from '@/components/wishpool/WishPoolReachedCard'
import { MilestoneAnimation } from '@/components/wishpool/MilestoneAnimation'
import { ConfirmTransactionCard } from '@/components/transaction/ConfirmTransactionCard'
import { ImpulseExpiredCard } from '@/components/impulse/ImpulseExpiredCard'
import { WishlistNudgeCard } from '@/components/wishlist/WishlistNudgeCard'
import { ReviewCard } from '@/components/review/ReviewCard'
import { RegretBoardCard } from '@/components/review/RegretBoardCard'
import { PersonaCard } from '@/components/review/PersonaCard'
import { ExpiryReminderCard } from '@/components/transaction/ExpiryReminderCard'
import { SubscriptionReminderCard } from '@/components/subscription/SubscriptionReminderCard'
import { useSettingsStore } from '@/store/settings'
import { usePrinciplesStore } from '@/store/principles'
import { useBudgetStore } from '@/store/budget'
import { useImpulseStore } from '@/store/impulse'
import { useWishlistStore } from '@/store/wishlist'
import { useWishPoolStore } from '@/store/wishpool'
import { useReviewStore } from '@/store/review'
import { useExpiryStore } from '@/store/expiry'
import { useSubscriptionStore } from '@/store/subscriptions'
import { useDuplicateStore } from '@/store/duplicate'
import { DuplicateWarningCard } from '@/components/wishlist/DuplicateWarningCard'
import { addTransaction } from '@/store/transactions'
import { routeIntent } from '@/lib/ai/router'
import { fileToBase64, formatAmount } from '@/lib/utils'
import type { IntentResult } from '@/lib/ai/types'
import type { ParsedBudget, ParsedImpulse, ParsedSavings, ParsedSubscription, ParsedTransaction, ParsedWishlistItem, WishlistItem } from '@/types/db'

type PendingTx = { data: ParsedTransaction; source: 'text' | 'screenshot' }

export function Home() {
  const navigate = useNavigate()
  const { adapter, cooldownHours } = useSettingsStore()
  const principlesStore = usePrinciplesStore()
  const budgetStore     = useBudgetStore()
  const impulseStore    = useImpulseStore()
  const wishlistStore   = useWishlistStore()
  const wishPoolStore   = useWishPoolStore()
  const reviewStore     = useReviewStore()
  const expiryStore     = useExpiryStore()
  const subscriptionStore = useSubscriptionStore()
  const duplicateStore  = useDuplicateStore()

  const [text, setText]   = useState('')
  const [image, setImage] = useState<{ file: File; base64: string } | null>(null)
  const [streaming, setStreaming]   = useState(false)
  const [lastResult, setLastResult] = useState<IntentResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  const [pendingTx,     setPendingTx]     = useState<PendingTx | null>(null)
  const [pendingBudget, setPendingBudget] = useState<ParsedBudget | null>(null)
  const [savingsPrompt, setSavingsPrompt] = useState<ParsedSavings | null>(null)

  useEffect(() => { void budgetStore.refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!text.trim() && !image) return
    if (!adapter) { alert('请先在设置里填写 API Key'); return }

    abortRef.current?.abort()
    const ctrl   = new AbortController()
    abortRef.current = ctrl
    const source: 'text' | 'screenshot' = image ? 'screenshot' : 'text'

    setStreaming(true); setLastResult(null)
    setPendingTx(null); setPendingBudget(null); setSavingsPrompt(null)

    try {
      const principles = principlesStore.items.map((p) => p.content)
      console.debug('[handleSubmit] submitting', {
        source,
        hasImage: !!image,
        imageName: image?.file.name,
        base64Length: image?.base64.length ?? 0,
      })
      // The router streams raw JSON; we intentionally do NOT pipe it to the UI (see Bug #2).
      const result = await routeIntent(adapter, text.trim() || '（图片输入）', image?.base64, undefined, ctrl.signal, principles)
      console.debug('[handleSubmit] routed', { module: result.module, confidence: result.confidence })
      setLastResult(result); setText(''); setImage(null)

      switch (result.module) {
        case 'transaction': {
          const d = result.data as unknown as ParsedTransaction
          if (d.amount > 0) setPendingTx({ data: d, source }); break
        }
        case 'budget':    setPendingBudget(result.data as unknown as ParsedBudget); break
        case 'subscription': {
          const d = result.data as unknown as ParsedSubscription
          if (d.name && d.amount > 0 && d.billing_day >= 1) await subscriptionStore.add(d)
          break
        }
        case 'impulse':   await impulseStore.add(result.data as unknown as ParsedImpulse, cooldownHours); break
        case 'wishlist': {
          const item = await wishlistStore.add(result.data as unknown as ParsedWishlistItem)
          // Background same-category scan; never blocks the add (SPEC_PHASE2 §3).
          if (item) void duplicateStore.detect(item)
          break
        }
        case 'wish_pool': {
          const d = result.data as unknown as ParsedSavings
          if (d.amount <= 0) break
          if (wishPoolStore.pool) {
            await wishPoolStore.addSavings(d.amount, d.description)
          } else {
            // No goal yet — stash it now (lossless) and ask the user to pick one.
            // It'll auto-merge into the pool the next time one is loaded.
            wishPoolStore.stashSavings(d.amount, d.description)
            setSavingsPrompt(d)
          }
          break
        }
        case 'principles': {
          const items = result.data.items
          if (Array.isArray(items) && items.length > 0) await principlesStore.add(items as string[])
          break
        }
        case 'execution': {
          // Jump to the execution layer. If the AI parsed a product, prefill the setup form;
          // otherwise just open the page with an empty setup form (no error).
          const d = result.data as { category?: string; item_name?: string; estimated_price?: number | null }
          const prefillCategory = (d.category || d.item_name || '').trim()
          navigate('/execution', {
            state: prefillCategory
              ? { prefill: { category: prefillCategory, estimatedPrice: d.estimated_price ?? null } }
              : undefined,
          })
          break
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[handleSubmit] failed', err)
        // Surface the failure instead of silently doing nothing (see Bug #1).
        setLastResult({
          module: 'unknown',
          confidence: 0,
          data: {},
          display_text: `出错了：${(err as Error).message || '请稍后重试'}`,
        })
      }
    } finally { setStreaming(false) }
  }

  async function handleTxConfirm(tx: ParsedTransaction) {
    console.debug('[handleTxConfirm] click', { tx, source: pendingTx?.source ?? 'text' })
    try {
      const id = await addTransaction(tx, pendingTx?.source ?? 'text')
      console.debug('[handleTxConfirm] addTransaction ok', { id })
      setPendingTx(null); setLastResult(null); void budgetStore.refresh()
      if (tx.expiry_date) void expiryStore.load()
    } catch (err) {
      // Previously this threw out of an un-awaited handler, so the card just
      // stayed put with no feedback. Surface the failure instead.
      console.error('[handleTxConfirm] addTransaction failed', err)
      setPendingTx(null)
      setLastResult({
        module: 'unknown',
        confidence: 0,
        data: {},
        display_text: `记账失败：${(err as Error).message || '请稍后重试'}`,
      })
    }
  }

  async function handleBudgetConfirm() {
    if (!pendingBudget?.basic_life_limit || !pendingBudget.discretionary_limit) return
    await budgetStore.upsert({ basic_life_limit: pendingBudget.basic_life_limit, discretionary_limit: pendingBudget.discretionary_limit })
    setPendingBudget(null); setLastResult(null)
  }

  async function handleImpulseApprove(record: Parameters<typeof impulseStore.approve>[0]) {
    await impulseStore.approve(record); await wishlistStore.load()
  }

  async function handleNudgeKeep(item: WishlistItem) { await wishlistStore.markNudged(item.id) }

  function handleFileSelect(base64: string, file: File) { setImage({ file, base64 }) }

  async function handleInputFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    handleFileSelect(await fileToBase64(file), file); e.target.value = ''
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit() }
  }

  const expiredImpulse = impulseStore.items.find((r) => r.status === 'pending' && new Date(r.expires_at) <= new Date()) ?? null
  const nudgeItem = !expiredImpulse
    ? wishlistStore.items.find((i) => {
        if (i.status !== 'active') return false
        if (!i.last_nudged_at) return true
        return (Date.now() - new Date(i.last_nudged_at).getTime()) / 86400000 >= 7
      }) ?? null
    : null

  return (
    <ImageDropZone onFile={handleFileSelect} className="flex min-h-full flex-col gap-3 pt-6 w-full max-w-[640px] mx-auto px-6">
      <MilestoneAnimation />
      <BudgetCard />
      <WishPoolCard />

      {streaming && (
        <Card>
          {/* Model output is structured JSON — never shown raw. Just indicate progress. */}
          <p className="flex items-center gap-1.5 text-[15px] leading-relaxed text-ink-3">
            正在分析<span className="inline-block h-3 w-0.5 animate-pulse bg-ink-4" />
          </p>
        </Card>
      )}

      {pendingTx && (
        <ConfirmTransactionCard initial={pendingTx.data} source={pendingTx.source} onConfirm={handleTxConfirm} onCancel={() => setPendingTx(null)} />
      )}

      {pendingBudget && !pendingTx && (
        <BudgetConfirmCard data={pendingBudget} onConfirm={() => void handleBudgetConfirm()} onCancel={() => setPendingBudget(null)} />
      )}

      {savingsPrompt && !pendingTx && !pendingBudget && (
        <SavingsNoPoolCard
          data={savingsPrompt}
          onPick={() => { setSavingsPrompt(null); navigate('/wishlist') }}
          onKeep={() => setSavingsPrompt(null)}
        />
      )}

      {!pendingTx && !pendingBudget && !savingsPrompt && (
        <>
          <DuplicateWarningCard />
          <WishPoolReachedCard />
          <SubscriptionReminderCard />
          <ExpiryReminderCard />
          {expiredImpulse && <ImpulseExpiredCard record={expiredImpulse} onApprove={handleImpulseApprove} onDismiss={(id) => impulseStore.dismiss(id)} />}
          {!expiredImpulse && reviewStore.pendingTasks[0] && <ReviewCard task={reviewStore.pendingTasks[0]} />}
          {!expiredImpulse && !reviewStore.pendingTasks[0] && nudgeItem && (
            <WishlistNudgeCard item={nudgeItem} onKeep={handleNudgeKeep} onDismiss={(id) => wishlistStore.dismiss(id)} />
          )}
          <PersonaCard />
          <RegretBoardCard />
        </>
      )}

      {!streaming && !pendingTx && !pendingBudget && lastResult && lastResult.module === 'unknown' && (
        <Card><p className="text-sm text-ink-3">{lastResult.display_text}</p></Card>
      )}

      <div className="h-16 md:h-0" />

      {/* Dialog bar — full-width outer, centered inner */}
      <div className="fixed bottom-14 md:bottom-[68px] left-0 right-0 z-30 border-t-theme bg-card md:bg-page">
        <div className="mx-auto w-full max-w-[640px] px-6 py-3">
          {image && (
            <div className="mb-2 flex items-center gap-2">
              <span className="max-w-[200px] truncate text-[13px] text-ink-4">{image.file.name}</span>
              <button onClick={() => setImage(null)} className="text-ink-4 hover:text-ink-3 transition-colors"><X size={14} /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button onClick={() => fileRef.current?.click()} className="shrink-0 pb-2 text-ink-4 hover:text-ink-3 transition-colors">
              <ImagePlus size={20} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleInputFileSelect} />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="说一句话，或拖拽截图到上方…"
              rows={1}
              className="flex-1 resize-none rounded-xl border-theme bg-card-alt px-3.5 py-2 text-[15px] text-ink placeholder:text-ink-4 focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)] transition-colors"
              style={{ maxHeight: 120 }}
            />

            <Button size="icon" onClick={() => void handleSubmit()} disabled={streaming || (!text.trim() && !image)} className="shrink-0">
              <Send size={15} />
            </Button>
          </div>
        </div>
      </div>
    </ImageDropZone>
  )
}

function SavingsNoPoolCard({ data, onPick, onKeep }: { data: ParsedSavings; onPick: () => void; onKeep: () => void }) {
  return (
    <Card>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">忍住了</p>
      <p className="text-[15px] leading-relaxed text-ink-2">
        已先记下 <span className="font-serif text-[17px] text-ink">{formatAmount(data.amount)}</span>
        {data.description && <span className="text-ink-3"> · {data.description}</span>}。
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-4">
        你还没有许愿池目标，要先选一个吗？选定后这笔会自动累积进去。
      </p>
      <div className="mt-4 flex justify-between border-t-theme pt-3">
        <Button variant="ghost" size="sm" onClick={onKeep}>先记下来</Button>
        <Button size="sm" onClick={onPick}>去选目标</Button>
      </div>
    </Card>
  )
}

function BudgetConfirmCard({ data, onConfirm, onCancel }: { data: ParsedBudget; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Card>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">预算确认</p>
      <div className="flex flex-col gap-2">
        {data.basic_life_limit   != null && <div className="flex justify-between"><span className="text-[13px] text-ink-3">基础生活</span><span className="font-serif text-[16px] text-ink">{formatAmount(data.basic_life_limit)}</span></div>}
        {data.discretionary_limit != null && <div className="flex justify-between"><span className="text-[13px] text-ink-3">可支配</span><span className="font-serif text-[16px] text-ink">{formatAmount(data.discretionary_limit)}</span></div>}
      </div>
      <div className="mt-4 flex justify-between border-t-theme pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={onConfirm}>确认设置</Button>
      </div>
    </Card>
  )
}

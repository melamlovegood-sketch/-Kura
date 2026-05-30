import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BudgetCard } from '@/components/budget/BudgetCard'
import { WishPoolCard } from '@/components/wishpool/WishPoolCard'
import { WishPoolReachedCard } from '@/components/wishpool/WishPoolReachedCard'
import { MilestoneAnimation } from '@/components/wishpool/MilestoneAnimation'
import { ImpulseExpiredCard } from '@/components/impulse/ImpulseExpiredCard'
import { WishlistNudgeCard } from '@/components/wishlist/WishlistNudgeCard'
import { ReviewCard } from '@/components/review/ReviewCard'
import { ExpiryReminderCard } from '@/components/transaction/ExpiryReminderCard'
import { SubscriptionReminderCard } from '@/components/subscription/SubscriptionReminderCard'
import { DuplicateWarningCard } from '@/components/wishlist/DuplicateWarningCard'
import { PriceDropCard } from '@/components/home/PriceDropCard'
import { PriceTargetCard } from '@/components/home/PriceTargetCard'
import { BuyDrawer } from '@/components/home/BuyDrawer'
import { useSettingsStore } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { API_SKIPPED_KEY } from '@/components/onboarding/Onboarding'
import { useBudgetStore } from '@/store/budget'
import { useImpulseStore } from '@/store/impulse'
import { useWishlistStore } from '@/store/wishlist'
import { useReviewStore } from '@/store/review'
import { previousMonthString } from '@/lib/generateMonthlyStory'
import { formatMonth } from '@/lib/utils'
import type { WishlistItem } from '@/types/db'

const STORY_NUDGE_DISMISSED_KEY = 'kura-story-nudge-dismissed'

const NUDGE_DAYS = 60

export function Home() {
  const budgetStore   = useBudgetStore()
  const impulseStore  = useImpulseStore()
  const wishlistStore = useWishlistStore()
  const reviewStore   = useReviewStore()

  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => { void budgetStore.refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImpulseApprove(record: Parameters<typeof impulseStore.approve>[0]) {
    await impulseStore.approve(record); await wishlistStore.load()
  }

  async function handleNudgeKeep(item: WishlistItem) { await wishlistStore.markNudged(item.id) }

  const expiredImpulse = impulseStore.items.find((r) => r.status === 'pending' && new Date(r.expires_at) <= new Date()) ?? null
  const nudgeItem = !expiredImpulse
    ? wishlistStore.items.find((i) => {
        if (i.status !== 'active') return false
        // 必须在清单里躺够 60 天
        if ((Date.now() - new Date(i.added_at).getTime()) / 86400000 < NUDGE_DAYS) return false
        // 提醒过一次后 60 天内不再打扰（保留会重置 last_nudged_at 计时）
        if (!i.last_nudged_at) return true
        return (Date.now() - new Date(i.last_nudged_at).getTime()) / 86400000 >= NUDGE_DAYS
      }) ?? null
    : null

  return (
    <div className="flex min-h-full flex-col gap-3 pt-6 w-full max-w-[640px] mx-auto px-6">
      <MilestoneAnimation />
      <GuestModeBanner />
      <NoApiKeyBanner />
      <BudgetCard />
      <BudgetSuggestionCard />
      <WishPoolCard />

      <DuplicateWarningCard />
      <WishPoolReachedCard />
      <PriceDropCard />
      <PriceTargetCard />
      <SubscriptionReminderCard />
      <ExpiryReminderCard />
      {expiredImpulse && <ImpulseExpiredCard record={expiredImpulse} onApprove={handleImpulseApprove} onDismiss={(id) => impulseStore.dismiss(id)} />}
      {!expiredImpulse && reviewStore.pendingTasks[0] && <ReviewCard task={reviewStore.pendingTasks[0]} />}
      {!expiredImpulse && !reviewStore.pendingTasks[0] && nudgeItem && (
        <WishlistNudgeCard item={nudgeItem} onKeep={handleNudgeKeep} onDismiss={(id) => wishlistStore.dismiss(id)} />
      )}
      <StoryNudge />

      <div className="h-16 md:h-0" />

      {/* The single bottom entry — opens the "我现在想买……" decision drawer. */}
      <div className="fixed bottom-14 md:bottom-[68px] left-0 right-0 z-30 border-t-theme bg-card md:bg-page">
        <div className="mx-auto w-full max-w-[640px] px-6 py-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-full rounded-xl border-theme bg-card-alt py-3 text-center text-[15px] font-medium text-ink-2 transition-colors hover:text-ink active:bg-[var(--bg-card-alt)]"
          >
            我现在想买……
          </button>
        </div>
      </div>

      {drawerOpen && <BuyDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  )
}

/**
 * 预算自动延续后的轻量提示（功能2）：当存在一条针对本月、status=pending 的 AI 预算
 * 建议时，推一条可忽略的卡片；点正文进账单页，点「忽略」标记 dismissed。无建议时不渲染。
 */
function BudgetSuggestionCard() {
  const navigate = useNavigate()
  const suggestion = useBudgetStore((s) => s.suggestion)
  const dismiss = useBudgetStore((s) => s.dismissSuggestion)
  if (!suggestion) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border-theme bg-card px-4 py-3">
      <button
        onClick={() => navigate('/billing')}
        className="flex-1 text-left text-[14px] text-ink transition-colors hover:text-ink-2"
      >
        ✦ AI 建议微调下月预算，点击查看
      </button>
      <button
        onClick={() => void dismiss()}
        className="shrink-0 text-[12px] text-ink-4 transition-colors hover:text-ink-3"
      >
        忽略
      </button>
    </div>
  )
}

/**
 * Month-start nudge: once last month's review story has been generated, push a
 * tappable card that jumps to the 复盘 page. Dismissible per-month (localStorage)
 * so it doesn't nag after the user has seen it. Replaces the old standalone
 * PersonaCard on Home — the persona now lives inside the story card.
 */
function StoryNudge() {
  const navigate = useNavigate()
  const lastMonth = previousMonthString(new Date())
  const hasStory = useReviewStore((s) => !!s.stories[lastMonth])
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORY_NUDGE_DISMISSED_KEY) === lastMonth,
  )

  if (!hasStory || dismissed) return null

  function dismiss() {
    localStorage.setItem(STORY_NUDGE_DISMISSED_KEY, lastMonth)
    setDismissed(true)
  }

  return (
    <button
      onClick={() => { dismiss(); navigate('/review') }}
      className="w-full rounded-[10px] border-theme bg-card px-4 py-3 text-left transition-colors hover:bg-card-alt"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">月度复盘</p>
      <p className="mt-1 text-[15px] text-ink">你的{formatMonth(lastMonth)}复盘故事已生成 →</p>
    </button>
  )
}

/**
 * Persistent, non-blocking banner for 本地游客模式: reminds the user their data is
 * local-only and offers to register. 注册账号 discards the local data and drops to
 * the Login 注册 tab (see store/auth exitGuestMode).
 */
function GuestModeBanner() {
  const isGuest = useAuthStore((s) => s.status === 'guest')
  const exitGuest = useAuthStore((s) => s.exitGuestMode)
  if (!isGuest) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-card-alt border-theme px-4 py-2.5">
      <p className="text-[13px] text-ink-3">
        游客模式 · 数据仅存本地
      </p>
      <button
        onClick={exitGuest}
        className="shrink-0 text-[13px] font-medium text-ink-2 underline-offset-2 hover:underline"
      >
        注册账号
      </button>
    </div>
  )
}

/**
 * Persistent banner shown when the user skipped the API Key step in onboarding.
 * Disappears automatically once an API key is configured (adapter becomes non-null).
 */
function NoApiKeyBanner() {
  const adapter = useSettingsStore((s) => s.adapter)
  const navigate = useNavigate()

  const skipped = localStorage.getItem(API_SKIPPED_KEY) === 'true'
  if (!skipped || adapter) return null

  return (
    <button
      onClick={() => navigate('/settings')}
      className="w-full rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-2.5 text-left text-[13px] text-amber-800 transition-colors hover:bg-amber-100"
    >
      AI 功能未启用，去设置填入 API Key →
    </button>
  )
}

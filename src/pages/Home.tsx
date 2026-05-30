import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BudgetCard } from '@/components/budget/BudgetCard'
import { WishPoolCard } from '@/components/wishpool/WishPoolCard'
import { WishPoolReachedCard } from '@/components/wishpool/WishPoolReachedCard'
import { MilestoneAnimation } from '@/components/wishpool/MilestoneAnimation'
import { ImpulseExpiredCard } from '@/components/impulse/ImpulseExpiredCard'
import { WishlistNudgeCard } from '@/components/wishlist/WishlistNudgeCard'
import { ReviewCard } from '@/components/review/ReviewCard'
import { RegretBoardCard } from '@/components/review/RegretBoardCard'
import { ExpiryReminderCard } from '@/components/transaction/ExpiryReminderCard'
import { SubscriptionReminderCard } from '@/components/subscription/SubscriptionReminderCard'
import { DuplicateWarningCard } from '@/components/wishlist/DuplicateWarningCard'
import { BuyDrawer } from '@/components/home/BuyDrawer'
import { useSettingsStore } from '@/store/settings'
import { API_SKIPPED_KEY } from '@/components/onboarding/Onboarding'
import { useBudgetStore } from '@/store/budget'
import { useImpulseStore } from '@/store/impulse'
import { useWishlistStore } from '@/store/wishlist'
import { useReviewStore } from '@/store/review'
import { previousMonthString } from '@/lib/generateMonthlyStory'
import { formatMonth } from '@/lib/utils'
import type { WishlistItem } from '@/types/db'

const STORY_NUDGE_DISMISSED_KEY = 'kura-story-nudge-dismissed'

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
        if (!i.last_nudged_at) return true
        return (Date.now() - new Date(i.last_nudged_at).getTime()) / 86400000 >= 7
      }) ?? null
    : null

  return (
    <div className="flex min-h-full flex-col gap-3 pt-6 w-full max-w-[640px] mx-auto px-6">
      <MilestoneAnimation />
      <NoApiKeyBanner />
      <BudgetCard />
      <WishPoolCard />

      <DuplicateWarningCard />
      <WishPoolReachedCard />
      <SubscriptionReminderCard />
      <ExpiryReminderCard />
      {expiredImpulse && <ImpulseExpiredCard record={expiredImpulse} onApprove={handleImpulseApprove} onDismiss={(id) => impulseStore.dismiss(id)} />}
      {!expiredImpulse && reviewStore.pendingTasks[0] && <ReviewCard task={reviewStore.pendingTasks[0]} />}
      {!expiredImpulse && !reviewStore.pendingTasks[0] && nudgeItem && (
        <WishlistNudgeCard item={nudgeItem} onKeep={handleNudgeKeep} onDismiss={(id) => wishlistStore.dismiss(id)} />
      )}
      <StoryNudge />
      <RegretBoardCard />

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

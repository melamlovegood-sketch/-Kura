import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDuplicateStore } from '@/store/duplicate'
import { useWishlistStore } from '@/store/wishlist'
import { useAchievementsStore } from '@/store/achievements'
import { recentLabel } from '@/lib/duplicateDetect'

/**
 * 同类替代提醒 (SPEC_PHASE2 §3). Shown when an item just added to the wishlist
 * looks like something the user already owns several of. Dropping the purchase
 * here unlocks the 轻装上阵 badge (§8).
 */
export function DuplicateWarningCard() {
  const { warning, clear } = useDuplicateStore()
  const dismissWishlist = useWishlistStore((s) => s.dismiss)
  const unlock = useAchievementsStore((s) => s.unlock)
  const [busy, setBusy] = useState(false)

  if (!warning) return null

  const recent = recentLabel(warning.recentDate)

  async function handleDrop() {
    setBusy(true)
    try {
      await dismissWishlist(warning!.wishlistItemId)
      await unlock('light_travel')
      clear()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">同类提醒</p>
      <p className="text-[15px] leading-relaxed text-ink">
        你已经有 {warning.count} 件{warning.categoryLabel}
        {recent && <span className="text-ink-3">（最近一件购于 {recent}）</span>}。
      </p>
      <p className="mt-1 text-[14px] text-ink-3">确定还需要这件吗？</p>

      <div className="mt-4 flex justify-between border-t border-amber-200/70 pt-3">
        <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>我确实需要</Button>
        <Button size="sm" onClick={() => void handleDrop()} disabled={busy}>{busy ? '处理中…' : '算了，不买了'}</Button>
      </div>
    </Card>
  )
}

import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWishPoolStore } from '@/store/wishpool'
import { formatAmount } from '@/lib/utils'

/**
 * Shown on Home once a wish pool reaches its target. Nudges the user into the
 * execution layer to actually buy the thing they saved up for (SPEC: 达到目标
 * 金额解锁购买提示).
 */
export function WishPoolReachedCard() {
  const navigate = useNavigate()
  const { pool, dismissCompleted } = useWishPoolStore()
  if (!pool || pool.target_amount <= 0 || pool.saved_amount < pool.target_amount) return null

  function goBuy() {
    const name = pool!.focus_item_name
    dismissCompleted()
    navigate('/execution', { state: { prefill: { category: name } } })
  }

  return (
    <Card className="border-amber-300/70 bg-amber-50/50">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-600">目标达成 ✓</p>
      <p className="font-serif text-[18px] leading-snug text-ink">
        「{pool.focus_item_name}」已攒够 {formatAmount(pool.target_amount)}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        攒够了 — 进执行层，设个计时器，理智地把它买回家。
      </p>
      <div className="mt-4 flex items-center justify-between border-t-theme pt-3">
        <Button variant="ghost" size="sm" onClick={dismissCompleted}>以后再说</Button>
        <Button size="sm" onClick={goBuy}>去执行层购买 →</Button>
      </div>
    </Card>
  )
}

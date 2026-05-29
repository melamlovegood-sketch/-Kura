import { useEffect, useRef, useState } from 'react'
import { CardAlt, CardHeader, CardTitle } from '@/components/ui/card'
import { useWishPoolStore } from '@/store/wishpool'
import { useCountUp } from '@/hooks/useCountUp'
import { formatAmount } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function WishPoolCard() {
  const { pool, loaded } = useWishPoolStore()
  if (!loaded) return null

  if (!pool) {
    return (
      <CardAlt className="py-5 text-center text-xs text-ink-4">
        还没有许愿目标 — 在待购清单中 pin 一件商品
      </CardAlt>
    )
  }
  return <ActivePoolCard pool={pool} />
}

function ActivePoolCard({ pool }: { pool: NonNullable<ReturnType<typeof useWishPoolStore>['pool']> }) {
  const pct       = pool.target_amount > 0 ? Math.min((pool.saved_amount / pool.target_amount) * 100, 100) : 0
  const completed = pool.saved_amount >= pool.target_amount
  const animSaved = useCountUp(pool.saved_amount)

  const prevSaved = useRef(pool.saved_amount)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (pool.saved_amount > prevSaved.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 900)
      prevSaved.current = pool.saved_amount
      return () => clearTimeout(t)
    }
    prevSaved.current = pool.saved_amount
  }, [pool.saved_amount])

  return (
    <CardAlt className={cn('transition-shadow duration-500', pulse && 'shadow-lg shadow-amber-100/60')}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>许愿池</CardTitle>
        {completed && <span className="text-xs font-medium text-amber-600">目标达成 ✓</span>}
      </CardHeader>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-2">{pool.focus_item_name}</span>
          <span className="text-sm text-ink-3">
            <span className={cn('font-serif font-medium text-ink tabular-nums transition-colors', pulse && 'text-amber-600')}>
              {formatAmount(animSaved)}
            </span>
            <span className="text-ink-4"> / {formatAmount(pool.target_amount)}</span>
          </span>
        </div>

        {/* Amber progress bar for wish pool */}
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-[#F5DEB3]">
          <div
            className={cn('h-full rounded-full transition-all duration-700 ease-out', completed ? 'bg-amber-500' : 'bg-amber-400')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-right text-[11px] text-ink-4">
          {pct.toFixed(0)}%
          {pool.target_amount > pool.saved_amount && (
            <span> · 还差 {formatAmount(pool.target_amount - pool.saved_amount)}</span>
          )}
        </p>
      </div>
    </CardAlt>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/utils'
import { getPreviousSessionDuration } from '@/lib/generateDecisionBrief'

/**
 * 收尾总结（SPEC_PHASE3 §4.4）. Shown right after the purchase is confirmed and
 * before navigating to the home/记账 view. Surfaces how long the decision took,
 * compares it to the last same-category session, and confirms the review queue.
 * Auto-advances after 2s; "继续" jumps early.
 */
export function WrapUpCard({
  category,
  itemName,
  brand,
  amount,
  elapsedSeconds,
  sessionId,
  onContinue,
}: {
  category: string
  itemName: string
  brand: string
  amount: number
  elapsedSeconds: number
  sessionId: string
  onContinue: () => void
}) {
  const [comparison, setComparison] = useState<string | null>(null)
  const onContinueRef = useRef(onContinue)
  onContinueRef.current = onContinue

  // Compare to the previous same-category session (excluding this one).
  useEffect(() => {
    let cancelled = false
    void getPreviousSessionDuration(category, sessionId).then((prev) => {
      if (cancelled || prev == null) return
      const diffMin = Math.round((prev - elapsedSeconds) / 60)
      if (diffMin > 0) setComparison(`比上次买${category}快了 ${diffMin} 分钟`)
      else if (diffMin < 0) setComparison(`比上次多用了 ${-diffMin} 分钟`)
    })
    return () => { cancelled = true }
  }, [category, sessionId, elapsedSeconds])

  // Auto-advance to 记账确认 after 2s (SPEC: 显示 2 秒后自动跳转).
  useEffect(() => {
    const id = setTimeout(() => onContinueRef.current(), 2000)
    return () => clearTimeout(id)
  }, [])

  const minutes = Math.max(1, Math.round(elapsedSeconds / 60))
  const label = `${brand ? `${brand} ` : ''}${itemName}`

  return (
    <Card className="py-7 text-center">
      <p className="text-[13px] text-ink-4">你用了 {minutes} 分钟选定了</p>
      <p className="mt-2 font-serif text-2xl text-ink">{label}</p>
      <p className="mt-1 font-serif text-lg text-ink-2">{formatAmount(amount)}</p>

      {comparison && <p className="mt-4 text-[14px] text-ink-3">{comparison}</p>}
      <p className="mt-1.5 text-[13px] text-ink-4">已加入 30 天复盘队列</p>

      <Button variant="ghost" size="sm" className="mt-5" onClick={onContinue}>继续 →</Button>
    </Card>
  )
}

import { Card } from '@/components/ui/card'
import { useReviewStore } from '@/store/review'
import { formatAmount } from '@/lib/utils'

/**
 * Monthly regret board (SPEC_PHASE2 §5). Lists purchases the user marked
 * 'regret' in review this month, the total money wasted, and the most-regretted
 * category. Self-deprecating, numbers-not-lectures. Hidden when there's nothing
 * to show. Data is built by reviewStore.loadRegret().
 */
export function RegretBoardCard() {
  const { regret } = useReviewStore()
  if (!regret || regret.entries.length === 0) return null

  const { entries, total_wasted, top_category } = regret

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">本月后悔榜</p>
        <p className="text-[13px] text-ink-3">
          共 {entries.length} 笔
          {total_wasted > 0 && <span> · {formatAmount(total_wasted)} 打了水漂</span>}
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-serif text-[13px] text-ink-4 tabular-nums">{i + 1}</span>
              <span className="truncate text-[14px] text-ink">{e.item_name}</span>
            </span>
            <span className="shrink-0 font-serif text-[15px] text-ink-2 tabular-nums">
              {e.amount == null ? '—' : formatAmount(e.amount)}
            </span>
          </li>
        ))}
      </ol>

      {top_category && (
        <p className="mt-3 border-t-theme pt-3 text-[13px] text-ink-3">
          你的消费重灾区：<span className="text-ink-2">{top_category}</span>
        </p>
      )}
    </Card>
  )
}

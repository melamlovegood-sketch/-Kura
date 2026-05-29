import { useSettingsStore } from '@/store/settings'
import { useWishPoolStore } from '@/store/wishpool'
import { costLabels } from '@/lib/costPerspective'

/**
 * 代价视角 tags (SPEC_PHASE2 §1). Renders up to 2 restrained "「代价」…" lines
 * for a price, reading the identity profile from settings and the current wish
 * pool. Renders nothing when no identity is configured or no label applies.
 */
export function CostLabels({ amount, className }: { amount: number | null | undefined; className?: string }) {
  const { identity, monthlyIncome, monthlyFoodBudget, dailyWorkHours } = useSettingsStore()
  const pool = useWishPoolStore((s) => s.pool)

  const labels = costLabels(
    amount,
    { identity, monthlyIncome, monthlyFoodBudget, dailyWorkHours },
    pool ? { saved_amount: pool.saved_amount, target_amount: pool.target_amount } : null,
  )
  if (labels.length === 0) return null

  return (
    <div className={className ?? 'mt-1.5 flex flex-col gap-0.5'}>
      {labels.map((l, i) => (
        <p key={i} className="text-[12px] leading-snug text-ink-4">
          <span className="text-ink-3">「代价」</span>{l}
        </p>
      ))}
    </div>
  )
}

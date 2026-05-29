import { Card } from '@/components/ui/card'
import { useSubscriptionStore, upcomingCharges } from '@/store/subscriptions'
import { formatAmount } from '@/lib/utils'

/**
 * Home reminder for subscriptions about to be charged (SPEC_PHASE2 §2). Lists
 * active subscriptions whose next billing day is within 3 days; each is
 * dismissible for the current cycle. Hidden when nothing is upcoming.
 */
export function SubscriptionReminderCard() {
  const { items, dismissed, dismissReminder } = useSubscriptionStore()
  const charges = upcomingCharges(items).filter((c) => !dismissed.includes(c.key))
  if (charges.length === 0) return null

  return (
    <Card>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">订阅扣费提醒</p>
      <div className="flex flex-col gap-2.5">
        {charges.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[14px] text-ink">
              {whenLabel(c.daysUntil)}将扣除 <span className="text-ink-2">{c.sub.name}</span>{' '}
              <span className="font-serif text-ink-2">{formatAmount(c.sub.amount)}</span>
            </p>
            <button
              onClick={() => dismissReminder(c.key)}
              className="shrink-0 text-[13px] text-ink-4 hover:text-ink-3 transition-colors"
            >
              知道了
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function whenLabel(daysUntil: number): string {
  if (daysUntil === 1) return '明天'
  return `${daysUntil} 天后`
}

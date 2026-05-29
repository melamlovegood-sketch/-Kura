import { Card } from '@/components/ui/card'
import { useExpiryStore } from '@/store/expiry'

/**
 * Home reminder for purchases nearing their shelf-life (SPEC_PHASE2 §9).
 * Lists items expiring within 7 days; each is dismissible ("记得用"). Hidden
 * when nothing is near expiry. Data from expiryStore.load().
 */
export function ExpiryReminderCard() {
  const { items, dismiss } = useExpiryStore()
  if (items.length === 0) return null

  return (
    <Card>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">临期提醒</p>
      <div className="flex flex-col gap-2.5">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] text-ink">{it.description}</p>
              <p className="mt-0.5 text-[13px] text-ink-4">{expiryLabel(it.days_left)} · 记得用</p>
            </div>
            <button
              onClick={() => dismiss(it.id)}
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

function expiryLabel(daysLeft: number): string {
  if (daysLeft <= 0) return '今天到期'
  if (daysLeft === 1) return '明天到期'
  return `还有 ${daysLeft} 天到期`
}

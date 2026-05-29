import { Card } from '@/components/ui/card'
import { usePersonaStore } from '@/store/persona'
import { formatMonth } from '@/lib/utils'

/**
 * 消费人格报告 (SPEC_PHASE2 §6). A single lightweight card: emoji + persona label,
 * a one-line description, and one improvement tip. Shown on Home for last
 * month's report until dismissed. No lecturing.
 */
export function PersonaCard() {
  const { report, dismissedMonth, dismiss } = usePersonaStore()
  if (!report || dismissedMonth === report.month) return null

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">{formatMonth(report.month)}消费人格</p>
        <button onClick={dismiss} className="text-[13px] text-ink-4 hover:text-ink-3 transition-colors">知道了</button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[34px] leading-none">{report.emoji}</span>
        <div>
          <p className="text-[16px] font-medium text-ink">{report.title}</p>
          <p className="mt-0.5 text-[13px] text-ink-3">{report.description}</p>
        </div>
      </div>

      <p className="mt-3 border-t-theme pt-3 text-[13px] leading-relaxed text-ink-3">{report.advice}</p>
    </Card>
  )
}

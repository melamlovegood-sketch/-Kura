import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/utils'
import type { ImpulseRecord } from '@/types/db'

interface ImpulseExpiredCardProps {
  record: ImpulseRecord
  onApprove: (record: ImpulseRecord) => Promise<void>
  onDismiss: (id: string) => Promise<void>
}

export function ImpulseExpiredCard({ record, onApprove, onDismiss }: ImpulseExpiredCardProps) {
  const [loading, setLoading] = useState(false)

  async function handle(action: 'approve' | 'dismiss') {
    setLoading(true)
    try {
      if (action === 'approve') await onApprove(record)
      else await onDismiss(record.id)
    } finally { setLoading(false) }
  }

  const daysAgo = Math.floor((Date.now() - new Date(record.recorded_at).getTime()) / 86_400_000)
  const since   = daysAgo === 0 ? '今天' : daysAgo === 1 ? '昨天' : `${daysAgo}天前`

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4 mb-2">冷静期结束</p>
          <p className="text-base font-medium text-ink">{record.item_name}</p>
          <p className="mt-0.5 text-[13px] text-ink-4">
            {since}种草
            {record.estimated_price != null && <span> · 约 <span className="font-serif text-[16px]">{formatAmount(record.estimated_price)}</span></span>}
            {record.source && <span> · {record.source}</span>}
          </p>
        </div>
        <p className="text-[15px] text-ink-3">冷静期结束了，你还想要吗？</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void handle('dismiss')} disabled={loading}>不要了</Button>
          <Button size="sm" className="flex-1" onClick={() => void handle('approve')} disabled={loading}>还想要 →</Button>
        </div>
      </div>
    </Card>
  )
}

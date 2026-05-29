import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/utils'
import type { WishlistItem } from '@/types/db'

interface WishlistNudgeCardProps {
  item: WishlistItem
  onKeep: (item: WishlistItem) => Promise<void>
  onDismiss: (id: string) => Promise<void>
}

export function WishlistNudgeCard({ item, onKeep, onDismiss }: WishlistNudgeCardProps) {
  const [loading, setLoading] = useState(false)

  async function handle(action: 'keep' | 'dismiss') {
    setLoading(true)
    try {
      if (action === 'keep') await onKeep(item)
      else await onDismiss(item.id)
    } finally { setLoading(false) }
  }

  const daysAgo = Math.floor((Date.now() - new Date(item.added_at).getTime()) / 86_400_000)

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-4 mb-2">你还想要吗</p>
          <p className="text-base font-medium text-ink">{item.item_name}</p>
          <p className="mt-0.5 text-xs text-ink-4">
            加入 {daysAgo} 天了
            {item.estimated_price != null && <span> · 约 <span className="font-serif">{formatAmount(item.estimated_price)}</span></span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void handle('dismiss')} disabled={loading}>不想了</Button>
          <Button size="sm" className="flex-1" onClick={() => void handle('keep')} disabled={loading}>还想要</Button>
        </div>
      </div>
    </Card>
  )
}

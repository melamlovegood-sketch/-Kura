import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { usePriceTrackStore, activeDrops } from '@/store/priceTrack'
import { formatAmount } from '@/lib/utils'

/**
 * Home push for tracked items that just dropped in price (蹲蹲 §4). A drop fires
 * when a track's newest manual price record is lower than the one before it; the
 * card stays until "知道了" (dismissed per newest-record key, so a further drop
 * re-arms it). Price rises update silently — no card. "去看看" jumps to the 蹲蹲 tab.
 */
export function PriceDropCard() {
  const navigate = useNavigate()
  // Subscribe to the raw slices (each a stable reference until `set` replaces it)
  // and derive drops with useMemo. Calling activeDrops directly as a selector
  // would return a freshly-built array every render → Zustand sees a new snapshot
  // → "getSnapshot should be cached" → infinite re-render → white screen.
  const tracks = usePriceTrackStore((s) => s.tracks)
  const records = usePriceTrackStore((s) => s.records)
  const dismissedDrops = usePriceTrackStore((s) => s.dismissedDrops)
  const dismissDrop = usePriceTrackStore((s) => s.dismissDrop)

  const drops = useMemo(
    () => activeDrops({ tracks, records, dismissedDrops }),
    [tracks, records, dismissedDrops],
  )

  if (drops.length === 0) return null

  return (
    <Card>
      <div className="flex flex-col gap-3">
        {drops.map((d) => (
          <div key={d.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown size={15} className="text-emerald-600" />
              <p className="text-[14px] text-ink">
                你蹲的 <span className="font-medium">{d.track.item_name}</span> 降价了
              </p>
            </div>
            <p className="font-serif text-[14px] text-ink-3">
              {formatAmount(d.from)} → <span className="text-emerald-600">{formatAmount(d.to)}</span>
              <span className="ml-1.5 text-[12px] text-ink-4">便宜了 {formatAmount(d.diff)}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/wishlist', { state: { tab: 'track' } })}
                className="rounded-lg bg-card-alt px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
              >
                去看看
              </button>
              <button
                onClick={() => dismissDrop(d.key)}
                className="rounded-lg px-3 py-1.5 text-[13px] text-ink-4 transition-colors hover:text-ink-3"
              >
                知道了
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

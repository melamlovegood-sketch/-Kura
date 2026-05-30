import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Target } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { usePriceTrackStore, activeTargetHits } from '@/store/priceTrack'
import { formatAmount } from '@/lib/utils'

/**
 * Home push for tracked items that hit their user-set 目标价 (蹲蹲 §3). Fires when a
 * track's newest price is at/below target_price; stays until "知道了" (dismissed per
 * newest-record key, so a further drop re-arms it). "去看看" jumps to the 蹲蹲 tab.
 */
export function PriceTargetCard() {
  const navigate = useNavigate()
  const { tracks, records, dismissedTargets, dismissTargetHit } = usePriceTrackStore(
    useShallow((s) => ({
      tracks: s.tracks,
      records: s.records,
      dismissedTargets: s.dismissedTargets,
      dismissTargetHit: s.dismissTargetHit,
    })),
  )

  const hits = useMemo(
    () => activeTargetHits({ tracks, records, dismissedTargets }),
    [tracks, records, dismissedTargets],
  )

  if (hits.length === 0) return null

  return (
    <Card>
      <div className="flex flex-col gap-3">
        {hits.map((h) => (
          <div key={h.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Target size={15} className="text-emerald-600" />
              <p className="text-[14px] text-ink">
                🎯 你蹲的 <span className="font-medium">{h.track.item_name}</span> 到价了
              </p>
            </div>
            <p className="font-serif text-[14px] text-ink-3">
              当前 <span className="text-emerald-600">{formatAmount(h.current)}</span>
              <span className="ml-1.5 text-[12px] text-ink-4">低于你设定的 {formatAmount(h.target)}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/wishlist', { state: { tab: 'track' } })}
                className="rounded-lg bg-card-alt px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
              >
                去看看
              </button>
              <button
                onClick={() => dismissTargetHit(h.key)}
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

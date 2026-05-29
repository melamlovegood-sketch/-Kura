import { useState } from 'react'
import { Pin, X, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useWishlistStore } from '@/store/wishlist'
import { useImpulseStore } from '@/store/impulse'
import { useWishPoolStore } from '@/store/wishpool'
import { formatAmount } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CostLabels } from '@/components/cost/CostLabels'
import type { ImpulseRecord, WishlistItem } from '@/types/db'

const SEASON_LABEL: Record<string, string> = {
  year_round: '常年', summer: '夏季', winter: '冬季', specific: '特定',
}

export function Wishlist() {
  const wishlistStore = useWishlistStore()
  const impulseStore  = useImpulseStore()
  const wishPoolStore = useWishPoolStore()

  const activeItems    = wishlistStore.items.filter((i) => i.status === 'active')
  const pendingImpulse = impulseStore.items.filter((i) => i.status === 'pending')

  return (
    <div className="flex flex-col gap-5 pt-6 w-full max-w-[640px] mx-auto px-6">
      <h1 className="text-base font-medium text-ink">清单</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
          待购清单{activeItems.length > 0 && <span className="ml-1.5">· {activeItems.length}</span>}
        </h2>

        {activeItems.length === 0 ? (
          <Card className="py-6 text-center text-[13px] text-ink-4">还没有待购商品 — 通过对话框添加，或从冷静期通过</Card>
        ) : (
          activeItems.map((item) => (
            <WishlistItemCard
              key={item.id}
              item={item}
              isPoolFocus={wishPoolStore.pool?.focus_item_id === item.id}
              onPin={async () => { await wishlistStore.pin(item); await wishPoolStore.load() }}
              onDismiss={() => wishlistStore.dismiss(item.id)}
            />
          ))
        )}
      </section>

      {pendingImpulse.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
            冷静期中 · {pendingImpulse.length}
          </h2>
          {pendingImpulse.map((record) => (
            <ImpulseActiveCard key={record.id} record={record} onDismiss={() => impulseStore.dismiss(record.id)} />
          ))}
        </section>
      )}
    </div>
  )
}

function WishlistItemCard({ item, isPoolFocus, onPin, onDismiss }: {
  item: WishlistItem; isPoolFocus: boolean; onPin: () => Promise<void>; onDismiss: () => void
}) {
  const [pinning, setPinning] = useState(false)
  async function handlePin() { setPinning(true); try { await onPin() } finally { setPinning(false) } }

  return (
    <Card className={cn('transition-colors', isPoolFocus && 'bg-amber-50/60 border-amber-200')}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium text-ink leading-snug">{item.item_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {item.estimated_price != null && (
                <span className="font-serif text-[16px] text-ink-3">约 {formatAmount(item.estimated_price)}</span>
              )}
              <span className="rounded border-theme px-1.5 py-0.5 text-[11px] text-ink-4">
                {SEASON_LABEL[item.season_tag] ?? item.season_tag}
              </span>
              {item.worthiness_score != null && (
                <span className={cn('text-[11px] font-medium tabular-nums',
                  item.worthiness_score >= 8 ? 'text-amber-600' : item.worthiness_score >= 5 ? 'text-ink-2' : 'text-ink-4'
                )}>★ {item.worthiness_score}</span>
              )}
            </div>
            {item.worthiness_reason && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-4 italic">{item.worthiness_reason}</p>
            )}
            <CostLabels amount={item.estimated_price} />
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => void handlePin()}
              disabled={pinning || isPoolFocus}
              className={cn('rounded-lg p-1.5 transition-colors', isPoolFocus ? 'text-amber-500' : 'text-ink-4 hover:bg-card-alt hover:text-ink-2')}
            >
              <Pin size={15} />
            </button>
            <button onClick={onDismiss} className="rounded-lg p-1.5 text-ink-4 hover:bg-card-alt hover:text-ink-2 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ImpulseActiveCard({ record, onDismiss }: { record: ImpulseRecord; onDismiss: () => void }) {
  const remaining = getRemainingTime(record.expires_at)
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-ink-2">{record.item_name}</p>
          <div className="mt-1 flex items-center gap-2">
            {record.estimated_price != null && (
              <span className="font-serif text-[16px] text-ink-4">约 {formatAmount(record.estimated_price)}</span>
            )}
            <span className="flex items-center gap-1 text-[13px] text-ink-4">
              <Clock size={11} />{remaining}
            </span>
          </div>
          <CostLabels amount={record.estimated_price} />
        </div>
        <button onClick={onDismiss} className="shrink-0 text-ink-4 hover:text-ink-3 transition-colors">
          <X size={15} />
        </button>
      </CardContent>
    </Card>
  )
}

function getRemainingTime(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return '已到期'
  const h = Math.floor(ms / 3_600_000)
  return h < 24 ? `还剩 ${h}h` : `还剩 ${Math.floor(h / 24)}天`
}

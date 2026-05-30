import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { useSettingsStore } from '@/store/settings'
import { usePrinciplesStore } from '@/store/principles'
import { useImpulseStore } from '@/store/impulse'
import { useWishlistStore } from '@/store/wishlist'
import { parseProduct, type ParsedProduct } from '@/lib/parseProduct'
import { fileToBase64, formatAmount } from '@/lib/utils'

type Product = ParsedProduct
type Exit = 'impulse' | 'wishlist' | 'buy'

/**
 * The single bottom-sheet entry behind the home "我现在想买……" button. Reuses the
 * original AI dialog's input mechanics (free text + screenshot upload) and the
 * `routeIntent` parser unchanged; the parsed product then flows to one of THREE
 * user-chosen exits (bug8) — the app never auto-decides a cooldown by category:
 *
 *   忍住，先忍忍   → 冲动记录 (impulse_records, carries the cooldown countdown)
 *   加进清单再想想 → 待购清单 (wishlist_items, the active reconsideration list)
 *   确定要买，记一笔 → 执行层记账 (skip the cooldown entirely, record the buy)
 */
export function BuyDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { adapter, cooldownHours } = useSettingsStore()
  const principlesStore = usePrinciplesStore()
  const impulseStore = useImpulseStore()
  const wishlistStore = useWishlistStore()

  const [text, setText] = useState('')
  const [image, setImage] = useState<{ file: File; base64: string } | null>(null)
  const [parsed, setParsed] = useState<Product | null>(null)
  // Which exit is mid-flight, so we can show a per-button busy state while the
  // AI parse / write runs.
  const [busy, setBusy] = useState<null | Exit>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasInput = !!text.trim() || !!image

  function handleFileSelect(base64: string, file: File) {
    setImage({ file, base64 })
    setParsed(null) // input changed → previous parse is stale
    setError(null)
  }

  async function handleInputFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    handleFileSelect(await fileToBase64(file), file)
    e.target.value = ''
  }

  /**
   * Parse the current input into a product, reusing a previous parse if the input
   * hasn't changed. Returns null only when there is nothing to act on.
   */
  async function ensureParsed(): Promise<Product | null> {
    if (parsed) return parsed
    if (!hasInput) return null
    if (!adapter) {
      setError('请先在设置里填写 API Key')
      return null
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)

    const principles = principlesStore.items.map((p) => p.content)
    const product = await parseProduct(adapter, text, image?.base64, ctrl.signal, principles)
    setParsed(product)
    return product
  }

  /** Run an exit: parse first (shared), then route to the chosen destination. */
  async function runExit(exit: Exit, act: (p: Product) => Promise<void> | void) {
    if (busy) return
    setBusy(exit)
    try {
      const product = await ensureParsed()
      if (!product) return
      await act(product)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(`出错了：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(null)
    }
  }

  // 忍住，先忍忍 → 冲动记录（带冷静期倒计时）
  function handleImpulse() {
    return runExit('impulse', async (product) => {
      await impulseStore.add(
        { item_name: product.item_name, estimated_price: product.estimated_price, season_tag: 'year_round', source: '我现在想买' },
        cooldownHours,
      )
      onClose()
    })
  }

  // 加进清单再想想 → 待购清单
  function handleWishlist() {
    return runExit('wishlist', async (product) => {
      await wishlistStore.add({
        item_name: product.item_name,
        estimated_price: product.estimated_price,
        category: null,
        season_tag: 'year_round',
        need_intensity: null,
        worthiness_score: null,
        worthiness_reason: null,
      })
      onClose()
    })
  }

  // 确定要买，记一笔 → 执行层记账（不进冷静期）
  function handleBuy() {
    return runExit('buy', (product) => {
      onClose()
      navigate('/execution', {
        state: { prefill: { category: product.item_name, estimatedPrice: product.estimated_price, skipToRecording: true } },
      })
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      style={{ animation: 'sheet-backdrop-in 0.2s ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <ImageDropZone
        onFile={handleFileSelect}
        className="w-full max-w-[640px] rounded-t-2xl bg-card px-6 pt-5 pb-8 [animation:sheet-slide-up_0.28s_cubic-bezier(0.32,0.72,0,1)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-medium text-ink">我现在想买……</h3>
          <button onClick={onClose} disabled={!!busy} className="text-ink-4 transition-colors hover:text-ink-3 disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setError(null) }}
          placeholder="说一句话，或拖拽截图到这里…"
          rows={2}
          autoFocus
          className="w-full resize-none rounded-xl border-theme bg-card-alt px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-4 transition-colors focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)]"
          style={{ maxHeight: 140 }}
        />

        {image && (
          <div className="mt-2 flex items-center gap-2">
            <span className="max-w-[240px] truncate text-[13px] text-ink-4">{image.file.name}</span>
            <button onClick={() => { setImage(null); setParsed(null) }} className="text-ink-4 transition-colors hover:text-ink-3">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Click-to-upload — mobile-friendly companion to drag-and-drop above. */}
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-2.5 flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink-2"
        >
          <Paperclip size={14} /> 上传截图
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputFileSelect}
        />

        {parsed && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            识别为 <span className="font-medium text-ink-2">{parsed.item_name}</span>
            {parsed.estimated_price != null && <span> · 约 {formatAmount(parsed.estimated_price)}</span>}
          </p>
        )}

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        {/* Three user-chosen exits (bug8) — the app no longer forces a cooldown. */}
        <div className="mt-5 flex flex-col gap-2.5">
          <Button
            variant="outline"
            onClick={() => void handleImpulse()}
            disabled={!hasInput || !!busy}
          >
            {busy === 'impulse' ? '分析中…' : '忍住，先忍忍'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleWishlist()}
            disabled={!hasInput || !!busy}
          >
            {busy === 'wishlist' ? '分析中…' : '加进清单再想想'}
          </Button>
          <Button
            onClick={() => void handleBuy()}
            disabled={!hasInput || !!busy}
          >
            {busy === 'buy' ? '分析中…' : '确定要买，记一笔 →'}
          </Button>
        </div>
      </ImageDropZone>
    </div>
  )
}

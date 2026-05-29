import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { useSettingsStore } from '@/store/settings'
import { usePrinciplesStore } from '@/store/principles'
import { useImpulseStore } from '@/store/impulse'
import { routeIntent } from '@/lib/ai/router'
import { fileToBase64, formatAmount } from '@/lib/utils'
import type { IntentResult } from '@/lib/ai/types'

type Product = { item_name: string; estimated_price: number | null }

/**
 * Pull a buyable product out of whatever the intent router returned. The router
 * may classify a "想买 X" input as impulse / wishlist / execution / unknown — each
 * uses slightly different field names — so we coalesce, falling back to the raw
 * text so the user always gets a usable item name even on a low-confidence parse.
 */
function extractProduct(result: IntentResult, fallbackText: string): Product {
  const d = result.data as Record<string, unknown>
  const name = [d.item_name, d.description, d.category, fallbackText]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0) ?? fallbackText
  const priceRaw = d.estimated_price ?? d.amount
  const price = typeof priceRaw === 'number' && priceRaw > 0 ? priceRaw : null
  return { item_name: name, estimated_price: price }
}

/**
 * The single bottom-sheet entry behind the home "我现在想买……" button. Reuses the
 * original AI dialog's input mechanics (free text + screenshot upload) and the
 * `routeIntent` parser unchanged; the parsed product then flows to one of two
 * exits — stash it as an impulse, or carry it into the execution layer to research.
 */
export function BuyDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { adapter, cooldownHours } = useSettingsStore()
  const principlesStore = usePrinciplesStore()
  const impulseStore = useImpulseStore()

  const [text, setText] = useState('')
  const [image, setImage] = useState<{ file: File; base64: string } | null>(null)
  const [parsed, setParsed] = useState<Product | null>(null)
  // Which exit is mid-flight ('impulse' | 'research'), so we can show a per-button
  // busy state while the AI parse runs.
  const [busy, setBusy] = useState<null | 'impulse' | 'research'>(null)
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

    const fallback = text.trim() || '（图片输入）'
    const principles = principlesStore.items.map((p) => p.content)
    const result = await routeIntent(adapter, fallback, image?.base64, undefined, ctrl.signal, principles)
    const product = extractProduct(result, fallback)
    setParsed(product)
    return product
  }

  async function handleImpulse() {
    if (busy) return
    setBusy('impulse')
    try {
      const product = await ensureParsed()
      if (!product) return
      await impulseStore.add(
        { item_name: product.item_name, estimated_price: product.estimated_price, season_tag: 'year_round', source: '我现在想买' },
        cooldownHours,
      )
      onClose()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(`出错了：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleResearch() {
    if (busy) return
    setBusy('research')
    try {
      const product = await ensureParsed()
      if (!product) return
      onClose()
      navigate('/execution', {
        state: { prefill: { category: product.item_name, estimatedPrice: product.estimated_price } },
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(`出错了：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(null)
    }
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

        <div className="mt-5 flex gap-2.5">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void handleImpulse()}
            disabled={!hasInput || !!busy}
          >
            {busy === 'impulse' ? '分析中…' : '记录冲动，先忍忍'}
          </Button>
          <Button
            className="flex-1"
            onClick={() => void handleResearch()}
            disabled={!hasInput || !!busy}
          >
            {busy === 'research' ? '分析中…' : '去研究它 →'}
          </Button>
        </div>
      </ImageDropZone>
    </div>
  )
}

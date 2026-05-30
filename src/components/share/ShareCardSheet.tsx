import { useEffect, useRef, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'

/**
 * 分享卡片的通用容器：把传入的卡片 DOM（children）用 html2canvas 截成 PNG，
 * 提供「保存图片」与「微信分享」两个出口。
 *
 * 关键点：
 * - 卡片本体（children）必须用「自包含的内联 hex 样式」绘制，不要用主题 token
 *   （text-ink / var(--…) / oklch），否则 html2canvas 解析计算样式时会因 Tailwind v4
 *   的 oklch 颜色函数报错。外层 UI（按钮/遮罩）随意用主题类，它们不在截图范围内。
 * - 截图前 await document.fonts.ready，保证 DM Sans / DM Serif 已就绪，避免字体跳变。
 * - 「微信分享」走 Web Share API（navigator.share + canShare files），不支持时降级为保存。
 */
export function ShareCardSheet({
  onClose,
  filename,
  children,
}: {
  onClose: () => void
  filename: string
  children: React.ReactNode
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null)
  const [error, setError] = useState<string | null>(null)

  // 支持 Web Share 文件分享时才显示「微信分享」，否则只给「保存图片」。
  const [canShareFiles, setCanShareFiles] = useState(false)
  useEffect(() => {
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' })
      setCanShareFiles(typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }))
    } catch {
      setCanShareFiles(false)
    }
  }, [])

  async function capture(): Promise<Blob | null> {
    const node = cardRef.current
    if (!node) return null
    if (document.fonts?.ready) await document.fonts.ready
    // 懒加载 html2canvas — 分享是低频操作，不进初始包。
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(node, {
      scale: 3,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    })
    return new Promise((res) => canvas.toBlob(res, 'image/png'))
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleSave() {
    if (busy) return
    setBusy('save')
    setError(null)
    try {
      const blob = await capture()
      if (!blob) throw new Error('生成图片失败')
      download(blob)
    } catch (err) {
      setError(`保存失败：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    if (busy) return
    setBusy('share')
    setError(null)
    try {
      const blob = await capture()
      if (!blob) throw new Error('生成图片失败')
      const file = new File([blob], `${filename}.png`, { type: 'image/png' })
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'KURA' })
      } else {
        download(blob) // 降级：不支持文件分享就直接保存
      }
    } catch (err) {
      // 用户在系统分享弹层点了取消 → 不当作错误。
      if ((err as Error).name !== 'AbortError') setError(`分享失败：${(err as Error).message || '请稍后重试'}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/60 px-6"
      style={{ animation: 'sheet-backdrop-in 0.2s ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <button
        onClick={onClose}
        disabled={!!busy}
        className="absolute right-5 top-5 text-white/70 transition-colors hover:text-white disabled:opacity-40"
        aria-label="关闭"
      >
        <X size={22} />
      </button>

      {/* 截图目标。包一层让 html2canvas 只截卡片本体。 */}
      <div ref={cardRef}>{children}</div>

      <div className="flex flex-col items-center gap-2.5">
        <div className="flex gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-[#2C1F14] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Download size={15} />
            {busy === 'save' ? '生成中…' : '保存图片'}
          </button>
          {canShareFiles && (
            <button
              onClick={() => void handleShare()}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-full bg-[#07C160] px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Share2 size={15} />
              {busy === 'share' ? '生成中…' : '微信分享'}
            </button>
          )}
        </div>
        {error && <p className="text-[13px] text-red-300">{error}</p>}
      </div>
    </div>
  )
}

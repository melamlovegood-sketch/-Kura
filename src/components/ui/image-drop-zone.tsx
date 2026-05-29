import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cn, fileToBase64 } from '@/lib/utils'

interface ImageDropZoneProps {
  onFile: (base64: string, file: File) => void
  children: ReactNode
  className?: string
  overlayContent?: ReactNode
}

export function ImageDropZone({ onFile, children, className, overlayContent }: ImageDropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const counter = useRef(0)

  function handleDragEnter(e: DragEvent) {
    e.preventDefault()
    if (!hasImageFile(e)) return
    counter.current++
    if (counter.current === 1) setDragging(true)
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    counter.current = Math.max(0, counter.current - 1)
    if (counter.current === 0) setDragging(false)
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault()
    counter.current = 0
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (!file) return
    onFile(await fileToBase64(file), file)
  }

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[14px] border-2 border-dashed border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-sm">
          {overlayContent ?? <span className="text-sm text-ink-3">松开以上传图片</span>}
        </div>
      )}
    </div>
  )
}

function hasImageFile(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.items).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  )
}

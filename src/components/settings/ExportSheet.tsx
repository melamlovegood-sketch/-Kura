import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  loadAllExportData, countRecords, downloadExport,
  RANGE_OPTIONS, type ExportData, type ExportFormat, type ExportRange,
} from '@/lib/exportData'

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'csv',  label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

/**
 * 导出全部数据 bottom sheet. Loads every export table once on open, then the count
 * pill + the eventual download both filter that snapshot client-side, so toggling
 * 格式/时间范围 is instant. CSV → a zip of per-table sheets; JSON → one file.
 */
export function ExportSheet({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [range, setRange] = useState<ExportRange>('3months')
  const [data, setData] = useState<ExportData | null>(null)

  useEffect(() => { void loadAllExportData().then(setData) }, [])

  const count = data ? countRecords(data, range) : null

  function handleDownload() {
    if (!data) return
    downloadExport(data, format, range)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      style={{ animation: 'sheet-backdrop-in 0.2s ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[640px] rounded-t-2xl bg-card px-6 pt-5 pb-8 [animation:sheet-slide-up_0.28s_cubic-bezier(0.32,0.72,0,1)]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[17px] font-medium text-ink">导出全部数据</h3>
          <button onClick={onClose} className="text-ink-4 transition-colors hover:text-ink-3">
            <X size={18} />
          </button>
        </div>

        {/* 格式 */}
        <div className="mb-5">
          <label className="mb-2 block text-[13px] text-ink-3">格式</label>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={cn(
                  'flex-1 rounded-xl border-theme py-2.5 text-[14px] font-medium transition-colors',
                  format === f.value ? 'bg-accent text-on-accent' : 'bg-card-alt text-ink-3 hover:text-ink-2',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 时间范围 */}
        <div className="mb-6">
          <label className="mb-2 block text-[13px] text-ink-3">时间范围</label>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  'rounded-lg border-theme px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  range === r.value ? 'bg-accent text-on-accent' : 'bg-card-alt text-ink-3 hover:text-ink-2',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full gap-2" onClick={handleDownload} disabled={!data || count === 0}>
          <Download size={16} />
          {data == null
            ? '统计中…'
            : `下载（共 ${count} 条记录）`}
        </Button>
        <p className="mt-2.5 text-center text-[12px] text-ink-4">
          {format === 'csv' ? '每个表一个 CSV，打包为 zip' : '单个 JSON 文件，按表分组'}
        </p>
      </div>
    </div>
  )
}

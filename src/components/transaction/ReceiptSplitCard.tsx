import { useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CategoryPicker } from './CategoryPicker'
import { getCategoryMain } from '@/lib/categories'
import { formatAmount } from '@/lib/utils'
import type { ItemCategory, ParsedTransaction } from '@/types/db'

interface ReceiptSplitCardProps {
  items: ParsedTransaction[]
  source: 'text' | 'screenshot'
  onConfirmAll: (txs: ParsedTransaction[]) => Promise<void>
  onCancel: () => void
}

/**
 * 超市小票 AI 拆分确认（功能4）：把一张小票拆成的多条记账逐条展示，可改描述/金额/分类、
 * 可删行，底部「全部确认」批量写入。合计实时显示，方便核对是否等于小票总额。
 */
export function ReceiptSplitCard({ items, source, onConfirmAll, onCancel }: ReceiptSplitCardProps) {
  const [rows, setRows] = useState<ParsedTransaction[]>(items)
  const [saving, setSaving] = useState(false)

  function patch(i: number, p: Partial<ParsedTransaction>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i))
  }

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  async function handleConfirm() {
    const valid = rows.filter((r) => r.amount > 0)
    if (valid.length === 0) return
    setSaving(true)
    try { await onConfirmAll(valid) } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          小票拆分
          <span className="ml-2 normal-case font-normal text-ink-4">· {source === 'screenshot' ? '截图' : '文字'} · {rows.length} 项</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-2 border-b-theme pb-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={r.description}
                onChange={(e) => patch(i, { description: e.target.value })}
                placeholder="商品"
                className="flex-1 bg-transparent text-[14px] text-ink-2 outline-none border-b-theme pb-0.5 transition-colors focus:border-b-[var(--text-muted)]"
              />
              <span className="text-[13px] text-ink-4">¥</span>
              <input
                type="number"
                value={r.amount || ''}
                onChange={(e) => patch(i, { amount: Number(e.target.value) || 0 })}
                placeholder="0"
                min={0}
                step={0.01}
                className="w-20 bg-transparent text-right font-serif text-[16px] text-ink outline-none border-b-theme pb-0.5 transition-colors focus:border-b-[var(--text-muted)]"
              />
              <button onClick={() => removeRow(i)} className="text-ink-4 transition-colors hover:text-ink-3">
                <X size={15} />
              </button>
            </div>
            <CategoryPicker value={r.category} onChange={(c: ItemCategory) => patch(i, { category: c, category_main: getCategoryMain(c) })} />
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[13px] text-ink-4">合计</span>
          <span className="font-serif text-[18px] text-ink tabular-nums">{formatAmount(total)}</span>
        </div>

        <div className="flex items-center justify-between border-t-theme pt-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
          <Button size="sm" onClick={() => void handleConfirm()} disabled={saving || rows.length === 0}>
            {saving ? '保存中…' : '全部确认'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

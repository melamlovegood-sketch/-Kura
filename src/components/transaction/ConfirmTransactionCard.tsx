import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CategoryPicker } from './CategoryPicker'
import { getCategoryMain } from '@/lib/categories'
import type { ItemCategory, ParsedTransaction } from '@/types/db'

interface ConfirmTransactionCardProps {
  initial: ParsedTransaction
  source: 'text' | 'screenshot'
  onConfirm: (tx: ParsedTransaction) => Promise<void>
  onCancel: () => void
}

export function ConfirmTransactionCard({ initial, source, onConfirm, onCancel }: ConfirmTransactionCardProps) {
  const [amount,      setAmount]      = useState(initial.amount)
  const [description, setDescription] = useState(initial.description)
  const [category,    setCategory]    = useState<ItemCategory>(initial.category)
  const [date,        setDate]        = useState(initial.date)
  const [confirming,  setConfirming]  = useState(false)

  async function handleConfirm() {
    if (amount <= 0) return
    setConfirming(true)
    try { await onConfirm({ amount, description, category, category_main: getCategoryMain(category), date }) }
    finally { setConfirming(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          记账确认
          {source === 'screenshot' && <span className="ml-2 normal-case font-normal text-ink-4">· 截图</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Amount */}
        <div className="flex items-baseline gap-1.5 border-b-theme pb-3">
          <span className="text-lg text-ink-4">¥</span>
          <input
            type="number"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            min={0}
            step={0.01}
            className="w-full bg-transparent font-serif text-4xl text-ink outline-none placeholder:text-ink-4"
          />
        </div>

        {/* Description */}
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="消费描述"
          className="w-full bg-transparent text-[15px] text-ink-2 outline-none border-b-theme focus:border-b-[var(--text-muted)] transition-colors pb-1 placeholder:text-ink-4"
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-fit bg-transparent text-[13px] text-ink-4 outline-none border-b-theme focus:border-b-[var(--text-muted)] transition-colors"
        />

        <div className="flex items-center justify-between border-t-theme pt-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={confirming}>取消</Button>
          <Button size="sm" onClick={() => void handleConfirm()} disabled={confirming || amount <= 0}>
            {confirming ? '保存中…' : '确认记账'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

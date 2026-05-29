import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_GROUPS, CATEGORY_META, CATEGORY_MAIN_LABEL } from '@/lib/categories'
import type { ItemCategory } from '@/types/db'

interface CategoryPickerProps {
  value: ItemCategory
  onChange: (cat: ItemCategory) => void
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const meta = CATEGORY_META[value]

  function handleSelect(cat: ItemCategory) { onChange(cat); setOpen(false) }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit items-center gap-1.5 rounded-lg border-theme bg-card-alt px-2.5 py-1 text-[13px] text-ink-2 transition-colors hover:bg-[var(--bg-card)]"
      >
        <span className="text-ink-4">{CATEGORY_MAIN_LABEL[meta.main]}</span>
        <span className="text-ink-4">›</span>
        <span className="font-medium">{meta.label}</span>
        <ChevronDown size={11} className={cn('text-ink-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="rounded-[12px] border-theme bg-card p-3 shadow-sm">
          {CATEGORY_GROUPS.map((group) => (
            <div key={group.main} className="mb-3 last:mb-0">
              <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-[13px] transition-colors',
                      cat === value
                        ? 'bg-accent text-on-accent'
                        : 'bg-card-alt text-ink-2 hover:text-ink',
                    )}
                  >
                    {CATEGORY_META[cat].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Identity } from '@/lib/costPerspective'

export interface CostPerspectiveValue {
  identity: Identity
  income: string      // 月生活费 (student) / 月薪 (worker)
  foodBudget: string  // 月伙食费 (student)
  workHours: string   // 日工作时长 (worker)
}

export const EMPTY_COST_VALUE: CostPerspectiveValue = { identity: null, income: '', foodBudget: '', workHours: '' }

/**
 * 代价视角 (SPEC_PHASE2 §1) field group — shared by onboarding (bug4) and the
 * 我的消费观 aggregation page (bug10) so the identity + 月生活费/月伙食费 inputs are
 * defined once. Fully controlled; the parent owns persistence.
 */
export function CostPerspectiveFields({ value, onChange }: {
  value: CostPerspectiveValue
  onChange: (next: CostPerspectiveValue) => void
}) {
  const set = (patch: Partial<CostPerspectiveValue>) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-ink-4">
        选择身份后，待购清单和冲动卡片会把金额换算成你有感的代价（如「11 天伙食费」「工作 3 小时」）。不填则不显示。
      </p>

      <div className="flex gap-2">
        {([
          { value: null,      label: '不开启' },
          { value: 'student', label: '🎓 学生' },
          { value: 'worker',  label: '💼 工作党' },
        ] as { value: Identity; label: string }[]).map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => set({ identity: opt.value })}
            className={cn(
              'flex-1 rounded-lg border-theme px-3 py-2 text-[13px] font-medium transition-colors',
              value.identity === opt.value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:bg-card-alt hover:text-ink-2',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.identity === 'student' && (
        <>
          <Labeled label="月生活费">
            <Input type="number" value={value.income} onChange={(e) => set({ income: e.target.value })} className="w-32" min={0} placeholder="¥" />
          </Labeled>
          <Labeled label="月伙食费">
            <Input type="number" value={value.foodBudget} onChange={(e) => set({ foodBudget: e.target.value })} className="w-32" min={0} placeholder="¥" />
          </Labeled>
        </>
      )}

      {value.identity === 'worker' && (
        <>
          <Labeled label="月薪">
            <Input type="number" value={value.income} onChange={(e) => set({ income: e.target.value })} className="w-32" min={0} placeholder="¥" />
          </Labeled>
          <Labeled label="日工作时长">
            <Input type="number" value={value.workHours} onChange={(e) => set({ workHours: e.target.value })} className="w-32" min={1} max={24} step={0.5} placeholder="8" />
          </Labeled>
        </>
      )}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-[13px] text-ink-3">{label}</label>
      <div className="flex items-center gap-3">
        {children}
        <span className="text-[13px] text-ink-4">{label.includes('时长') ? '小时 / 天' : '元 / 月'}</span>
      </div>
    </div>
  )
}

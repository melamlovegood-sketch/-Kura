import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetCard } from '@/components/budget/BudgetCard'
import { PrinciplesSection } from '@/components/principles/PrinciplesSection'
import { CostPerspectiveFields, type CostPerspectiveValue } from '@/components/cost/CostPerspectiveFields'
import { useSettingsStore } from '@/store/settings'

/**
 * 我的消费观 (bug10) — a single secondary page that gathers the scattered AI
 * decision-context settings: 个人消费原则, 代价视角 (identity + 月生活费/伙食费), and
 * the monthly budget. Reached from a card on the Settings page (not the bottom
 * nav). These all feed how the app frames and analyses each spending decision.
 */
export function ConsumptionView() {
  const navigate = useNavigate()
  const store = useSettingsStore()

  const [cost, setCost] = useState<CostPerspectiveValue>({
    identity: store.identity,
    income: store.monthlyIncome != null ? String(store.monthlyIncome) : '',
    foodBudget: store.monthlyFoodBudget != null ? String(store.monthlyFoodBudget) : '',
    workHours: store.dailyWorkHours != null ? String(store.dailyWorkHours) : '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reflect already-saved values once the store hydrates from Supabase.
  useEffect(() => {
    if (!store.loaded) return
    setCost({
      identity: store.identity,
      income: store.monthlyIncome != null ? String(store.monthlyIncome) : '',
      foodBudget: store.monthlyFoodBudget != null ? String(store.monthlyFoodBudget) : '',
      workHours: store.dailyWorkHours != null ? String(store.dailyWorkHours) : '',
    })
  }, [store.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCost() {
    setSaving(true)
    const num = (s: string) => { const n = Number(s); return s.trim() && n > 0 ? n : null }
    await store.update({
      identity: cost.identity,
      monthlyIncome:     cost.identity ? num(cost.income) : null,
      monthlyFoodBudget: cost.identity === 'student' ? num(cost.foodBudget) : null,
      dailyWorkHours:    cost.identity === 'worker' ? num(cost.workHours) : null,
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-5 pt-6 w-full max-w-[640px] mx-auto px-6">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/settings')} className="text-ink-4 transition-colors hover:text-ink-2" aria-label="返回">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-base font-medium text-ink">我的消费观</h1>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-4">
        这里收拢了影响 AI 决策的所有设定——消费原则、代价视角、预算。它们共同决定 Kura 如何替你权衡每一笔消费。
      </p>

      {/* ── 预算 / 生活费 ── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">本月预算</h2>
        <BudgetCard />
      </section>

      {/* ── 代价视角 ── */}
      <Card>
        <CardHeader><CardTitle>代价视角</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CostPerspectiveFields value={cost} onChange={setCost} />
          <Button onClick={() => void saveCost()} disabled={saving}>
            {saving ? '保存中…' : saved ? '已保存' : '保存代价视角'}
          </Button>
        </CardContent>
      </Card>

      {/* ── 个人消费原则 ── */}
      <PrinciplesSection />
    </div>
  )
}

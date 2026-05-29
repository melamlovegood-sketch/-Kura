/**
 * 代价视角 (SPEC_PHASE2 §1) — translate a price into a felt, real-world cost.
 * Tone is deliberately flat: cold statements, no exclamation marks.
 */

export type Identity = 'student' | 'worker' | null

export interface CostInputs {
  identity: Identity
  monthlyIncome: number | null      // 月生活费 (student) / 月薪 (worker)
  monthlyFoodBudget: number | null  // 月伙食费 (student)
  dailyWorkHours: number | null     // 日工作时长 (worker)
}

export interface PoolSnapshot {
  saved_amount: number
  target_amount: number
}

const WORK_DAYS_PER_MONTH = 21.75 // statutory average

/** Round to an int, or one decimal when the value is below 1 (so it never reads 0). */
function trim(n: number): string {
  if (n >= 10) return String(Math.round(n))
  if (n >= 1) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '')
  return (Math.round(n * 10) / 10).toString()
}

/**
 * Spending `amount` is framed as the wish pool retreating: the money could have
 * been savings. Returns "许愿池退回到 X%" or null when there's no pool / no
 * progress to lose.
 */
function poolAnchor(amount: number, pool: PoolSnapshot | null): string | null {
  if (!pool || pool.target_amount <= 0 || pool.saved_amount <= 0) return null
  const remaining = Math.max(0, pool.saved_amount - amount)
  const pct = Math.round((remaining / pool.target_amount) * 100)
  return `许愿池退回到 ${pct}%`
}

/**
 * Up to 2 cost labels for a price, in priority order:
 *   1. 许愿池锚点 (always first)
 *   2. 伙食天数 / 工作时长
 *   3. 本月生活费占比 (>30%) / 工作几天白干 (>8h)
 */
export function costLabels(
  amount: number | null | undefined,
  inputs: CostInputs,
  pool: PoolSnapshot | null,
): string[] {
  if (amount == null || amount <= 0) return []

  const labels: string[] = []

  const anchor = poolAnchor(amount, pool)
  if (anchor) labels.push(anchor)

  if (inputs.identity === 'student') {
    const { monthlyFoodBudget, monthlyIncome } = inputs
    if (monthlyFoodBudget && monthlyFoodBudget > 0) {
      const days = amount / (monthlyFoodBudget / 30)
      labels.push(`${trim(days)} 天伙食费`)
    }
    if (monthlyIncome && monthlyIncome > 0) {
      const pct = (amount / monthlyIncome) * 100
      if (pct > 30) labels.push(`本月生活费的 ${Math.round(pct)}%`)
    }
  } else if (inputs.identity === 'worker') {
    const { monthlyIncome, dailyWorkHours } = inputs
    if (monthlyIncome && monthlyIncome > 0 && dailyWorkHours && dailyWorkHours > 0) {
      const hourlyWage = monthlyIncome / WORK_DAYS_PER_MONTH / dailyWorkHours
      const hours = amount / hourlyWage
      if (hours > 8) labels.push(`${trim(hours / 8)} 天工作白干了`)
      else labels.push(`工作 ${trim(hours)} 小时`)
    }
  }

  return labels.slice(0, 2)
}

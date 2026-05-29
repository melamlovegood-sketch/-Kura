/** Returns the number of days remaining in the current month (0 on the last day). */
export function daysUntilMonthEnd(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return lastDay - now.getDate()
}

/** Returns how much can be spent per day given a remaining amount and days left. */
export function dailyRemaining(amount: number, days: number): number {
  if (days <= 0) return amount
  return Math.round(amount / days)
}

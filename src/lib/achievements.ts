/**
 * 成就系统 (SPEC_PHASE2 §8) — the 10 badges, their unlock conditions, and the
 * stats they read. Most badges are recomputable purely from DB stats; two are
 * special:
 *   - light_travel: event-only (unlocked when the user drops a purchase after a
 *     duplicate-warning, see §3). No `check`.
 *   - squirrel_collector: unlocked once all other 9 are unlocked. Handled in the
 *     store, not via `check`.
 */

export type AchievementKey =
  | 'first_acorn'
  | 'iron_heart'
  | 'ice_cold'
  | 'seven_day'
  | 'month_king'
  | 'regret_regular'
  | 'light_travel'
  | 'expiry_detective'
  | 'bullseye'
  | 'squirrel_collector'

export interface AchievementStats {
  savingsCount: number       // 「忍住了」次数 (savings_records)
  savingsSum: number         // 累计忍住金额
  cooldownCompleted: number  // 完成的冷静期数 (impulse expired)
  streakCurrent: number      // 当前连续自律天数
  regretCount: number        // 后悔榜上榜次数
  expiryTriggered: number    // 保质期提醒触发次数
  wishPoolCompleted: number  // 达成的许愿池目标数
}

export const IRON_HEART_AMOUNT = 5000
export const ICE_COLD_COUNT = 10
export const SEVEN_DAYS = 7
export const MONTH_DAYS = 30
export const REGRET_COUNT = 3
export const EXPIRY_COUNT = 5

export interface AchievementDef {
  key: AchievementKey
  emoji: string
  title: string
  desc: string
  /** Satisfied purely by DB stats. Absent for event-only / aggregate badges. */
  check?: (s: AchievementStats) => boolean
  /** Numeric progress hint for the locked state (e.g. "2400 / 5000"); null = none. */
  progress?: (s: AchievementStats) => string | null
}

/** Display order = spec order. squirrel_collector last. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: 'first_acorn', emoji: '🌰', title: '第一颗栗子', desc: '第一次「忍住了」',
    check: (s) => s.savingsCount >= 1,
  },
  {
    key: 'iron_heart', emoji: '🧘', title: '铁石心肠', desc: `累计忍住金额 ≥ ${IRON_HEART_AMOUNT} 元`,
    check: (s) => s.savingsSum >= IRON_HEART_AMOUNT,
    progress: (s) => `${Math.round(s.savingsSum)} / ${IRON_HEART_AMOUNT}`,
  },
  {
    key: 'ice_cold', emoji: '❄️', title: '冷静如冰', desc: `完成 ${ICE_COLD_COUNT} 次冷静期`,
    check: (s) => s.cooldownCompleted >= ICE_COLD_COUNT,
    progress: (s) => `${s.cooldownCompleted} / ${ICE_COLD_COUNT}`,
  },
  {
    key: 'seven_day', emoji: '🔥', title: '七天不败', desc: `连续 ${SEVEN_DAYS} 天无冲动消费`,
    check: (s) => s.streakCurrent >= SEVEN_DAYS,
    progress: (s) => `${s.streakCurrent} / ${SEVEN_DAYS}`,
  },
  {
    key: 'month_king', emoji: '🏆', title: '月度自律王', desc: `连续 ${MONTH_DAYS} 天无冲动消费`,
    check: (s) => s.streakCurrent >= MONTH_DAYS,
    progress: (s) => `${s.streakCurrent} / ${MONTH_DAYS}`,
  },
  {
    key: 'regret_regular', emoji: '💸', title: '后悔榜常客', desc: `后悔榜上榜 ≥ ${REGRET_COUNT} 次`,
    check: (s) => s.regretCount >= REGRET_COUNT,
    progress: (s) => `${s.regretCount} / ${REGRET_COUNT}`,
  },
  {
    key: 'light_travel', emoji: '👜', title: '轻装上阵', desc: '同类提醒后放弃购买',
    // event-only — unlocked from the duplicate-warning flow
  },
  {
    key: 'expiry_detective', emoji: '⏰', title: '临期侦探', desc: `保质期提醒触发 ≥ ${EXPIRY_COUNT} 次`,
    check: (s) => s.expiryTriggered >= EXPIRY_COUNT,
    progress: (s) => `${s.expiryTriggered} / ${EXPIRY_COUNT}`,
  },
  {
    key: 'bullseye', emoji: '🎯', title: '一击即中', desc: '许愿池达成第一个目标',
    check: (s) => s.wishPoolCompleted >= 1,
  },
  {
    key: 'squirrel_collector', emoji: '🐿️', title: '松鼠收藏家', desc: '解锁全部成就',
    // unlocked when every other badge is unlocked — handled in the store
  },
]

/** All badge keys except the aggregate collector — used for the collector check. */
export const NON_COLLECTOR_KEYS: AchievementKey[] = ACHIEVEMENTS
  .map((a) => a.key)
  .filter((k) => k !== 'squirrel_collector')

/**
 * Which stat-driven badges are now satisfied but not yet in `unlocked`.
 * Does NOT include light_travel (event-only) or squirrel_collector (aggregate).
 */
export function newlyQualified(stats: AchievementStats, unlocked: Set<string>): AchievementKey[] {
  return ACHIEVEMENTS
    .filter((a) => a.check && !unlocked.has(a.key) && a.check(stats))
    .map((a) => a.key)
}

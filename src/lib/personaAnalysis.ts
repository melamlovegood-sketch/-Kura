/**
 * 消费人格报告 (SPEC_PHASE2 §6). Each month we summarise the previous month's
 * spending into one of 5 personas, with a one-line description and a single,
 * non-preachy improvement tip. The signals below are deliberately approximate —
 * this is a lightweight monthly mirror, not an audit.
 */

export type PersonaKey = 'squirrel' | 'ritual' | 'seasonal' | 'instant' | 'disciplined'

export interface PersonaMeta {
  key: PersonaKey
  emoji: string
  title: string
  description: string
  advice: string
}

export const PERSONAS: Record<PersonaKey, PersonaMeta> = {
  squirrel: {
    key: 'squirrel', emoji: '🐿️', title: '囤货松鼠型',
    description: '买东西爱囤，家里总有同款。',
    advice: '下单前翻翻已有的同类，常会发现并不缺。',
  },
  ritual: {
    key: 'ritual', emoji: '🎭', title: '仪式感驱动型',
    description: '需要一个理由才能放心花钱。',
    advice: '纪念日的快乐其实不靠价格，简单一点也成立。',
  },
  seasonal: {
    key: 'seasonal', emoji: '❄️', title: '季节冲动型',
    description: '每次换季都像一场大采购。',
    advice: '换季先清点旧物，缺什么再补，别整套拿下。',
  },
  instant: {
    key: 'instant', emoji: '💨', title: '即时满足型',
    description: '忍住了这个，转头买了那个。',
    advice: '把省下的钱立刻丢进许愿池，让克制看得见。',
  },
  disciplined: {
    key: 'disciplined', emoji: '🧘', title: '自律守护型',
    description: '这个月花得很克制，值得表扬。',
    advice: '保持节奏，给自己留一点不带负担的预算。',
  },
}

/** Months we treat as season-changeover (spring / autumn). */
const SEASON_CHANGE_MONTHS = [3, 4, 9, 10]

export interface PersonaStats {
  monthNum: number          // 1-12 of the analysed month
  discTxnCount: number      // discretionary transaction count
  discTotal: number         // discretionary spend
  maxCategoryCount: number  // most transactions in a single discretionary category
  top3WindowShare: number   // largest share of disc spend within any 3-day window (0..1)
  impulseDismissed: number  // impulses dropped during cooldown this month
  regretCount: number       // regret-marked reviews completed this month
  longestStreak: number     // longest disciplined streak (proxy for restraint)
  hasAnyActivity: boolean
}

/**
 * Pick the persona that best fits the month. Priority is intentional: a clearly
 * disciplined month is celebrated first; otherwise we surface the strongest
 * spending pattern. Returns null when there's nothing to analyse.
 */
export function analyzePersona(s: PersonaStats): PersonaKey | null {
  if (!s.hasAnyActivity) return null

  if (s.longestStreak >= 14 && s.regretCount === 0) return 'disciplined'
  if (s.maxCategoryCount >= 3) return 'squirrel'
  if (SEASON_CHANGE_MONTHS.includes(s.monthNum) && s.discTxnCount >= 3) return 'seasonal'
  if (s.top3WindowShare >= 0.5 && s.discTxnCount >= 3) return 'ritual'
  if (s.impulseDismissed >= 1) return 'instant'

  return s.discTxnCount === 0 ? 'disciplined' : 'instant'
}

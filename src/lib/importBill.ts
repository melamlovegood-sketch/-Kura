/**
 * 历史账单批量导入 — 微信/支付宝 CSV 解析。
 *
 * 全部在前台完成：解码（自动识别 UTF-8 / GBK）→ 通过文件内容识别平台（不依赖文件名）
 * → 定位表头并按列名取值 → 过滤退款/转账/收入 → 归一化为 RawRecord → 同平台去重。
 * AI 分类在 importClassify.ts，写库在页面里。
 */

export type Platform = 'wechat' | 'alipay'

export interface RawRecord {
  /** YYYY-MM-DD */
  date: string
  description: string
  amount: number
  platform: Platform
}

export interface ParseResult {
  platform: Platform | null
  records: RawRecord[]
  /** 文件里的数据行总数（不含表头/注释） */
  total: number
  /** 被过滤掉的行数（收入 / 转账 / 退款 / 关闭 / 金额非法） */
  skipped: number
}

/* ── 解码：微信导出为 UTF-8(BOM)，支付宝历史导出多为 GBK ───────────────────────── */

export async function decodeCsvFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  // UTF-8 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3))
  }
  // 先按严格 UTF-8 试解，失败则回退到 GBK / GB18030。
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return new TextDecoder('gb18030').decode(buf)
    }
  }
}

/* ── CSV 解析（支持引号包裹、转义双引号、CRLF）─────────────────────────────────── */

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/* ── 平台识别（看内容，不看文件名）──────────────────────────────────────────────── */

export function detectPlatform(content: string): Platform | null {
  if (content.includes('微信支付账单明细')) return 'wechat'
  if (content.includes('支付宝交易记录明细查询') || content.includes('支付宝（中国）')) return 'alipay'
  // 表头特征兜底
  if (content.includes('收/支')) {
    if (content.includes('商品说明')) return 'alipay'
    if (content.includes('交易类型') && content.includes('商品')) return 'wechat'
  }
  return null
}

/* ── 表头定位 + 列取值 ──────────────────────────────────────────────────────────── */

/** 去空白、全角括号转半角，便于列名匹配。 */
const norm = (s: string) => s.replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')')

function findHeader(rows: string[][]): { idx: number; cells: string[] } | null {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm)
    if (cells.includes('收/支')) return { idx: i, cells }
  }
  return null
}

/** 在表头里找第一个满足谓词的列下标，找不到返回 -1。 */
function colIndex(cells: string[], pred: (c: string) => boolean): number {
  return cells.findIndex(pred)
}

function normDate(s: string): string | null {
  const m = s.trim().match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parseAmount(s: string): number {
  // 去掉 ¥ ￥ 元 千分位逗号 空格 等，保留数字/小数点/负号。
  const n = parseFloat(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/**
 * 解析一份已解码的 CSV 文本。platform 可显式传入（步骤1勾选的结果），
 * 传 null 时按内容自动识别。
 */
export function parseBillCsv(content: string, platform: Platform | null): ParseResult {
  const detected = platform ?? detectPlatform(content)
  const rows = parseCsv(content)
  const header = findHeader(rows)
  if (!detected || !header) return { platform: detected, records: [], total: 0, skipped: 0 }

  const { cells } = header
  const dateCol =
    colIndex(cells, (c) => c === '交易时间') >= 0 ? colIndex(cells, (c) => c === '交易时间')
    : colIndex(cells, (c) => c.includes('交易创建时间')) >= 0 ? colIndex(cells, (c) => c.includes('交易创建时间'))
    : colIndex(cells, (c) => c.includes('时间'))
  const descCol =
    colIndex(cells, (c) => c.includes('商品说明')) >= 0 ? colIndex(cells, (c) => c.includes('商品说明'))
    : colIndex(cells, (c) => c.includes('商品名称')) >= 0 ? colIndex(cells, (c) => c.includes('商品名称'))
    : colIndex(cells, (c) => c.includes('商品'))
  const amountCol = colIndex(cells, (c) => c.includes('金额'))
  const ioCol = colIndex(cells, (c) => c === '收/支')
  const statusCol =
    colIndex(cells, (c) => c === '当前状态') >= 0 ? colIndex(cells, (c) => c === '当前状态')
    : colIndex(cells, (c) => c === '交易状态')
  const counterpartyCol = colIndex(cells, (c) => c.includes('交易对方'))

  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')

  let total = 0
  let skipped = 0
  const records: RawRecord[] = []

  for (let r = header.idx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => !c.trim())) continue // 空行/尾行
    total++

    const io = get(row, ioCol)
    const status = get(row, statusCol)
    // 过滤：只保留支出；退款/关闭单独再挡一道（有的导出 收/支 仍是支出但状态退款）。
    if (io !== '支出') { skipped++; continue }
    if (status === '已退款' || status === '交易关闭' || status === '退款成功' || status === '交易超时关闭') {
      skipped++; continue
    }

    const amount = parseAmount(get(row, amountCol))
    if (!Number.isFinite(amount) || amount <= 0) { skipped++; continue }

    const date = normDate(get(row, dateCol))
    if (!date) { skipped++; continue }

    const desc = get(row, descCol) || get(row, counterpartyCol) || '未知消费'
    records.push({ date, description: desc, amount: Math.round(amount * 100) / 100, platform: detected })
  }

  return { platform: detected, records, total, skipped }
}

/* ── 去重：同平台 + 同日期 + 同金额 + 商品名相似度 > 0.9 视为重复 ───────────────── */

function bigrams(s: string): Map<string, number> {
  const t = s.replace(/\s/g, '')
  const m = new Map<string, number>()
  if (t.length === 1) { m.set(t, 1); return m }
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** Sørensen–Dice 二元组相似度，对中文短串友好，0~1。 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const A = bigrams(a)
  const B = bigrams(b)
  let inter = 0
  let sizeA = 0
  let sizeB = 0
  A.forEach((v) => { sizeA += v })
  B.forEach((v) => { sizeB += v })
  A.forEach((v, g) => { inter += Math.min(v, B.get(g) ?? 0) })
  const denom = sizeA + sizeB
  return denom === 0 ? 0 : (2 * inter) / denom
}

export interface DedupeResult {
  kept: RawRecord[]
  removed: number
}

/** 同平台 + 同日期 + 同金额 分桶，桶内描述相似度 > 0.9 的只保留一条。 */
export function dedupe(records: RawRecord[]): DedupeResult {
  const buckets = new Map<string, RawRecord[]>()
  let removed = 0
  for (const rec of records) {
    const key = `${rec.platform}|${rec.date}|${rec.amount.toFixed(2)}`
    const bucket = buckets.get(key)
    if (!bucket) { buckets.set(key, [rec]); continue }
    const dup = bucket.some((b) => similarity(b.description, rec.description) > 0.9)
    if (dup) { removed++; continue }
    bucket.push(rec)
  }
  const kept: RawRecord[] = []
  buckets.forEach((b) => kept.push(...b))
  return { kept, removed }
}

/* ── 近6个月过滤 ────────────────────────────────────────────────────────────────── */

/** 返回“近6个月”的左边界 YYYY-MM-DD（含当月在内共6个自然月）。 */
export function sixMonthsCutoff(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 5, 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

export function withinSixMonths(records: RawRecord[], today = new Date()): RawRecord[] {
  const cutoff = sixMonthsCutoff(today)
  return records.filter((r) => r.date >= cutoff)
}

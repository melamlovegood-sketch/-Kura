/**
 * 数据导出. Aggregates the six user-facing tables and produces either a single
 * JSON file or a zip of per-table CSV "sheets", then triggers a browser download.
 *
 * Works identically in both modes: every read goes through `db.from(table)`, so a
 * signed-in user pulls their own rows (RLS-scoped by user_id) and a guest pulls
 * from the localStorage shim — no branching needed here.
 */
import { db } from '@/lib/db'

/** The six tables surfaced to the user, with the column used for time filtering. */
export const EXPORT_TABLES = [
  { table: 'transactions',   label: '消费记录',     dateField: 'date' },
  { table: 'impulse_records', label: '冲动记录',     dateField: 'recorded_at' },
  { table: 'wishlist_items', label: '待购清单',     dateField: 'added_at' },
  { table: 'savings_records', label: '许愿池忍住记录', dateField: 'recorded_at' },
  { table: 'review_results', label: '复盘结果',     dateField: 'completed_at' },
  { table: 'subscriptions',  label: '订阅',         dateField: 'created_at' },
] as const

export type ExportTable = (typeof EXPORT_TABLES)[number]['table']

export type ExportRange = 'month' | '3months' | '6months' | 'all'

export const RANGE_OPTIONS: { value: ExportRange; label: string }[] = [
  { value: 'month',    label: '本月' },
  { value: '3months',  label: '近3个月' },
  { value: '6months',  label: '近半年' },
  { value: 'all',      label: '全部' },
]

export type ExportFormat = 'csv' | 'json'

type Row = Record<string, unknown>
export type ExportData = Record<ExportTable, Row[]>

/**
 * Canonical column order per table (matches schema.sql). CSV columns are this list
 * plus any extra keys found in the data (e.g. user_id, image_url) appended after —
 * so the output stays stable and complete even as migrations add columns.
 */
const TABLE_FIELDS: Record<ExportTable, string[]> = {
  transactions:    ['id', 'date', 'amount', 'category', 'category_main', 'description', 'source', 'expiry_date', 'created_at'],
  impulse_records: ['id', 'item_name', 'estimated_price', 'season_tag', 'source', 'recorded_at', 'expires_at', 'status'],
  wishlist_items:  ['id', 'item_name', 'category', 'estimated_price', 'season_tag', 'priority', 'need_intensity', 'worthiness_score', 'worthiness_reason', 'is_focus', 'status', 'added_at'],
  savings_records: ['id', 'wish_pool_id', 'amount', 'description', 'recorded_at'],
  review_results:  ['id', 'review_task_id', 'usage_frequency', 'worthiness', 'usage_note', 'completed_at'],
  subscriptions:   ['id', 'name', 'amount', 'billing_day', 'category', 'is_active', 'created_at'],
}

// ─── Loading ─────────────────────────────────────────────────────────────────

/** Pull every export table in full, once. Range filtering happens client-side. */
export async function loadAllExportData(): Promise<ExportData> {
  const out = {} as ExportData
  await Promise.all(
    EXPORT_TABLES.map(async ({ table }) => {
      const { data } = await db.from(table).select('*')
      out[table] = (data as Row[] | null) ?? []
    }),
  )
  return out
}

// ─── Range filtering ──────────────────────────────────────────────────────────

/** The inclusive lower-bound date for a range, or null for '全部'. */
function rangeCutoff(range: ExportRange): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (range === '3months') { d.setMonth(d.getMonth() - 3); return d }
  d.setMonth(d.getMonth() - 6) // 6months
  return d
}

/** Rows of one table that fall within the range (compares its date column). */
function filterRows(table: ExportTable, rows: Row[], range: ExportRange): Row[] {
  const cutoff = rangeCutoff(range)
  if (!cutoff) return rows
  const field = EXPORT_TABLES.find((t) => t.table === table)!.dateField
  const cutoffMs = cutoff.getTime()
  return rows.filter((r) => {
    const v = r[field]
    if (v == null) return false
    const ms = new Date(String(v)).getTime()
    return !Number.isNaN(ms) && ms >= cutoffMs
  })
}

/** Apply a range filter to the whole dataset. */
export function filterExportData(data: ExportData, range: ExportRange): ExportData {
  const out = {} as ExportData
  for (const { table } of EXPORT_TABLES) out[table] = filterRows(table, data[table] ?? [], range)
  return out
}

/** Total record count across all tables for the given range. */
export function countRecords(data: ExportData, range: ExportRange): number {
  return EXPORT_TABLES.reduce((sum, { table }) => sum + filterRows(table, data[table] ?? [], range).length, 0)
}

// ─── CSV ───────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One table → a CSV string (canonical columns + any extras found in the rows). */
function tableToCsv(table: ExportTable, rows: Row[]): string {
  const base = TABLE_FIELDS[table]
  const extras: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!base.includes(key) && !extras.includes(key)) extras.push(key)
    }
  }
  const cols = [...base, ...extras]
  const lines = [cols.join(',')]
  for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(','))
  return lines.join('\r\n')
}

// ─── Zip (store method, no compression) ─────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Build a minimal ZIP archive (no compression) from a set of named files. Just the
 * local headers + central directory + end-of-central-directory record — enough for
 * every OS unzip tool to read. Avoids pulling in a zip dependency for a handful of
 * small CSVs.
 */
function createZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff])
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])

  for (const file of files) {
    const nameBytes = enc.encode(file.name)
    const crc = crc32(file.data)
    const size = file.data.length

    // Local file header
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
      nameBytes, file.data,
    ])
    chunks.push(local)

    // Central directory header
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes,
    ]))

    offset += local.length
  }

  const centralBlob = concat(central)
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBlob.length), u32(offset), u16(0),
  ])

  return new Blob([concat([...chunks, centralBlob, end])], { type: 'application/zip' })
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) { out.set(p, pos); pos += p.length }
  return out
}

// ─── Download ────────────────────────────────────────────────────────────────

function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Build and download the export for the chosen format + range.
 *  - json: one file, key = table name, value = its rows.
 *  - csv:  a zip with one CSV "sheet" per table.
 */
export function downloadExport(data: ExportData, format: ExportFormat, range: ExportRange): void {
  const filtered = filterExportData(data, range)
  const stamp = todayStamp()

  if (format === 'json') {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    triggerDownload(blob, `kura-export-${stamp}.json`)
    return
  }

  const enc = new TextEncoder()
  const files = EXPORT_TABLES.map(({ table }) => ({
    name: `${table}.csv`,
    // BOM so Excel opens the CSV as UTF-8 (Chinese text stays readable).
    data: enc.encode('﻿' + tableToCsv(table, filtered[table] ?? [])),
  }))
  triggerDownload(createZip(files), `kura-export-${stamp}.zip`)
}

import { readFileSync } from 'fs'

// Load .env manually (plain node, no Vite). READ-ONLY diagnostic — never writes.
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function rest(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  const body = await res.text()
  return { status: res.status, body }
}
function msg(body) { try { return JSON.parse(body).message || body } catch { return body } }

// 1. Which user_settings columns the app touches — probe each individually (read-only)
console.log('=== user_settings column existence (SELECT per column) ===')
const wanted = ['id', 'user_id', 'cooldown_hours', 'ai_provider', 'ai_model', 'ai_api_key', 'theme', 'created_at', 'updated_at']
for (const c of wanted) {
  const r = await rest(`user_settings?select=${c}&limit=1`)
  console.log(`${r.status === 200 ? 'OK ' : 'MISSING/ERR'} ${c.padEnd(16)} ${r.status}${r.status >= 400 ? '  ' + msg(r.body).slice(0, 140) : ''}`)
}

console.log('\n=== user_settings: full row (current values) ===')
const full = await rest('user_settings?select=*&limit=1')
console.log('status', full.status)
try {
  const rows = JSON.parse(full.body)
  if (rows[0]) {
    console.log('ACTUAL COLUMNS:', Object.keys(rows[0]).join(', '))
    const r = { ...rows[0] }; if (r.ai_api_key) r.ai_api_key = '***redacted***'
    console.log('ROW:', JSON.stringify(r))
  } else console.log('(no rows — table is empty, app will INSERT on first save)')
} catch { console.log('body:', full.body.slice(0, 300)) }

// 2. Table / view existence
console.log('\n=== table / view existence ===')
const objs = [
  'user_settings', 'monthly_budgets', 'impulse_records', 'wishlist_items',
  'wish_pools', 'savings_records', 'execution_sessions', 'transactions',
  'sop_rules', 'brand_library', 'price_tracks', 'price_records',
  'review_tasks', 'review_results', 'personal_principles',
  'v_current_budget', 'v_active_wish_pool',
]
for (const o of objs) {
  const r = await rest(`${o}?select=*&limit=1`)
  console.log(`${r.status === 200 ? 'OK ' : 'ERR'} ${o.padEnd(20)} ${r.status}${r.status >= 400 ? '  ' + msg(r.body).slice(0, 100) : ''}`)
}

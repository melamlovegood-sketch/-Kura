// Supabase Edge Function: send-reminders
//
// 每天 08:00（Asia/Shanghai, UTC+8）由 Supabase Cron 触发，发三类 Web Push：
//   1. 冷静期到期 — impulse_records 今天到期的 pending 条目
//   2. 订阅扣款   — subscriptions billing_day = 今天+3 的启用订阅
//   3. 保质期临期 — transactions expiry_date 在今天~7 天内
// 每个用户在 user_settings 里关掉的类型直接跳过。推送走 web-push 发到该用户
// push_subscriptions 里的每个 endpoint；端点失效(404/410)则删除。
//
// 部署：supabase functions deploy send-reminders
// 定时：Dashboard → Edge Functions → Cron，schedule `0 0 * * *`（UTC，= 北京 08:00）
// Secrets 需要：VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000 // Asia/Shanghai
const pad = (n: number) => String(n).padStart(2, '0')
const yuan = (n: number) => `¥${Math.round(Number(n))}`

interface PushPayload {
  title: string
  body: string
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!

  if (!vapidPublic || !vapidPrivate) {
    return json({ error: 'Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' }, 500)
  }

  webpush.setVapidDetails('mailto:reminders@kura.app', vapidPublic, vapidPrivate)
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── date windows (local / UTC+8) ──
  const nowLocal = new Date(Date.now() + TZ_OFFSET_MS)
  const y = nowLocal.getUTCFullYear()
  const mo = nowLocal.getUTCMonth()
  const d = nowLocal.getUTCDate()

  const todayStr = `${y}-${pad(mo + 1)}-${pad(d)}`
  const todayStartUTC = new Date(Date.UTC(y, mo, d) - TZ_OFFSET_MS) // local 00:00 in real UTC
  const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000)

  const plus3 = new Date(Date.UTC(y, mo, d + 3))
  const billingDay = plus3.getUTCDate() // 扣款日 = 今天 + 3 天的「号」

  const plus7 = new Date(Date.UTC(y, mo, d + 7))
  const plus7Str = `${plus7.getUTCFullYear()}-${pad(plus7.getUTCMonth() + 1)}-${pad(plus7.getUTCDate())}`

  // ── load notification prefs + subscriptions ──
  const [{ data: settingsRows }, { data: subRows }] = await Promise.all([
    supabase.from('user_settings').select('user_id, notify_cooldown, notify_subscription, notify_expiry'),
    supabase.from('push_subscriptions').select('user_id, endpoint, subscription'),
  ])

  type Prefs = { notify_cooldown: boolean; notify_subscription: boolean; notify_expiry: boolean }
  const prefs = new Map<string, Prefs>()
  for (const r of settingsRows ?? []) {
    prefs.set(r.user_id, {
      notify_cooldown: r.notify_cooldown ?? true,
      notify_subscription: r.notify_subscription ?? true,
      notify_expiry: r.notify_expiry ?? true,
    })
  }
  const wants = (userId: string, key: keyof Prefs) => (prefs.get(userId)?.[key] ?? true)

  const subsByUser = new Map<string, { endpoint: string; subscription: unknown }[]>()
  for (const s of subRows ?? []) {
    const list = subsByUser.get(s.user_id) ?? []
    list.push({ endpoint: s.endpoint, subscription: s.subscription })
    subsByUser.set(s.user_id, list)
  }

  // ── gather the three reminder sources ──
  const [cooldownRes, subDueRes, expiryRes] = await Promise.all([
    supabase
      .from('impulse_records')
      .select('user_id, item_name')
      .eq('status', 'pending')
      .gte('expires_at', todayStartUTC.toISOString())
      .lt('expires_at', todayEndUTC.toISOString()),
    supabase
      .from('subscriptions')
      .select('user_id, name, amount')
      .eq('is_active', true)
      .eq('billing_day', billingDay),
    supabase
      .from('transactions')
      .select('user_id, description, category, expiry_date')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', todayStr)
      .lte('expiry_date', plus7Str),
  ])

  // ── build (userId, payload) list, honouring per-type toggles ──
  const jobs: { userId: string; payload: PushPayload }[] = []

  for (const r of cooldownRes.data ?? []) {
    if (!wants(r.user_id, 'notify_cooldown')) continue
    jobs.push({
      userId: r.user_id,
      payload: { title: '🧊 冷静期结束', body: `你之前想买的「${r.item_name}」，还想要吗？` },
    })
  }

  for (const r of subDueRes.data ?? []) {
    if (!wants(r.user_id, 'notify_subscription')) continue
    jobs.push({
      userId: r.user_id,
      payload: { title: '💳 订阅提醒', body: `${r.name} 将在 3 天后扣款 ${yuan(r.amount)}` },
    })
  }

  for (const r of expiryRes.data ?? []) {
    if (!wants(r.user_id, 'notify_expiry')) continue
    const days = daysBetween(todayStr, r.expiry_date)
    const name = r.description || r.category || '某样东西'
    jobs.push({
      userId: r.user_id,
      payload: { title: '⏰ 保质期提醒', body: `${name} 还有 ${days} 天到期，记得用` },
    })
  }

  // ── send ──
  let sent = 0
  let failed = 0
  const staleEndpoints: string[] = []

  for (const job of jobs) {
    const subs = subsByUser.get(job.userId) ?? []
    for (const s of subs) {
      try {
        // deno-lint-ignore no-explicit-any
        await webpush.sendNotification(s.subscription as any, JSON.stringify(job.payload))
        sent++
      } catch (err) {
        failed++
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) staleEndpoints.push(s.endpoint)
      }
    }
  }

  // ── prune dead subscriptions ──
  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return json({ ok: true, jobs: jobs.length, sent, failed, pruned: staleEndpoints.length })
})

function daysBetween(fromStr: string, toStr: string): number {
  const a = new Date(`${fromStr}T00:00:00Z`).getTime()
  const b = new Date(`${toStr}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

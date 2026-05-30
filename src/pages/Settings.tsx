import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsStore, DEFAULT_MODELS } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { usePrinciplesStore } from '@/store/principles'
import { AchievementsSection } from '@/components/achievements/AchievementsSection'
import { THEME_LABELS, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { AIProvider } from '@/lib/ai/types'

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'qwen',   label: '通义千问' },
  { value: 'gpt',    label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
]

export function Settings() {
  const store = useSettingsStore()
  const [provider, setProvider] = useState<AIProvider>(store.aiProvider)
  const [model,    setModel]    = useState(store.aiModel)
  const [apiKey,   setApiKey]   = useState(store.aiApiKey)
  const [cooldown, setCooldown] = useState(String(store.cooldownHours))
  const [timer,    setTimer]    = useState(String(store.timerMinutes))
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    if (!store.loaded) return
    setProvider(store.aiProvider); setModel(store.aiModel)
    setApiKey(store.aiApiKey); setCooldown(String(store.cooldownHours))
    setTimer(String(store.timerMinutes))
  }, [store.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProviderChange(p: AIProvider) { setProvider(p); setModel(DEFAULT_MODELS[p]) }

  async function handleSave() {
    setSaving(true)
    await store.update({
      aiProvider: provider, aiModel: model, aiApiKey: apiKey,
      cooldownHours: Number(cooldown) || 72, timerMinutes: Number(timer) || 15,
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-5 pt-6 w-full max-w-[640px] mx-auto px-6">
      <h1 className="text-base font-medium text-ink">设置</h1>

      {/* ── 我的消费观 entry (bug10): aggregates 消费原则 / 代价视角 / 预算 ── */}
      <ConsumptionViewEntry />

      {/* ── Theme ── */}
      <Card>
        <CardHeader><CardTitle>主题</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => {
              const info = THEME_LABELS[t]
              return (
                <button
                  key={t}
                  onClick={() => void store.update({ theme: t })}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-2 rounded-xl border-theme p-3 transition-colors',
                    store.theme === t ? 'bg-accent text-on-accent' : 'bg-card-alt text-ink-2 hover:text-ink',
                  )}
                >
                  <span
                    className="h-5 w-5 rounded-full border-theme"
                    style={{ backgroundColor: info.preview }}
                  />
                  <span className="text-[13px] font-medium">{info.label}</span>
                  <span className={cn('text-[11px]', store.theme === t ? 'text-on-accent opacity-70' : 'text-ink-4')}>
                    {info.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── AI Config ── */}
      <Card>
        <CardHeader><CardTitle>AI 配置</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">服务商</label>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map((p) => (
                <button key={p.value} onClick={() => handleProviderChange(p.value)}
                  className={cn('rounded-lg border-theme px-3 py-1.5 text-[13px] font-medium transition-colors',
                    provider === p.value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:bg-card-alt hover:text-ink-2'
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">模型</label>
            {/* autoComplete off + a non-email name so the browser never saves this
                value (e.g. "qwen-vl-plus") and later autofills it into the login
                email field. */}
            <Input name="ai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} autoComplete="off" />
          </div>
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">API Key</label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
          </div>
          <p className="text-[13px] leading-relaxed text-ink-4">{PROVIDER_HINTS[provider]}</p>
        </CardContent>
      </Card>

      {/* ── Cooldown ── */}
      <Card>
        <CardHeader><CardTitle>冷静期</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="w-24" min={1} max={168} />
            <span className="text-[15px] text-ink-3">小时（默认 72h）</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Execution timer ── */}
      <Card>
        <CardHeader><CardTitle>默认计时时长</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input type="number" value={timer} onChange={(e) => setTimer(e.target.value)} className="w-24" min={1} max={120} />
            <span className="text-[15px] text-ink-3">分钟（执行层下单前的强制冷静计时，默认 15min）</span>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
      </Button>

      <NotificationSettings />

      <AchievementsSection />

      <AccountCard />
    </div>
  )
}

/** Signed-in account + sign-out (or, in 游客模式, the register-to-save entry).
 *  signOut purges local stores and reloads to the login gate; exitGuestMode
 *  discards local guest data and drops to the 注册 tab (see store/auth). */
function AccountCard() {
  const isGuest = useAuthStore((s) => s.status === 'guest')
  const email = useAuthStore((s) => s.email)
  const signOut = useAuthStore((s) => s.signOut)
  const exitGuest = useAuthStore((s) => s.exitGuestMode)
  const [busy, setBusy] = useState(false)

  if (isGuest) {
    return (
      <Card>
        <CardHeader><CardTitle>账号</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-3">
            你正在使用游客模式，数据仅保存在本机。注册账号可云端保存、多设备同步。
            <span className="text-ink-4">（注册会清空当前本地数据，不做迁移）</span>
          </p>
          <Button variant="outline" onClick={exitGuest}>注册账号保存数据</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>账号</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {email && <p className="text-[13px] text-ink-3">当前登录：<span className="text-ink-2">{email}</span></p>}
        <Button
          variant="outline"
          onClick={() => { setBusy(true); void signOut() }}
          disabled={busy}
        >
          {busy ? '退出中…' : '退出登录'}
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * 通知设置 (PWA 推送). Three independent toggles → user_settings.notify_*; the
 * send-reminders Edge Function skips whichever type is off. Each toggle saves
 * immediately. 游客模式下没有服务端推送，仅作本地开关展示。
 */
function NotificationSettings() {
  const { notifyCooldown, notifySubscription, notifyExpiry, update } = useSettingsStore()
  const isGuest = useAuthStore((s) => s.status === 'guest')

  const rows: { label: string; desc: string; value: boolean; key: 'notifyCooldown' | 'notifySubscription' | 'notifyExpiry' }[] = [
    { label: '冷静期到期提醒', desc: '冷静期结束当天提醒你再决定一次', value: notifyCooldown, key: 'notifyCooldown' },
    { label: '订阅扣款提醒',   desc: '订阅扣款前 3 天提醒', value: notifySubscription, key: 'notifySubscription' },
    { label: '保质期提醒',     desc: '临期 7 天内提醒你尽快用掉', value: notifyExpiry, key: 'notifyExpiry' },
  ]

  return (
    <Card>
      <CardHeader><CardTitle>通知</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 py-2.5 border-t-theme first:border-t-0">
            <div className="min-w-0">
              <p className="text-[15px] text-ink">{r.label}</p>
              <p className="mt-0.5 text-[13px] text-ink-4">{r.desc}</p>
            </div>
            <Toggle checked={r.value} onChange={(v) => void update({ [r.key]: v })} />
          </div>
        ))}
        <p className="mt-2 text-[12px] leading-relaxed text-ink-4">
          {isGuest
            ? '游客模式仅本地提醒；注册账号后可接收服务端定时推送。'
            : '需在浏览器/系统里允许通知权限。每天早 8 点检查并推送。'}
        </p>
      </CardContent>
    </Card>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-card-alt border-theme',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

const PROVIDER_HINTS: Record<AIProvider, string> = {
  qwen:   '通义千问 dashscope，默认 qwen-vl-plus，支持图片解析，价格最低。',
  gpt:    'OpenAI，默认 gpt-4o，支持图片。',
  claude: 'Anthropic Claude，默认 claude-sonnet-4-6，支持图片。',
  gemini: 'Google Gemini，默认 gemini-2.0-flash，支持图片。',
}

/**
 * Settings card that opens 我的消费观 (bug4 + bug10). It surfaces a summary of the
 * already-saved values (identity / 月收入 / 原则条数) so this place reads as a
 * status-plus-edit entry rather than a duplicate form.
 */
function ConsumptionViewEntry() {
  const navigate = useNavigate()
  const { identity, monthlyIncome } = useSettingsStore()
  const principleCount = usePrinciplesStore((s) => s.items.length)

  const identityLabel = identity === 'student' ? '🎓 学生' : identity === 'worker' ? '💼 工作党' : '未设置'
  const incomeText = identity && monthlyIncome != null
    ? `· ${identity === 'student' ? '月生活费' : '月薪'} ¥${monthlyIncome}`
    : ''

  return (
    <button
      onClick={() => navigate('/consumption')}
      className="w-full rounded-2xl border-theme bg-card p-5 text-left transition-colors hover:bg-card-alt"
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-ink">我的消费观</span>
        <ChevronRight size={16} className="text-ink-4" />
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-4">
        消费原则、代价视角、预算——决定 AI 如何替你权衡每一笔。
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span>代价视角：{identityLabel} {incomeText}</span>
        <span>消费原则：{principleCount} 条</span>
      </div>
    </button>
  )
}

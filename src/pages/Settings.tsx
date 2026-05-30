import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettingsStore, DEFAULT_MODELS } from '@/store/settings'
import { useAuthStore } from '@/store/auth'
import { usePrinciplesStore } from '@/store/principles'
import { SubscriptionManager } from '@/components/subscription/SubscriptionManager'
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
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} />
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

      <AchievementsSection />

      <SubscriptionManager />

      <AccountCard />
    </div>
  )
}

/** Signed-in account + sign-out. signOut purges local stores and reloads to the
 *  login gate (see store/auth). */
function AccountCard() {
  const email = useAuthStore((s) => s.email)
  const signOut = useAuthStore((s) => s.signOut)
  const [busy, setBusy] = useState(false)

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

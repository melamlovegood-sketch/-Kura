import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

type Tab = 'signin' | 'signup'

/**
 * Full-screen email + password auth gate. Shown by App whenever there is no
 * session. Two tabs (登录 / 注册) over one shared form. On success the auth
 * store's onAuthStateChange listener flips the app to the authed tree — a fresh
 * account lands in the cold-start onboarding because its tables are empty.
 */
export function Login() {
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)

  const [tab, setTab]           = useState<Tab>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  function switchTab(next: Tab) {
    setTab(next); setError(null); setNotice(null)
  }

  async function handleSubmit() {
    const e = email.trim()
    if (!e || !password) { setError('请输入邮箱和密码'); return }
    if (tab === 'signup' && password.length < 6) { setError('密码至少 6 位'); return }

    setBusy(true); setError(null); setNotice(null)
    try {
      const res = tab === 'signin'
        ? await signIn(e, password)
        : await signUp(e, password)

      if (res.error) { setError(res.error); return }
      if (res.needsConfirm) {
        // Email confirmation is still ON in the dashboard — no session yet.
        setNotice('注册成功。请在 Supabase 后台关闭邮箱验证（Auth → Email → Confirm email），或查收验证邮件后再登录。')
        return
      }
      // Success → onAuthStateChange takes over and unmounts this screen.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-page px-6">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col gap-7">
          {/* ── Brand ── */}
          <div className="flex flex-col items-center gap-3">
            <SquirrelMark />
            <div className="text-center">
              <p
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
                className="text-[28px] leading-none text-ink"
              >
                KURA
              </p>
              <p className="mt-2 text-[14px] text-ink-3">
                {tab === 'signin' ? '欢迎回来，登录继续' : '创建账号，开始你的消费决策'}
              </p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex rounded-xl bg-card-alt p-1">
            {(['signin', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-[14px] font-medium transition-colors',
                  tab === t ? 'bg-card text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {t === 'signin' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {/* ── Form ── */}
          <form
            className="flex flex-col gap-4"
            onSubmit={(ev) => { ev.preventDefault(); void handleSubmit() }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-ink-3">邮箱</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-ink-3">密码</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                placeholder={tab === 'signup' ? '至少 6 位' : '••••••'}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              />
            </label>

            {error && <p className="text-[13px] leading-relaxed text-red-500">{error}</p>}
            {notice && <p className="text-[13px] leading-relaxed text-amber-700">{notice}</p>}

            <Button type="submit" className="mt-1 w-full" disabled={busy}>
              {busy ? '请稍候…' : tab === 'signin' ? '登录' : '注册'}
            </Button>
          </form>

          <p className="text-center text-[12px] leading-relaxed text-ink-4">
            {tab === 'signin' ? '还没有账号？' : '已有账号？'}
            <button
              onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
              className="ml-1 text-ink-2 underline-offset-2 hover:underline"
            >
              {tab === 'signin' ? '去注册' : '去登录'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Squirrel mark (matches AppLayout/Splash) ─────────────────────────────── */

function SquirrelMark() {
  return (
    <svg width={54} height={59} viewBox="0 0 150 165" fill="none" className="text-ink-2">
      <ellipse cx="62" cy="36" rx="11" ry="13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M51 37 C53 30 71 30 73 37" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M62 23 L62 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M62 18 C62 15 65 13 67 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M103 87 C99 88 93 90 89 91 L88 95 C91 96 95 98 98 105 L91 115 C91 115 95 115 100 115 C104 116 103 122 103 122 H58 C58 122 54 97 74 80 C73 70 74 63 78 59 L78 48 L87 55 C96 54 102 63 103 70 L92 74 L91 81 L99 80 L102 75 C109 77 111 85 103 87 Z M49 122 C38 120 31 114 31 102 C31 88 39 59 16 63 L15 60 C19 51 27 42 40 42 C54 42 61 51 61 68 C61 88 48 89 49 122 Z"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(8,22)"
      />
      <path d="M78 48 C73 43 66 41 64 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

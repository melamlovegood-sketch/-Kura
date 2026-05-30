import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { setGuestModeFlag, clearGuestData, isGuestMode } from '@/lib/guestMode'

/**
 * - loading: resolving the persisted session
 * - authed:  real Supabase session — data lives in the cloud
 * - anon:    no session, not guest → show the Login gate
 * - guest:   本地游客模式 — full app, data lives in localStorage (no account)
 */
type Status = 'loading' | 'authed' | 'anon' | 'guest'

/** Login reads this on mount to open straight on the 注册 tab after an upgrade. */
const REGISTER_INTENT_KEY = 'kura_register_intent'

interface AuthResult {
  error: string | null
  /** signIn only: the account exists but its email was never verified. The UI
   *  should resend the OTP and switch to the verification step. */
  needsVerify?: boolean
}

interface AuthStore {
  status: Status
  userId: string | null
  email: string | null
  /** Wire up the session: read the persisted one, then track future changes. */
  init: () => void
  signIn: (email: string, password: string) => Promise<AuthResult>
  /** Step ①: create the account; Supabase emails a 6-digit OTP (Confirm email ON). */
  signUp: (email: string, password: string) => Promise<AuthResult>
  /** Step ②: exchange the 6-digit code for a live session (auto sign-in). */
  verifyOtp: (email: string, token: string) => Promise<AuthResult>
  /** Resend the signup confirmation email containing a fresh OTP. */
  resendOtp: (email: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  /** Enter 本地游客模式 from the Login screen — no account, data stays local. */
  enterGuestMode: () => void
  /** Leave guest mode to register. Local data is discarded (no migration). */
  exitGuestMode: () => void
}

/** Map raw Supabase auth errors to friendly Chinese copy. */
function mapAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码错误'
  if (m.includes('already registered') || m.includes('already been registered')) return '该邮箱已注册，请直接登录'
  if (m.includes('password should be at least')) return '密码至少 6 位'
  if (m.includes('unable to validate email') || m.includes('invalid format')) return '邮箱格式不正确'
  if (m.includes('email rate limit')) return '操作过于频繁，请稍后再试'
  if (m.includes('token has expired') || m.includes('expired')) return '验证码已过期，请重新发送'
  if (m.includes('invalid') && m.includes('token')) return '验证码错误或已过期'
  if (m.includes('otp') || m.includes('invalid token')) return '验证码错误或已过期'
  return message
}

/** Drop every locally-cached app store so a different account starts clean. */
function clearLocalAppState() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('kura-')) localStorage.removeItem(key)
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'loading',
  userId: null,
  email: null,

  init: () => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        set({ status: 'authed', userId: session.user.id, email: session.user.email ?? null })
      } else if (isGuestMode()) {
        set({ status: 'guest', userId: 'guest', email: null })
      } else {
        set({ status: 'anon', userId: null, email: null })
      }
    })
    // Fires on sign-in / sign-out / token refresh — keeps the gate in sync. A real
    // session always wins (and clears any stale guest flag, e.g. a guest who just
    // upgraded); otherwise fall back to guest mode if its flag is set, else anon.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setGuestModeFlag(false)
        set({ status: 'authed', userId: session.user.id, email: session.user.email ?? null })
      } else if (isGuestMode()) {
        set({ status: 'guest', userId: 'guest', email: null })
      } else {
        set({ status: 'anon', userId: null, email: null })
      }
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (!error) return { error: null }
    // Account exists but the email was never verified (user signed up then closed
    // the app before entering the OTP). Flag it so the UI can resend + verify
    // instead of showing the misleading "邮箱或密码错误".
    const code = (error as { code?: string }).code
    const isUnverified =
      code === 'email_not_confirmed' || error.message.toLowerCase().includes('email not confirmed')
    if (isUnverified) return { error: null, needsVerify: true }
    return { error: mapAuthError(error.message) }
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    if (error) return { error: mapAuthError(error.message) }
    // Confirm email is ON: no session yet. Supabase has emailed a 6-digit OTP;
    // the UI moves to the verifying step and calls verifyOtp next.
    return { error: null }
  },

  verifyOtp: async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    })
    if (error) return { error: mapAuthError(error.message) }
    // Success → onAuthStateChange returns a session and flips status → authed.
    return { error: null }
  },

  resendOtp: async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    })
    return { error: error ? mapAuthError(error.message) : null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    // Persisted zustand stores (kura-*) hold the previous user's data — purge
    // them and hard-reload so the next account boots from a clean slate.
    clearLocalAppState()
    window.location.reload()
  },

  enterGuestMode: () => {
    // Start from a clean slate so a previous account's cached stores don't leak
    // into the guest session, then flip the flag and mount the app.
    clearLocalAppState()
    setGuestModeFlag(true)
    set({ status: 'guest', userId: 'guest', email: null })
  },

  exitGuestMode: () => {
    // Upgrade to a real account: discard local guest data (no migration), mark the
    // intent to land on the 注册 tab, then hard-reload into the Login gate.
    clearGuestData()
    setGuestModeFlag(false)
    localStorage.setItem(REGISTER_INTENT_KEY, '1')
    window.location.reload()
  },
}))

/** Login uses this to open on the 注册 tab right after a guest upgrade (one-shot). */
export function takeRegisterIntent(): boolean {
  const intent = localStorage.getItem(REGISTER_INTENT_KEY) === '1'
  if (intent) localStorage.removeItem(REGISTER_INTENT_KEY)
  return intent
}

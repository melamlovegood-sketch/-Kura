import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'authed' | 'guest'

interface AuthResult {
  error: string | null
  /** signUp only: true when the account was created but no session was returned
   *  (email confirmation is still ON in the Supabase dashboard). */
  needsConfirm?: boolean
}

interface AuthStore {
  status: Status
  userId: string | null
  email: string | null
  /** Wire up the session: read the persisted one, then track future changes. */
  init: () => void
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

/** Map raw Supabase auth errors to friendly Chinese copy. */
function mapAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码错误'
  if (m.includes('already registered') || m.includes('already been registered')) return '该邮箱已注册，请直接登录'
  if (m.includes('password should be at least')) return '密码至少 6 位'
  if (m.includes('unable to validate email') || m.includes('invalid format')) return '邮箱格式不正确'
  if (m.includes('email rate limit')) return '操作过于频繁，请稍后再试'
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
      set({
        status: session ? 'authed' : 'guest',
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      })
    })
    // Fires on sign-in / sign-out / token refresh — keeps the gate in sync.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        status: session ? 'authed' : 'guest',
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return { error: error ? mapAuthError(error.message) : null }
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    if (error) return { error: mapAuthError(error.message) }
    // With email confirmation OFF, signUp returns a live session and the
    // onAuthStateChange listener flips status → authed. If it's still ON there's
    // no session yet; tell the caller so it can show the right message.
    return { error: null, needsConfirm: !data.session }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    // Persisted zustand stores (kura-*) hold the previous user's data — purge
    // them and hard-reload so the next account boots from a clean slate.
    clearLocalAppState()
    window.location.reload()
  },
}))

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// Multi-user app (邮箱 + 密码 via Supabase Auth). The client MUST persist the
// session: once a user signs in, supabase-js stores the JWT in localStorage and
// sends it as the `Authorization: Bearer` header on every REST call, which is
// exactly what the RLS policies (auth.uid() = user_id) rely on to scope rows to
// the logged-in user. autoRefreshToken keeps that JWT alive across reloads.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

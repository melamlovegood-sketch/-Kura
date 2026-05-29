import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// This app has no user login — every request authenticates with the anon key.
// supabase-js defaults to persistSession:true, which means a *stale* session token
// left in localStorage (e.g. from an earlier auth experiment) gets sent as the
// `Authorization: Bearer` header instead of the anon key, yielding a 401 on
// otherwise-public tables (e.g. /rest/v1/wish_pools). Disabling session
// persistence/refresh forces the client to always carry the anon key, which the
// REST endpoint accepts (verified: anon key → 200 on every table).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

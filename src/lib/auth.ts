import { supabase } from './supabase'
import { isGuestMode } from './guestMode'

/**
 * The id of the currently signed-in user, for stamping `user_id` on every write.
 *
 * Reads from the persisted session (localStorage) — no network round-trip — so
 * it's cheap to call before each insert/upsert. In guest mode there is no session
 * and writes go to the localStorage shim, so we stamp a constant 'guest' owner.
 * Throws if there is neither a session nor guest mode, which should never happen
 * from inside the app (every page is behind the auth gate), but fails loud rather
 * than silently writing an unowned row that RLS would reject anyway.
 */
export async function getCurrentUserId(): Promise<string> {
  if (isGuestMode()) return 'guest'
  const { data: { session } } = await supabase.auth.getSession()
  const id = session?.user?.id
  if (!id) throw new Error('未登录，无法写入数据')
  return id
}

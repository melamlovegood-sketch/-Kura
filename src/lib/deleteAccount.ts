/**
 * 账号注销 — permanent deletion of all of the signed-in user's data.
 *
 * Without a service-role key the client cannot remove the `auth.users` row itself,
 * but it CAN delete every owned row: each app table has a `user_id` column under an
 * RLS "user_own" policy, so a scoped DELETE wipes exactly this user's data and
 * nothing else. We then sign out and reload to the login gate. (Re-registering the
 * same email lands a clean, empty account.)
 */
import { supabase } from '@/lib/supabase'
import { clearGuestData, setGuestModeFlag } from '@/lib/guestMode'

/** Every table that carries a user_id (see migration 0009). Children first so a
 *  FK to a parent never blocks a delete, though RLS + cascade would also cover it. */
const USER_TABLES = [
  'review_results', 'review_tasks',
  'price_records', 'price_tracks',
  'savings_records', 'wish_pools', 'wishlist_items',
  'impulse_records', 'transactions', 'execution_sessions',
  'brand_library', 'sop_rules', 'subscriptions',
  'achievements', 'user_streak', 'personal_principles',
  'monthly_budgets', 'monthly_stories', 'push_subscriptions',
  'user_settings',
] as const

/** Drop every locally-cached app store (kura-*) so the next account boots clean. */
function clearLocalAppState(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('kura-')) localStorage.removeItem(key)
  }
}

/**
 * Delete the signed-in user's data across all tables, then sign out and hard-reload
 * to the login gate. Throws if any table delete fails (the caller surfaces it and
 * does NOT sign out, so the user can retry without a half-deleted account).
 */
export async function deleteAccount(userId: string): Promise<void> {
  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    // A table that doesn't exist in this deployment is fine to skip; anything else
    // (permission, network) aborts so we don't sign out on a partial delete.
    if (error && !/does not exist|relation .* does not exist/i.test(error.message)) {
      throw new Error(`删除「${table}」失败：${error.message}`)
    }
  }

  await supabase.auth.signOut()
  clearLocalAppState()
  window.location.reload()
}

/**
 * Guest-mode注销: no account, no email confirmation — just discard all local
 * kura_guest_* data and the cached stores, then reload to the login gate.
 */
export function deleteGuestAccount(): void {
  clearGuestData()
  setGuestModeFlag(false)
  window.location.reload()
}

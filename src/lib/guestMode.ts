/**
 * 本地游客模式 (guest mode). The user can explore the whole app without an account:
 * every read/write goes to localStorage through the `db` shim (see lib/db.ts)
 * instead of Supabase, and AI features still work with the user's own API key.
 *
 * This module holds ONLY the flag + the discard-on-upgrade cleanup, with no heavy
 * imports, so it's safe to pull into the auth layer and UI without dragging in the
 * Supabase client.
 */

/** localStorage flag — presence (= 'true') means we're in guest mode. */
export const GUEST_MODE_KEY = 'kura_guest_mode'
/** Every shim table is stored under `kura_guest_<table>`. */
export const GUEST_TABLE_PREFIX = 'kura_guest_'

export function isGuestMode(): boolean {
  try {
    return localStorage.getItem(GUEST_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setGuestModeFlag(on: boolean): void {
  if (on) localStorage.setItem(GUEST_MODE_KEY, 'true')
  else localStorage.removeItem(GUEST_MODE_KEY)
}

/**
 * Wipe all guest-mode data. Called when a guest upgrades to a real account: the
 * local data is discarded and never migrated (per design), so registration starts
 * from a clean slate. Removes both the shim tables (`kura_guest_*`) and the
 * persisted zustand app caches (`kura-*`, e.g. onboarding-done / theme / store
 * snapshots) so the fresh account boots into onboarding.
 */
export function clearGuestData(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(GUEST_TABLE_PREFIX) || key.startsWith('kura-')) {
      localStorage.removeItem(key)
    }
  }
}

/**
 * The 5 default SOP rules that earlier builds seeded into a guest's local
 * `sop_rules` table. They were placeholder copy, not real user content (see
 * migration 0013 for the cloud-side delete), so on startup we strip any of them
 * that are still sitting in localStorage. User-authored rules are untouched —
 * only rows whose title matches a default are removed.
 */
const DEFAULT_SOP_TITLES = ['裤子', '上衣', '搜索决策', '品牌优先', '计时器']

export function clearDefaultGuestSOP(): void {
  try {
    const raw = localStorage.getItem(GUEST_TABLE_PREFIX + 'sop_rules')
    if (!raw) return
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) return
    const kept = rows.filter((r) => !DEFAULT_SOP_TITLES.includes((r as { title?: string })?.title ?? ''))
    if (kept.length !== rows.length) {
      localStorage.setItem(GUEST_TABLE_PREFIX + 'sop_rules', JSON.stringify(kept))
    }
  } catch {
    // Malformed cache — leave it; the app will overwrite on next write.
  }
}

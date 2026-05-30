/**
 * PWA 推送通知 — client side. Asks for the Notification permission, subscribes the
 * browser to Web Push with the VAPID public key, and stores the subscription in
 * Supabase (push_subscriptions) so the send-reminders Edge Function can reach this
 * device. 游客模式 only gets local reminders (no server subscription) — there is no
 * account row to attach a subscription to.
 */
import { supabase } from '@/lib/supabase'
import { isGuestMode } from '@/lib/guestMode'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Web Push wants the VAPID key as bytes, not the URL-safe base64 string. */
function urlBase64ToBytes(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Ask for the Notification permission. Returns the resulting permission state. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  // Already decided (granted/denied) → don't re-prompt.
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Subscribe this browser to Web Push and persist the subscription. Returns true on
 * success. Silently returns false for guests, when the VAPID key / Push API is
 * unavailable, or when permission isn't granted.
 */
export async function subscribePush(): Promise<boolean> {
  if (isGuestMode()) return false // local-only reminders for guests
  if (!VAPID_PUBLIC_KEY) return false
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

  const reg = await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY),
    })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // endpoint is globally unique → upsert overwrites a stale row for this device
  // (e.g. the browser rotated the subscription) instead of piling up duplicates.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: sub.endpoint, subscription: sub.toJSON() },
      { onConflict: 'endpoint' },
    )
  return !error
}

/**
 * App-startup entry: ask permission, then subscribe. Any rejection (denied
 * permission, no key, unsupported browser) is swallowed so startup never breaks.
 */
export async function initPushNotifications(): Promise<void> {
  try {
    const perm = await requestPermission()
    if (perm !== 'granted') return // user declined → silently skip
    await subscribePush()
  } catch {
    // Never let push setup interfere with app boot.
  }
}

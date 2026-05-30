/* eslint-disable */
/**
 * Web Push handlers, importScripts'd into the workbox-generated service worker
 * (see vite.config.ts → workbox.importScripts). The send-reminders Edge Function
 * posts a JSON body of { title, body } to the user's push endpoint; this renders
 * it as a system notification, and a click focuses (or opens) the app.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    data = { title: 'Kura', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Kura'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})

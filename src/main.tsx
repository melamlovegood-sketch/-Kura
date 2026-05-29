import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'

// Service worker: registerType 'autoUpdate' makes the new SW take over and
// reload the page automatically once an update is detected. The piece the
// default registration misses for installed PWAs is *detecting* the update —
// a home-screen app is usually resumed from background, not cold-started, so
// it never re-checks. Poll on visibility/focus (and hourly) so a freshly
// deployed version is picked up the next time the user opens the app.
// localStorage (where the Zustand `persist` stores live) is untouched by this,
// so data survives the update + reload.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    const update = () => { void registration.update().catch(() => {}) }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') update()
    })
    window.addEventListener('focus', update)
    setInterval(update, 60 * 60 * 1000) // hourly fallback while kept open
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

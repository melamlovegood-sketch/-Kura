import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Home } from '@/pages/Home'
import { Wishlist } from '@/pages/Wishlist'
import { Execution } from '@/pages/Execution'
import { Review } from '@/pages/Review'
import { Settings } from '@/pages/Settings'
import { ConsumptionView } from '@/pages/ConsumptionView'
import { SplashScreen } from '@/components/SplashScreen'
import { Onboarding } from '@/components/onboarding/Onboarding'
import { Login } from '@/components/auth/Login'
import { useAuthStore } from '@/store/auth'
import { useSettingsStore } from '@/store/settings'
import { usePrinciplesStore } from '@/store/principles'
import { useImpulseStore } from '@/store/impulse'
import { useWishlistStore } from '@/store/wishlist'
import { useWishPoolStore } from '@/store/wishpool'
import { useExecutionStore } from '@/store/execution'
import { useReviewStore } from '@/store/review'
import { useExpiryStore } from '@/store/expiry'
import { useSubscriptionStore } from '@/store/subscriptions'
import { useAchievementsStore } from '@/store/achievements'
import { usePersonaStore } from '@/store/persona'

export function App() {
  const [showSplash, setShowSplash] = useState(true)

  const authStatus = useAuthStore((s) => s.status)
  const userId     = useAuthStore((s) => s.userId)
  const initAuth   = useAuthStore((s) => s.init)

  const loadSettings   = useSettingsStore((s) => s.load)
  const loadPrinciples = usePrinciplesStore((s) => s.load)
  const loadImpulse    = useImpulseStore ((s) => s.load)
  const loadWishlist   = useWishlistStore ((s) => s.load)
  const loadWishPool   = useWishPoolStore ((s) => s.load)
  const loadExecution  = useExecutionStore((s) => s.load)
  const loadReview     = useReviewStore   ((s) => s.load)
  const loadRegret     = useReviewStore   ((s) => s.loadRegret)
  const loadStories    = useReviewStore   ((s) => s.loadStories)
  const ensureLastMonthStory = useReviewStore((s) => s.ensureLastMonthStory)
  const loadExpiry     = useExpiryStore   ((s) => s.load)
  const loadSubs       = useSubscriptionStore((s) => s.load)
  const generateSubTx  = useSubscriptionStore((s) => s.generateDueTransactions)
  const loadAchievements = useAchievementsStore((s) => s.load)
  const recomputeAch     = useAchievementsStore((s) => s.recompute)
  const generatePersona  = usePersonaStore((s) => s.generate)

  // Boot the auth listener once.
  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    // Only hydrate the app's data once a user is signed in — every query below
    // runs under RLS as that user. Keyed on userId so logging in as a different
    // account re-loads everything for the new owner.
    if (authStatus !== 'authed' || !userId) return
    // Settings carry the AI adapter; once loaded, auto-generate last month's story
    // (no-op if it already exists or there's no API key).
    void loadSettings().then(() => ensureLastMonthStory())
    void loadStories()
    void loadPrinciples()
    void loadImpulse()
    void loadWishlist()
    void loadWishPool()
    void loadExecution()
    void loadReview()
    void loadRegret()
    void loadExpiry()
    // Load subscriptions, then auto-record any charges whose billing day has passed.
    void loadSubs().then(() => generateSubTx())
    // Load cached achievements/streak, then refresh from the DB.
    void loadAchievements().then(() => recomputeAch())
    // Build last month's spending-persona report.
    void generatePersona()
  }, [authStatus, userId, loadSettings, loadPrinciples, loadImpulse, loadWishlist, loadWishPool, loadExecution, loadReview, loadRegret, loadStories, ensureLastMonthStory, loadExpiry, loadSubs, generateSubTx, loadAchievements, recomputeAch, generatePersona])

  // Splash plays while it animates AND until the auth state resolves, so we never
  // flash the login screen before knowing whether a session exists.
  if (showSplash || authStatus === 'loading') {
    return <SplashScreen onDone={() => setShowSplash(false)} />
  }

  // No session → email/password gate. Nothing else mounts (route protection).
  if (authStatus === 'guest') {
    return <Login />
  }

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/wishlist"  element={<Wishlist />} />
          <Route path="/execution" element={<Execution />} />
          <Route path="/review"    element={<Review />} />
          <Route path="/settings"  element={<Settings />} />
          <Route path="/consumption" element={<ConsumptionView />} />
        </Routes>
      </AppLayout>
      <Onboarding />
    </BrowserRouter>
  )
}

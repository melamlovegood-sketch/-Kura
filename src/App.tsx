import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Home } from '@/pages/Home'
import { Wishlist } from '@/pages/Wishlist'
import { Execution } from '@/pages/Execution'
import { Settings } from '@/pages/Settings'
import { SplashScreen } from '@/components/SplashScreen'
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

  const loadSettings   = useSettingsStore((s) => s.load)
  const loadPrinciples = usePrinciplesStore((s) => s.load)
  const loadImpulse    = useImpulseStore ((s) => s.load)
  const loadWishlist   = useWishlistStore ((s) => s.load)
  const loadWishPool   = useWishPoolStore ((s) => s.load)
  const loadExecution  = useExecutionStore((s) => s.load)
  const loadReview     = useReviewStore   ((s) => s.load)
  const loadRegret     = useReviewStore   ((s) => s.loadRegret)
  const loadExpiry     = useExpiryStore   ((s) => s.load)
  const loadSubs       = useSubscriptionStore((s) => s.load)
  const generateSubTx  = useSubscriptionStore((s) => s.generateDueTransactions)
  const loadAchievements = useAchievementsStore((s) => s.load)
  const recomputeAch     = useAchievementsStore((s) => s.recompute)
  const generatePersona  = usePersonaStore((s) => s.generate)

  useEffect(() => {
    void loadSettings()
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
  }, [loadSettings, loadPrinciples, loadImpulse, loadWishlist, loadWishPool, loadExecution, loadReview, loadRegret, loadExpiry, loadSubs, generateSubTx, loadAchievements, recomputeAch, generatePersona])

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />
  }

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/wishlist"  element={<Wishlist />} />
          <Route path="/execution" element={<Execution />} />
          <Route path="/settings"  element={<Settings />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}

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

export function App() {
  const [showSplash, setShowSplash] = useState(true)

  const loadSettings   = useSettingsStore((s) => s.load)
  const loadPrinciples = usePrinciplesStore((s) => s.load)
  const loadImpulse    = useImpulseStore ((s) => s.load)
  const loadWishlist   = useWishlistStore ((s) => s.load)
  const loadWishPool   = useWishPoolStore ((s) => s.load)
  const loadExecution  = useExecutionStore((s) => s.load)
  const loadReview     = useReviewStore   ((s) => s.load)

  useEffect(() => {
    void loadSettings()
    void loadPrinciples()
    void loadImpulse()
    void loadWishlist()
    void loadWishPool()
    void loadExecution()
    void loadReview()
  }, [loadSettings, loadPrinciples, loadImpulse, loadWishlist, loadWishPool, loadExecution, loadReview])

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

import { Link, useLocation } from 'react-router-dom'
import { Home, ListTodo, ShoppingBag, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

/** Max content width — matches a phone screen on desktop */
const COL = 'w-full max-w-[480px] mx-auto'

export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="flex h-full flex-col bg-page">
      {/* Scrollable content — centered on desktop, full-width on mobile */}
      <main className="flex-1 overflow-y-auto pb-20 flex justify-center">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>

      {/* Bottom nav — centered column on desktop, full-width on mobile */}
      <nav className={cn(
        'fixed bottom-0 left-1/2 z-40 -translate-x-1/2 border-t-theme bg-card',
        COL,
      )}>
        <div className="flex">
          <NavItem to="/"          icon={<Home size={18} />}        label="主页" active={pathname === '/'} />
          <NavItem to="/wishlist"  icon={<ListTodo size={18} />}    label="清单" active={pathname === '/wishlist'} />
          <NavItem to="/execution" icon={<ShoppingBag size={18} />} label="执行" active={pathname === '/execution'} />
          <NavItem to="/settings"  icon={<Settings size={18} />}    label="设置" active={pathname === '/settings'} />
        </div>
      </nav>
    </div>
  )
}

function NavItem({ to, icon, label, active }: {
  to: string; icon: ReactNode; label: string; active: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium tracking-wide transition-colors',
        active ? 'text-ink' : 'text-ink-4 hover:text-ink-3',
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}

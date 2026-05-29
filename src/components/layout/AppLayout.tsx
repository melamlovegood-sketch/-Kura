import { Link, useLocation } from 'react-router-dom'
import { Home, ListTodo, ShoppingBag, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

const NAV_ITEMS = [
  { to: '/',          Icon: Home,        label: '主页' },
  { to: '/wishlist',  Icon: ListTodo,    label: '清单' },
  { to: '/execution', Icon: ShoppingBag, label: '执行' },
  { to: '/settings',  Icon: Settings,    label: '设置' },
] as const

export function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="flex h-full">
      {/* ── Desktop sidebar (md+) ────────────────────────────────── */}
      <aside className="hidden md:flex w-[220px] shrink-0 flex-col bg-card border-r-theme">
        {/* Wordmark */}
        <div className="flex flex-col items-center px-5 pt-8 pb-5 gap-2">
          <SquirrelMark />
          <span
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: 22,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            KURA
          </span>
        </div>
        <div className="border-b-theme mx-5 mb-3" />
        {/* Vertical nav */}
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV_ITEMS.map(({ to, Icon, label }) => (
            <SideNavItem
              key={to}
              to={to}
              icon={<Icon size={17} />}
              label={label}
              active={pathname === to}
            />
          ))}
        </nav>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-page pb-20 md:pb-0 flex justify-center">
        <div className="w-full max-w-[480px] md:max-w-[600px]">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav (< md) ─────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t-theme bg-card md:hidden">
        <div className="flex max-w-[480px] mx-auto">
          {NAV_ITEMS.map(({ to, Icon, label }) => (
            <BottomNavItem
              key={to}
              to={to}
              icon={<Icon size={18} />}
              label={label}
              active={pathname === to}
            />
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ── Sidebar nav item ─────────────────────────────────────────────────── */

function SideNavItem({ to, icon, label, active }: {
  to: string; icon: ReactNode; label: string; active: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'text-ink bg-card-alt'
          : 'text-ink-3 hover:text-ink-2 hover:bg-card-alt',
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}

/* ── Bottom nav item ──────────────────────────────────────────────────── */

function BottomNavItem({ to, icon, label, active }: {
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

/* ── Squirrel + acorn mark for sidebar ───────────────────────────────── */

function SquirrelMark() {
  return (
    <svg
      width="54"
      height="59"
      viewBox="0 0 150 165"
      fill="none"
      className="text-ink-2"
    >
      {/* acorn */}
      <ellipse cx="62" cy="36" rx="11" ry="13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M51 37 C53 30 71 30 73 37" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M62 23 L62 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M62 18 C62 15 65 13 67 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* squirrel body */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M103 87 C99 88 93 90 89 91 L88 95 C91 96 95 98 98 105 L91 115 C91 115 95 115 100 115 C104 116 103 122 103 122 H58 C58 122 54 97 74 80 C73 70 74 63 78 59 L78 48 L87 55 C96 54 102 63 103 70 L92 74 L91 81 L99 80 L102 75 C109 77 111 85 103 87 Z M49 122 C38 120 31 114 31 102 C31 88 39 59 16 63 L15 60 C19 51 27 42 40 42 C54 42 61 51 61 68 C61 88 48 89 49 122 Z"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(8,22)"
      />
      <path d="M78 48 C73 43 66 41 64 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

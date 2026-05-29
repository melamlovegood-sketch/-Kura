import { useEffect } from 'react'
import { useWishPoolStore, type Milestone } from '@/store/wishpool'
import { cn } from '@/lib/utils'

/**
 * Full-screen squirrel celebration shown when the wish pool crosses a 25/50/75/
 * 100% milestone (SPEC §7). Driven by wishpool.milestone; auto-dismisses, and a
 * tap closes it early. Each milestone fires only once (tracked in the store).
 */
const SCENES: Record<Milestone, { caption: string; bodyAnim: string }> = {
  25:  { caption: '松鼠找到了第一颗栗子', bodyAnim: 'milestone-sq-jump' },
  50:  { caption: '松鼠抱着栗子跑起来了', bodyAnim: 'milestone-sq-run' },
  75:  { caption: '松鼠把栗子藏进了树洞', bodyAnim: 'milestone-sq-place' },
  100: { caption: '树洞满了 — 目标达成！', bodyAnim: 'milestone-sq-spin' },
}

// Pre-computed confetti pieces (only for the 100% scene). Static so the layout
// is deterministic across renders.
const CONFETTI = [
  { left: '12%', delay: '0ms',   color: '#E8B84B', dur: '1.5s' },
  { left: '24%', delay: '180ms', color: '#C97B5A', dur: '1.7s' },
  { left: '38%', delay: '60ms',  color: '#7FA67F', dur: '1.4s' },
  { left: '50%', delay: '240ms', color: '#E8B84B', dur: '1.8s' },
  { left: '62%', delay: '120ms', color: '#C97B5A', dur: '1.5s' },
  { left: '76%', delay: '300ms', color: '#7FA67F', dur: '1.6s' },
  { left: '88%', delay: '40ms',  color: '#E8B84B', dur: '1.7s' },
  { left: '18%', delay: '360ms', color: '#7FA67F', dur: '1.5s' },
  { left: '44%', delay: '420ms', color: '#C97B5A', dur: '1.6s' },
  { left: '70%', delay: '200ms', color: '#E8B84B', dur: '1.4s' },
]

export function MilestoneAnimation() {
  const { milestone, clearMilestone } = useWishPoolStore()

  useEffect(() => {
    if (milestone == null) return
    const t = setTimeout(clearMilestone, 2900)
    return () => clearTimeout(t)
  }, [milestone, clearMilestone])

  if (milestone == null) return null
  const scene = SCENES[milestone]

  return (
    <div
      onClick={clearMilestone}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'rgba(245,240,232,0.86)', animation: 'milestone-backdrop-in 0.25s ease-out both' }}
    >
      {milestone === 100 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="absolute top-0 block h-2 w-1.5 rounded-[1px]"
              style={{
                left: c.left,
                backgroundColor: c.color,
                animation: `milestone-confetti-fall ${c.dur} ease-in ${c.delay} infinite`,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ animation: 'milestone-pop-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both' }} className="flex flex-col items-center">
        <svg width="132" height="145" viewBox="0 0 150 165" fill="none" style={{ overflow: 'visible' }}>
          {/* acorn — stays still while the body animates */}
          <g>
            <ellipse cx="62" cy="36" rx="11" ry="13" stroke="#C97B5A" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M51 37 C53 30 71 30 73 37" stroke="#C97B5A" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M62 23 L62 18" stroke="#C97B5A" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M62 18 C62 15 65 13 67 15" stroke="#C97B5A" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g
            style={{
              transformBox: 'fill-box',
              transformOrigin: '50% 80%',
              animation: `${scene.bodyAnim} ${milestone === 100 ? '1.1s' : '0.9s'} ease-in-out ${milestone === 100 ? 'infinite' : '0.15s both'}`,
            }}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M103 87 C99 88 93 90 89 91 L88 95 C91 96 95 98 98 105 L91 115 C91 115 95 115 100 115 C104 116 103 122 103 122 H58 C58 122 54 97 74 80 C73 70 74 63 78 59 L78 48 L87 55 C96 54 102 63 103 70 L92 74 L91 81 L99 80 L102 75 C109 77 111 85 103 87 Z M49 122 C38 120 31 114 31 102 C31 88 39 59 16 63 L15 60 C19 51 27 42 40 42 C54 42 61 51 61 68 C61 88 48 89 49 122 Z"
              stroke="#5C5448"
              strokeWidth="3.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              transform="translate(8,22)"
            />
            <path d="M78 48 C73 43 66 41 64 44" stroke="#5C5448" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>

        <div className={cn('mt-6 font-serif text-[28px] leading-none', milestone === 100 ? 'text-amber-600' : 'text-ink')}>
          {milestone}%
        </div>
        <p className="mt-2.5 text-[14px] text-ink-3">{scene.caption}</p>
        <p className="mt-5 text-[11px] uppercase tracking-[0.14em] text-ink-4">轻触关闭</p>
      </div>
    </div>
  )
}

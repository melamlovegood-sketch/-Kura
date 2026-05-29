import { useEffect, useState } from 'react'

interface Props {
  onDone: () => void
}

export function SplashScreen({ onDone }: Props) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2500)
    const t2 = setTimeout(onDone, 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#F5F0E8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.3s ease-out',
        opacity: fading ? 0 : 1,
        overflow: 'hidden',
      }}
    >
      {/* Squirrel + acorn illustration */}
      <svg
        width="150"
        height="165"
        viewBox="0 0 150 165"
        fill="none"
        style={{ overflow: 'visible' }}
      >
        <g className="splash-acorn">
          <ellipse cx="62" cy="36" rx="11" ry="13" fill="none" stroke="#5C5448" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M51 37 C53 30 71 30 73 37" fill="none" stroke="#5C5448" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M62 23 L62 18" stroke="#5C5448" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M62 18 C62 15 65 13 67 15" stroke="#5C5448" strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className="splash-sq-body">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M103 87 C99 88 93 90 89 91 L88 95 C91 96 95 98 98 105 L91 115 C91 115 95 115 100 115 C104 116 103 122 103 122 H58 C58 122 54 97 74 80 C73 70 74 63 78 59 L78 48 L87 55 C96 54 102 63 103 70 L92 74 L91 81 L99 80 L102 75 C109 77 111 85 103 87 Z M49 122 C38 120 31 114 31 102 C31 88 39 59 16 63 L15 60 C19 51 27 42 40 42 C54 42 61 51 61 68 C61 88 48 89 49 122 Z"
            fill="none"
            stroke="#5C5448"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="translate(8,22)"
          />
          <path d="M78 48 C73 43 66 41 64 44" fill="none" stroke="#5C5448" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>

      {/* App name */}
      <div className="splash-kura">KURA</div>

      {/* Tagline */}
      <div className="splash-tagline">Buy less, own more.</div>

      {/* Sub-label */}
      <div className="splash-label">SAVE FOR WHAT STAYS</div>

      {/* Credit — fixed to bottom */}
      <div
        className="splash-credit"
        style={{ position: 'absolute', bottom: 28 }}
      >
        Made by Melam
      </div>
    </div>
  )
}

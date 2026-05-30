/**
 * 分享卡片 A — 许愿池进度卡（深色）。
 *
 * 纯展示组件，全部用内联 hex 样式（不依赖主题 token / Tailwind），
 * 这样 html2canvas 截图时不会碰到 oklch 颜色函数而报错。
 */
export function WishPoolShareCard({
  focusItemName,
  targetAmount,
  savedAmount,
  savingsCount,
  savingsTotal,
}: {
  focusItemName: string
  targetAmount: number
  savedAmount: number
  savingsCount: number
  savingsTotal: number
}) {
  const pct = targetAmount > 0 ? Math.min((savedAmount / targetAmount) * 100, 100) : 0
  const remaining = Math.max(0, targetAmount - savedAmount)
  const reached = targetAmount > 0 && savedAmount >= targetAmount
  const yuan = (n: number) => `¥${Math.round(n)}`

  return (
    <div
      style={{
        width: 340,
        boxSizing: 'border-box',
        padding: '30px 28px',
        borderRadius: 24,
        backgroundColor: '#2C1F14',
        color: '#F5EFE6',
        fontFamily: "'DM Sans', 'PingFang SC', -apple-system, sans-serif",
      }}
    >
      {/* 品牌徽标 */}
      <div
        style={{
          display: 'inline-block',
          padding: '4px 11px',
          borderRadius: 999,
          backgroundColor: 'rgba(245, 239, 230, 0.10)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: '#F5EFE6',
        }}
      >
        🐿 KURA
      </div>

      {/* 目标 */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 14, color: '#B8A892' }}>我在攒钱买</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 24, lineHeight: 1.2, color: '#F5EFE6' }}>
            {focusItemName}
          </span>
          <span style={{ flexShrink: 0, fontSize: 14, color: '#B8A892' }}>目标 {yuan(targetAmount)}</span>
        </div>
      </div>

      {/* 进度条 */}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 10,
            borderRadius: 999,
            backgroundColor: 'rgba(245, 239, 230, 0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #E8C77E 0%, #D4A24E 100%)',
            }}
          />
        </div>
        <span style={{ flexShrink: 0, fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 18, color: '#E8C77E' }}>
          {Math.round(pct)}%
        </span>
      </div>

      <div style={{ marginTop: 12, fontSize: 14, color: '#D8CBB8' }}>
        已攒 {yuan(savedAmount)}
        {reached ? ' · 目标达成 🎉' : ` · 还差 ${yuan(remaining)}`}
      </div>

      {/* 分隔线 */}
      <div style={{ marginTop: 22, marginBottom: 18, height: 1, backgroundColor: 'rgba(245, 239, 230, 0.12)' }} />

      {/* 累计忍住 */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 15, color: '#F5EFE6' }}>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 19 }}>{savingsCount}</span>
          <span style={{ color: '#B8A892' }}> 次 忍住了</span>
        </span>
        <span style={{ fontSize: 15, color: '#F5EFE6' }}>
          <span style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 19 }}>{yuan(savingsTotal)}</span>
          <span style={{ color: '#B8A892' }}> 省下来了</span>
        </span>
      </div>

      {/* 品牌页脚 */}
      <div style={{ marginTop: 28, fontSize: 12, letterSpacing: '0.02em', color: '#8C7B66' }}>
        getkura.cyou · 重建金钱感知
      </div>
    </div>
  )
}

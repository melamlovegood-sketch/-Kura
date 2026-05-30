/**
 * 分享卡片 B — 月度总结卡（浅色）。
 *
 * 纯展示组件，全部用内联 hex 样式（同 WishPoolShareCard，为 html2canvas 避坑）。
 * 数据来自月度故事 snapshot（reviewStore）+ 许愿池 + streak。
 */
export function MonthlyShareCard({
  monthText,
  savingsCount,
  savingsAdded,
  wishPoolPct,
  wishPoolName,
  overspendAmount,
  streak,
  personaTitle,
  personaEmoji,
}: {
  monthText: string
  savingsCount: number
  savingsAdded: number
  wishPoolPct: number | null
  wishPoolName: string | null
  overspendAmount: number
  streak: number
  personaTitle: string | null
  personaEmoji: string | null
}) {
  const yuan = (n: number) => `¥${Math.round(n)}`
  const poolLabel = wishPoolName ? `${wishPoolName}进度` : '许愿池进度'

  const cells: { value: string; label: string }[] = [
    { value: yuan(savingsAdded), label: '攒进许愿池' },
    { value: wishPoolPct != null ? `${wishPoolPct}%` : '—', label: poolLabel },
    { value: yuan(overspendAmount), label: '超支金额' },
    { value: `${streak}天`, label: '自律连胜' },
  ]

  return (
    <div
      style={{
        width: 340,
        boxSizing: 'border-box',
        padding: '30px 28px',
        borderRadius: 24,
        backgroundColor: '#F2EDE8',
        color: '#2C1F14',
        fontFamily: "'DM Sans', 'PingFang SC', -apple-system, sans-serif",
      }}
    >
      {/* 顶部：品牌 + 月份 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 11px',
            borderRadius: 999,
            backgroundColor: '#2C1F14',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color: '#F5EFE6',
          }}
        >
          🐿 KURA
        </span>
        <span style={{ fontSize: 14, color: '#8C7B66' }}>{monthText}</span>
      </div>

      {/* 主标题 */}
      <div style={{ marginTop: 26 }}>
        <div style={{ fontSize: 15, color: '#8C7B66' }}>这个月我忍住了</div>
        <div style={{ marginTop: 4, fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 30, lineHeight: 1.2, color: '#2C1F14' }}>
          {savingsCount}次冲动消费
        </div>
      </div>

      {/* 2x2 数据格子 */}
      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {cells.map((c) => (
          <div
            key={c.label}
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
            }}
          >
            <div style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, lineHeight: 1.1, color: '#2C1F14' }}>
              {c.value}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: '#8C7B66' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 消费人格标签 */}
      {personaTitle && (
        <div
          style={{
            marginTop: 18,
            display: 'inline-block',
            padding: '7px 14px',
            borderRadius: 999,
            backgroundColor: '#2C1F14',
            fontSize: 14,
            color: '#F5EFE6',
          }}
        >
          {personaEmoji ? `${personaEmoji} ` : ''}本月消费人格：{personaTitle}
        </div>
      )}

      {/* 品牌页脚 */}
      <div style={{ marginTop: 26, fontSize: 12, letterSpacing: '0.02em', color: '#A89B86' }}>
        getkura.cyou · 重建金钱感知
      </div>
    </div>
  )
}

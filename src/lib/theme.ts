export type Theme = 'warm' | 'cool' | 'dark'

export const THEME_LABELS: Record<Theme, { label: string; desc: string; preview: string }> = {
  warm: { label: '暖色', desc: '米白 · 温润',  preview: '#F5F0E8' },
  cool: { label: '冷色', desc: '浅灰 · 清爽',  preview: '#F0F2F5' },
  dark: { label: '夜间', desc: '深灰 · 护眼',  preview: '#141414' },
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

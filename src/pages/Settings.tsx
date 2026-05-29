import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { useSettingsStore, DEFAULT_MODELS } from '@/store/settings'
import { usePrinciplesStore } from '@/store/principles'
import { routeIntent } from '@/lib/ai/router'
import { fileToBase64 } from '@/lib/utils'
import { THEME_LABELS, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { AIProvider } from '@/lib/ai/types'

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'qwen',   label: '通义千问' },
  { value: 'gpt',    label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
]

export function Settings() {
  const store = useSettingsStore()
  const [provider, setProvider] = useState<AIProvider>(store.aiProvider)
  const [model,    setModel]    = useState(store.aiModel)
  const [apiKey,   setApiKey]   = useState(store.aiApiKey)
  const [cooldown, setCooldown] = useState(String(store.cooldownHours))
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    if (!store.loaded) return
    setProvider(store.aiProvider); setModel(store.aiModel)
    setApiKey(store.aiApiKey); setCooldown(String(store.cooldownHours))
  }, [store.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProviderChange(p: AIProvider) { setProvider(p); setModel(DEFAULT_MODELS[p]) }

  async function handleSave() {
    setSaving(true)
    await store.update({ aiProvider: provider, aiModel: model, aiApiKey: apiKey, cooldownHours: Number(cooldown) || 72 })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-5 pt-6">
      <h1 className="text-base font-medium text-ink">设置</h1>

      {/* ── Theme ── */}
      <Card>
        <CardHeader><CardTitle>主题</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(Object.keys(THEME_LABELS) as Theme[]).map((t) => {
              const info = THEME_LABELS[t]
              return (
                <button
                  key={t}
                  onClick={() => void store.update({ theme: t })}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-2 rounded-xl border-theme p-3 transition-colors',
                    store.theme === t ? 'bg-accent text-on-accent' : 'bg-card-alt text-ink-2 hover:text-ink',
                  )}
                >
                  <span
                    className="h-5 w-5 rounded-full border-theme"
                    style={{ backgroundColor: info.preview }}
                  />
                  <span className="text-[13px] font-medium">{info.label}</span>
                  <span className={cn('text-[11px]', store.theme === t ? 'text-on-accent opacity-70' : 'text-ink-4')}>
                    {info.desc}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── AI Config ── */}
      <Card>
        <CardHeader><CardTitle>AI 配置</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">服务商</label>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map((p) => (
                <button key={p.value} onClick={() => handleProviderChange(p.value)}
                  className={cn('rounded-lg border-theme px-3 py-1.5 text-[13px] font-medium transition-colors',
                    provider === p.value ? 'bg-accent text-on-accent' : 'text-ink-3 hover:bg-card-alt hover:text-ink-2'
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">模型</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} />
          </div>
          <div>
            <label className="mb-2 block text-[13px] text-ink-3">API Key</label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
          </div>
          <p className="text-[13px] leading-relaxed text-ink-4">{PROVIDER_HINTS[provider]}</p>
        </CardContent>
      </Card>

      {/* ── Cooldown ── */}
      <Card>
        <CardHeader><CardTitle>冷静期</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="w-24" min={1} max={168} />
            <span className="text-[15px] text-ink-3">小时（默认 72h）</span>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
      </Button>

      <PrinciplesSection />
    </div>
  )
}

const PROVIDER_HINTS: Record<AIProvider, string> = {
  qwen:   '通义千问 dashscope，默认 qwen-vl-plus，支持图片解析，价格最低。',
  gpt:    'OpenAI，默认 gpt-4o，支持图片。',
  claude: 'Anthropic Claude，默认 claude-sonnet-4-6，支持图片。',
  gemini: 'Google Gemini，默认 gemini-2.0-flash，支持图片。',
}

function PrinciplesSection() {
  const { adapter }      = useSettingsStore()
  const principlesStore  = usePrinciplesStore()
  const [input, setInput]       = useState('')
  const [image, setImage]       = useState<{ file: File; base64: string } | null>(null)
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(base64: string, file: File) { setImage({ file, base64 }) }

  async function handleExtract() {
    if (!input.trim() && !image) return
    if (!adapter) { alert('请先在上方填写 API Key 并保存'); return }
    setExtracting(true)
    try {
      const result = await routeIntent(adapter, input.trim() || '请从图片中提取消费原则', image?.base64, undefined, undefined, [])
      if (result.module === 'principles' && Array.isArray(result.data.items)) {
        await principlesStore.add(result.data.items as string[]); setInput(''); setImage(null)
      } else if (input.trim()) {
        await principlesStore.add([input.trim()]); setInput('')
      }
    } finally { setExtracting(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle>个人消费原则</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-4">用大白话描述消费理念，或上传文章截图。AI 提取后注入每次分析的上下文。</p>

        <ImageDropZone onFile={handleFileSelect} className="flex flex-col gap-2">
          {image && (
            <div className="flex items-center gap-2">
              <span className="max-w-[200px] truncate text-[13px] text-ink-3">{image.file.name}</span>
              <button onClick={() => setImage(null)} className="text-ink-4 hover:text-ink-3 transition-colors"><X size={13} /></button>
            </div>
          )}
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={'描述消费原则，或拖拽文章截图到这里…\n例："宁可买一件贵的也不买几件便宜货"'}
            rows={3}
            className="w-full resize-none rounded-xl border-theme bg-card-alt px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-4 focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)] transition-colors" />
          <div className="flex items-center gap-3">
            <button onClick={() => fileRef.current?.click()} className="text-[13px] text-ink-4 hover:text-ink-3 transition-colors">上传截图</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return; handleFileSelect(await fileToBase64(f), f); e.target.value = ''
            }} />
            <div className="flex-1" />
            <Button size="sm" onClick={() => void handleExtract()} disabled={extracting || (!input.trim() && !image)}>
              {extracting ? 'AI 提取中…' : '添加原则'}
            </Button>
          </div>
        </ImageDropZone>

        {principlesStore.items.length > 0 ? (
          <ul className="flex flex-col">
            {principlesStore.items.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2 py-2.5 text-[15px] border-t-theme first:border-t-0">
                <span className="mt-0.5 shrink-0 text-[13px] text-ink-4">{i + 1}</span>
                <span className="flex-1 text-ink-2">{p.content}</span>
                <button onClick={() => void principlesStore.remove(p.id)} className="mt-0.5 shrink-0 text-ink-4 hover:text-ink-3 transition-colors"><X size={13} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-4">还没有消费原则</p>
        )}
      </CardContent>
    </Card>
  )
}

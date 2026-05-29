import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { createAdapter, DEFAULT_MODELS } from '@/lib/ai/factory'
import { applyTheme, type Theme } from '@/lib/theme'
import type { AIAdapter, AIProvider } from '@/lib/ai/types'

interface Settings {
  cooldownHours: number
  aiProvider: AIProvider
  aiModel: string
  aiApiKey: string
  theme: Theme
}

interface SettingsStore extends Settings {
  loaded: boolean
  adapter: AIAdapter | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

const DEFAULTS: Settings = {
  cooldownHours: 72,
  aiProvider: 'qwen',
  aiModel: 'qwen-vl-plus',
  aiApiKey: '',
  theme: 'warm',
}

// Apply persisted theme immediately (before Supabase loads)
const _savedTheme = (localStorage.getItem('kura-theme') as Theme | null) ?? DEFAULTS.theme
applyTheme(_savedTheme)

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  adapter: null,

  load: async () => {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!data) { set({ loaded: true }); return }

    const settings: Settings = {
      cooldownHours: data.cooldown_hours ?? DEFAULTS.cooldownHours,
      aiProvider:    (data.ai_provider as AIProvider) ?? DEFAULTS.aiProvider,
      aiModel:       data.ai_model ?? DEFAULTS.aiModel,
      aiApiKey:      data.ai_api_key ?? '',
      theme:         (data.theme as Theme) ?? DEFAULTS.theme,
    }

    applyTheme(settings.theme)
    localStorage.setItem('kura-theme', settings.theme)

    const adapter = settings.aiApiKey
      ? createAdapter(settings.aiProvider, settings.aiApiKey, settings.aiModel)
      : null

    set({ ...settings, adapter, loaded: true })
  },

  update: async (patch) => {
    const next = { ...get(), ...patch }

    if (patch.theme) { applyTheme(patch.theme); localStorage.setItem('kura-theme', patch.theme) }

    const { data: existing } = await supabase
      .from('user_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    const row = {
      cooldown_hours: next.cooldownHours,
      ai_provider:    next.aiProvider,
      ai_model:       next.aiModel,
      ai_api_key:     next.aiApiKey || null,
      theme:          next.theme,
      updated_at:     new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('user_settings').update(row).eq('id', existing.id)
    } else {
      await supabase.from('user_settings').insert(row)
    }

    const adapter = next.aiApiKey
      ? createAdapter(next.aiProvider, next.aiApiKey, next.aiModel)
      : null

    set({ ...next, adapter })
  },
}))

export { DEFAULT_MODELS }

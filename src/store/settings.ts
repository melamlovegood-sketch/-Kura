import { create } from 'zustand'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth'
import { createAdapter, DEFAULT_MODELS } from '@/lib/ai/factory'
import { applyTheme, type Theme } from '@/lib/theme'
import type { AIAdapter, AIProvider } from '@/lib/ai/types'
import type { Identity } from '@/lib/costPerspective'

interface Settings {
  cooldownHours: number
  timerMinutes: number
  aiProvider: AIProvider
  aiModel: string
  aiApiKey: string
  theme: Theme
  // 代价视角 identity profile
  identity: Identity
  monthlyIncome: number | null
  monthlyFoodBudget: number | null
  dailyWorkHours: number | null
  // 推送通知开关（各自独立；Edge Function 据此决定是否发某类提醒）
  notifyCooldown: boolean
  notifySubscription: boolean
  notifyExpiry: boolean
}

interface SettingsStore extends Settings {
  loaded: boolean
  adapter: AIAdapter | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

const DEFAULTS: Settings = {
  cooldownHours: 72,
  timerMinutes: 15,
  aiProvider: 'qwen',
  aiModel: 'qwen-vl-plus',
  aiApiKey: '',
  theme: 'warm',
  identity: null,
  monthlyIncome: null,
  monthlyFoodBudget: null,
  dailyWorkHours: null,
  notifyCooldown: true,
  notifySubscription: true,
  notifyExpiry: true,
}

// Apply persisted theme immediately (before Supabase loads)
const _savedTheme = (localStorage.getItem('kura-theme') as Theme | null) ?? DEFAULTS.theme
applyTheme(_savedTheme)

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  adapter: null,

  load: async () => {
    const { data } = await db
      .from('user_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!data) { set({ loaded: true }); return }

    const settings: Settings = {
      cooldownHours: data.cooldown_hours ?? DEFAULTS.cooldownHours,
      timerMinutes:  data.timer_minutes ?? DEFAULTS.timerMinutes,
      aiProvider:    (data.ai_provider as AIProvider) ?? DEFAULTS.aiProvider,
      aiModel:       data.ai_model ?? DEFAULTS.aiModel,
      aiApiKey:      data.ai_api_key ?? '',
      theme:         (data.theme as Theme) ?? DEFAULTS.theme,
      identity:          (data.identity as Identity) ?? null,
      monthlyIncome:     data.monthly_income ?? null,
      monthlyFoodBudget: data.monthly_food_budget ?? null,
      dailyWorkHours:    data.daily_work_hours ?? null,
      notifyCooldown:     data.notify_cooldown ?? true,
      notifySubscription: data.notify_subscription ?? true,
      notifyExpiry:       data.notify_expiry ?? true,
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

    const { data: existing } = await db
      .from('user_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    const row = {
      cooldown_hours: next.cooldownHours,
      timer_minutes:  next.timerMinutes,
      ai_provider:    next.aiProvider,
      ai_model:       next.aiModel,
      ai_api_key:     next.aiApiKey || null,
      theme:          next.theme,
      identity:            next.identity,
      monthly_income:      next.monthlyIncome,
      monthly_food_budget: next.monthlyFoodBudget,
      daily_work_hours:    next.dailyWorkHours,
      notify_cooldown:     next.notifyCooldown,
      notify_subscription: next.notifySubscription,
      notify_expiry:       next.notifyExpiry,
      updated_at:     new Date().toISOString(),
    }

    if (existing) {
      await db.from('user_settings').update(row).eq('id', existing.id)
    } else {
      await db.from('user_settings').insert({ ...row, user_id: await getCurrentUserId() })
    }

    const adapter = next.aiApiKey
      ? createAdapter(next.aiProvider, next.aiApiKey, next.aiModel)
      : null

    set({ ...next, adapter })
  },
}))

export { DEFAULT_MODELS }

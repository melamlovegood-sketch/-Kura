import type { CategoryMain, ItemCategory } from '@/types/db'

export const CATEGORY_META: Record<ItemCategory, { label: string; main: CategoryMain }> = {
  canteen:         { label: '食堂',     main: 'basic_life' },
  transport:       { label: '交通',     main: 'basic_life' },
  daily_supplies:  { label: '日用物资', main: 'basic_life' },
  subscription:    { label: '订阅',     main: 'basic_life' },
  daily:           { label: '日常',     main: 'discretionary' },
  online_shopping: { label: '网购',     main: 'discretionary' },
  entertainment:   { label: '娱乐',     main: 'discretionary' },
  other:           { label: '其他',     main: 'discretionary' },
}

export const CATEGORY_GROUPS: {
  main: CategoryMain
  label: string
  items: ItemCategory[]
}[] = [
  {
    main: 'basic_life',
    label: '基础生活',
    items: ['canteen', 'transport', 'daily_supplies', 'subscription'],
  },
  {
    main: 'discretionary',
    label: '可支配',
    items: ['daily', 'online_shopping', 'entertainment', 'other'],
  },
]

export const CATEGORY_MAIN_LABEL: Record<CategoryMain, string> = {
  basic_life: '基础生活',
  discretionary: '可支配',
}

export function getCategoryMain(cat: ItemCategory): CategoryMain {
  return CATEGORY_META[cat].main
}

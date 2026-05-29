import { supabase } from '@/lib/supabase'
import type { ItemCategory, CategoryMain, ParsedTransaction } from '@/types/db'

export async function addTransaction(
  tx: ParsedTransaction,
  source: 'text' | 'screenshot',
): Promise<string> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date: tx.date,
      amount: tx.amount,
      category: tx.category,
      category_main: tx.category_main,
      description: tx.description || null,
      source,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

/** Quick insert from execution layer: maps free-text category to enum */
export async function addExecutionTransaction(opts: {
  amount: number
  description: string
  executionCategory: string
  executionSessionId: string
}): Promise<string> {
  const { category, category_main } = guessCategory(opts.executionCategory)

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      date: new Date().toISOString().slice(0, 10),
      amount: opts.amount,
      category,
      category_main,
      description: opts.description || null,
      source: 'text',
      execution_session_id: opts.executionSessionId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data.id as string
}

function guessCategory(cat: string): { category: ItemCategory; category_main: CategoryMain } {
  const c = cat.toLowerCase()
  if (c.includes('食') || c.includes('餐') || c.includes('外卖') || c.includes('奶茶'))
    return { category: 'daily', category_main: 'discretionary' }
  if (c.includes('交通') || c.includes('地铁') || c.includes('公交') || c.includes('打车'))
    return { category: 'transport', category_main: 'basic_life' }
  if (c.includes('娱乐') || c.includes('电影') || c.includes('演出'))
    return { category: 'entertainment', category_main: 'discretionary' }
  return { category: 'online_shopping', category_main: 'discretionary' }
}

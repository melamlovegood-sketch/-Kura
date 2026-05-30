import type { AIAdapter, AIMessage, ContentPart } from '@/lib/ai/types'

export interface ParsedSOPRule {
  title: string
  content: string
}

const SYSTEM_PROMPT =
  '你帮用户把一条「购物原则」整理成结构化的标题 + 内容。\n' +
  '只返回 JSON，格式：{"title": "短标题(不超过8字，如品类或主题)", "content": "完整的原则描述(一句话)"}\n' +
  '示例：输入「裤子我只去线下试穿满意了再网上买」→ {"title":"裤子","content":"裤子只去线下试穿，满意再线上买"}\n' +
  '若输入本身已很短，title 可与 content 相同。不要解释，不要 Markdown，只输出 JSON。'

/**
 * Turn a free-text / screenshot description of a shopping principle into a
 * structured {title, content}. Used by the 「AI 帮我写」path of the SOP add modal;
 * the user confirms/edits the result before it's saved. Falls back to using the
 * raw text as both fields if the model returns something unparseable.
 */
export async function parseSOPRule(
  adapter: AIAdapter,
  text: string,
  imageBase64?: string,
  signal?: AbortSignal,
): Promise<ParsedSOPRule> {
  const fallback = text.trim()
  const content: ContentPart[] = [{ type: 'text', text: fallback || '请从图片中提取一条购物原则' }]
  if (imageBase64) content.push({ type: 'image_url', image_url: { url: imageBase64 } })

  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: content.length === 1 ? (fallback || '请从图片中提取一条购物原则') : content },
  ]

  const raw = await adapter.streamChat(messages, () => {}, signal)
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Partial<ParsedSOPRule>
    const title = (parsed.title ?? '').trim()
    const ruleContent = (parsed.content ?? '').trim()
    if (title || ruleContent) {
      return { title: title || ruleContent, content: ruleContent || title }
    }
  } catch {
    // fall through to raw-text fallback
  }
  return { title: fallback, content: fallback }
}

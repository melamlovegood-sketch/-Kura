import type { AIAdapter, AIMessage, ContentPart, IntentResult } from './types'

const BASE_SYSTEM_PROMPT = `你是 Kura 的 AI 助手，帮助用户记录消费决策。
根据用户的输入（文字或截图），判断意图并返回结构化数据。

只返回 JSON，格式如下：
{
  "module": "<模块>",
  "confidence": 0.0~1.0,
  "data": { ...字段... },
  "display_text": "展示给用户的简短确认（中文，20字以内）"
}

模块说明及 data 字段：

transaction（记账）— 已发生的消费
  data: { amount: number, description: string, category: "canteen"|"transport"|"daily_supplies"|"daily"|"online_shopping"|"entertainment"|"other", category_main: "basic_life"|"discretionary", date: "YYYY-MM-DD" }
  示例："刚买了奶茶28块" / 支付截图

impulse（冲动记录）— 想买但还没决定
  data: { item_name: string, estimated_price: number|null, season_tag: "year_round"|"summer"|"winter"|"specific", source: string|null }
  示例："种草了一双鞋大概300"

wish_pool（许愿池 - 忍住了）— 克制了一次消费，攒钱
  data: { amount: number, description: string }
  示例："忍住了一顿海底捞大概120" / "没买那杯奶茶30块"

wishlist（直接加待购清单）— 明确想买，不需冷静期
  data: { item_name: string, estimated_price: number|null, category: string|null, season_tag: "year_round"|"summer"|"winter"|"specific", need_intensity: number(1-10)|null, worthiness_score: number(1-10)|null, worthiness_reason: string|null }
  worthiness_reason 说明：综合"需求持续时长 + 使用场景宽窄 + 季节匹配度"，20字以内

budget（设置预算）
  data: { month: "YYYY-MM", basic_life_limit: number|null, discretionary_limit: number|null, total_income: number|null }
  示例："这个月基础生活预算500，可支配800"

execution（开始购物执行）
  data: { category: string }
  示例："决定买那双鞋了" / "要去买裤子"

principles（添加消费原则）— 用户表达消费理念，或上传文章/截图
  data: { items: string[] }  -- 提取的原则列表，每条简洁短句（20字以内）
  示例："宁可买一件贵的也不买几件便宜货" / 上传消费理念文章截图

unknown（无法识别）
  data: {}

分类规则：
- 基础生活(basic_life)：食堂(canteen)、交通(transport)、日用物资(daily_supplies)
- 可支配(discretionary)：外卖/奶茶/聚餐(daily)、网购(online_shopping)、娱乐(entertainment)、其他(other)

如果是截图，尽量从图中提取金额、商品、时间。
date 默认今天：${new Date().toISOString().slice(0, 10)}`

function buildSystemPrompt(principles: string[]): string {
  if (principles.length === 0) return BASE_SYSTEM_PROMPT

  const list = principles.map((p, i) => `${i + 1}. ${p}`).join('\n')
  return `${BASE_SYSTEM_PROMPT}

---
用户的个人消费原则（在分析值得度、优先级和预算建议时结合考虑）：
${list}
---`
}

export async function routeIntent(
  adapter: AIAdapter,
  input: string,
  imageBase64?: string,
  onChunk?: (delta: string) => void,
  signal?: AbortSignal,
  principles: string[] = [],
): Promise<IntentResult> {
  const content: ContentPart[] = [{ type: 'text', text: input }]

  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: imageBase64 },
    })
  }

  console.debug('[routeIntent] input', {
    text: input,
    hasImage: !!imageBase64,
    // data URI prefix tells us the mime type was preserved (e.g. "data:image/png;base64,")
    imagePrefix: imageBase64?.slice(0, 30),
    imageLength: imageBase64?.length ?? 0,
  })

  const messages: AIMessage[] = [
    { role: 'system', content: buildSystemPrompt(principles) },
    { role: 'user', content: content.length === 1 ? input : content },
  ]

  let raw = ''
  const full = await adapter.streamChat(
    messages,
    (delta) => {
      raw += delta
      onChunk?.(delta)
    },
    signal,
  )

  return parseIntentResult(full || raw)
}

function parseIntentResult(raw: string): IntentResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

  try {
    return JSON.parse(cleaned) as IntentResult
  } catch {
    return {
      module: 'unknown',
      confidence: 0,
      data: {},
      display_text: '解析失败，请重新描述',
    }
  }
}

import type { AIAdapter, AIMessage } from '../types'

// Qwen uses an OpenAI-compatible endpoint via dashscope
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export class QwenAdapter implements AIAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'qwen-vl-plus',
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Qwen API error ${res.status}: ${err}`)
    }

    return readOpenAIStream(res, onChunk)
  }
}

// Shared SSE reader for OpenAI-compatible streams (used by Qwen + GPT adapters)
export async function readOpenAIStream(
  res: Response,
  onChunk: (delta: string) => void,
): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return full

      try {
        const json = JSON.parse(payload)
        const delta: string = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          onChunk(delta)
        }
      } catch {
        // malformed chunk, skip
      }
    }
  }

  return full
}

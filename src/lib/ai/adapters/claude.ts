import type { AIAdapter, AIMessage, ContentPart } from '../types'

const BASE_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export class ClaudeAdapter implements AIAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'claude-sonnet-4-6',
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    // Extract system message (Claude puts it in a top-level field)
    const systemMsg = messages.find((m) => m.role === 'system')
    const userMessages = messages.filter((m) => m.role !== 'system')

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemMsg ? toClaudeContent(systemMsg.content) : undefined,
        messages: userMessages.map((m) => ({
          role: m.role,
          content: toClaudeContent(m.content),
        })),
        stream: true,
      }),
      signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Claude API error ${res.status}: ${err}`)
    }

    return readClaudeStream(res, onChunk)
  }
}

function toClaudeContent(
  content: string | ContentPart[],
): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content

  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text }

    // Convert image_url (data URI) to Claude's base64 source format
    const url = part.image_url.url
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      return {
        type: 'image',
        source: { type: 'base64', media_type: match[1], data: match[2] },
      }
    }
    return { type: 'image', source: { type: 'url', url } }
  })
}

async function readClaudeStream(
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

      try {
        const json = JSON.parse(payload)
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const delta: string = json.delta.text ?? ''
          if (delta) {
            full += delta
            onChunk(delta)
          }
        }
      } catch {
        // malformed chunk, skip
      }
    }
  }

  return full
}

import type { AIAdapter, AIMessage, ContentPart } from '../types'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export class GeminiAdapter implements AIAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gemini-2.0-flash',
  ) {}

  async streamChat(
    messages: AIMessage[],
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const systemMsg = messages.find((m) => m.role === 'system')
    const turns = messages.filter((m) => m.role !== 'system')

    const url = `${BASE_URL}/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: systemMsg
          ? { parts: [{ text: toText(systemMsg.content) }] }
          : undefined,
        contents: turns.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: toParts(m.content),
        })),
      }),
      signal,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini API error ${res.status}: ${err}`)
    }

    return readGeminiStream(res, onChunk)
  }
}

function toText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .filter((p): p is import('../types').TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function toParts(content: string | ContentPart[]): Array<Record<string, unknown>> {
  if (typeof content === 'string') return [{ text: content }]

  return content.map((part) => {
    if (part.type === 'text') return { text: part.text }

    // image_url → Gemini inline_data
    const url = part.image_url.url
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      return { inline_data: { mime_type: match[1], data: match[2] } }
    }
    return { file_data: { file_uri: url } }
  })
}

async function readGeminiStream(
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
        const text: string =
          json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        if (text) {
          full += text
          onChunk(text)
        }
      } catch {
        // malformed chunk, skip
      }
    }
  }

  return full
}

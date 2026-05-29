import type { AIAdapter, AIMessage } from '../types'
import { readOpenAIStream } from './qwen'

const BASE_URL = 'https://api.openai.com/v1'

export class OpenAIAdapter implements AIAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gpt-4o',
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
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    return readOpenAIStream(res, onChunk)
  }
}

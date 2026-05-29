import type { AIAdapter, AIProvider } from './types'
import { QwenAdapter } from './adapters/qwen'
import { OpenAIAdapter } from './adapters/openai'
import { ClaudeAdapter } from './adapters/claude'
import { GeminiAdapter } from './adapters/gemini'

export function createAdapter(
  provider: AIProvider,
  apiKey: string,
  model: string,
): AIAdapter {
  switch (provider) {
    case 'qwen':
      return new QwenAdapter(apiKey, model)
    case 'gpt':
      return new OpenAIAdapter(apiKey, model)
    case 'claude':
      return new ClaudeAdapter(apiKey, model)
    case 'gemini':
      return new GeminiAdapter(apiKey, model)
  }
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  qwen: 'qwen-vl-plus',
  gpt: 'gpt-4o',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
}

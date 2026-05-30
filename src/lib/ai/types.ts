export type AIProvider = 'qwen' | 'gpt' | 'claude' | 'gemini'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image_url'
  image_url: { url: string } // base64 data URI or https URL
}

export type ContentPart = TextPart | ImagePart

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface AIAdapter {
  /**
   * Stream a chat completion. Calls onChunk with each text delta.
   * Returns the full accumulated text when done.
   */
  streamChat(
    messages: AIMessage[],
    onChunk: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string>
}

// ─── Intent routing output ────────────────────────────────────────────────────

export type IntentModule =
  | 'transaction'
  | 'impulse'
  | 'wishlist'
  | 'wish_pool'
  | 'execution'
  | 'budget'
  | 'budget_update'
  | 'subscription'
  | 'principles'
  | 'price_track'
  | 'unknown'

export interface IntentResult {
  module: IntentModule
  confidence: number
  data: Record<string, unknown>
  display_text: string // short Chinese confirmation shown to user
}

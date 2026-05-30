import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/store/settings'
import { formatMonth } from '@/lib/utils'
import { buildStoryChatSystemPrompt } from '@/lib/generateMonthlyStory'
import type { MonthlyStory } from '@/store/review'
import type { AIMessage } from '@/lib/ai/types'

interface ChatTurn { role: 'user' | 'assistant'; text: string }

/**
 * 月度复盘故事卡片. Top = the persona conclusion (emoji + label, reused from the
 * persona model). Middle = the AI-written narrative. Bottom = an embedded chat
 * scoped to THIS month only (its system prompt carries the month's snapshot +
 * the story, and forbids global questions). This card replaces the standalone
 * PersonaCard: story is the process, persona is the conclusion — one card.
 */
/**
 * Drop a persona paragraph from an already-generated story body. The persona is
 * now shown only in the card header, but stories written before that change still
 * carry a 「本月人格：…」/「消费人格：…」 paragraph in their text. Split on blank
 * lines and remove any block whose first line is a persona label.
 */
function stripPersonaParagraph(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((para) => !/^\s*(本月|当月)?(消费)?人格\s*[:：]/.test(para))
    .join('\n\n')
    .trim()
}

export function MonthlyStoryCard({ story }: { story: MonthlyStory }) {
  const persona = story.snapshot.persona
  const body = stripPersonaParagraph(story.story)

  return (
    <Card>
      {/* ── persona conclusion ── */}
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-4">
          {formatMonth(story.month)}复盘
        </p>
      </div>

      {persona && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[32px] leading-none">{persona.emoji}</span>
          <div>
            <p className="text-[16px] font-medium text-ink">{persona.title}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">{persona.description}</p>
          </div>
        </div>
      )}

      {/* ── the story ── */}
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{body}</p>

      {/* ── embedded month-scoped chat ── */}
      <div className="mt-4 border-t-theme pt-4">
        <p className="mb-2.5 text-[13px] text-ink-3">你可以问我任何关于这个月的事</p>
        <MonthChat story={story} />
      </div>
    </Card>
  )
}

/* ── Embedded chat (independent session, this-month-only context) ───────────── */

function MonthChat({ story }: { story: MonthlyStory }) {
  const adapter = useSettingsStore((s) => s.adapter)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [reply, setReply] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function handleSend() {
    if (streaming || !text.trim() || !adapter) return

    const userTurn: ChatTurn = { role: 'user', text: text.trim() }
    const history = [...turns, userTurn]
    setTurns(history); setText(''); setReply(''); setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Rebuild each send: month-scoped system prompt + the running conversation.
    const messages: AIMessage[] = [{ role: 'system', content: buildStoryChatSystemPrompt(story.snapshot, story.story) }]
    for (const t of history) messages.push({ role: t.role, content: t.text })

    try {
      const full = await adapter.streamChat(messages, (delta) => setReply((r) => r + delta), ctrl.signal)
      setTurns((ts) => [...ts, { role: 'assistant', text: full }])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setTurns((ts) => [...ts, { role: 'assistant', text: `出错了：${(err as Error).message || '请稍后重试'}` }])
      }
    } finally {
      setReply(''); setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {(turns.length > 0 || streaming) && (
        <div className="flex flex-col gap-2.5">
          {turns.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}>
              <div className={
                t.role === 'user'
                  ? 'rounded-2xl rounded-br-md bg-card-alt px-3.5 py-2 text-[15px] text-ink-2'
                  : 'rounded-2xl rounded-bl-md border-theme bg-card px-3.5 py-2 text-[15px] leading-relaxed text-ink-2 whitespace-pre-wrap'
              }>
                {t.text}
              </div>
            </div>
          ))}
          {streaming && (
            <div className="self-start max-w-[92%]">
              <div className="rounded-2xl rounded-bl-md border-theme bg-card px-3.5 py-2 text-[15px] leading-relaxed text-ink-2 whitespace-pre-wrap">
                {reply || <span className="inline-block h-3 w-0.5 animate-pulse bg-ink-4 align-middle" />}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
          placeholder={adapter ? '比如：哪笔花得最不值？' : '配置 API Key 后可用'}
          disabled={!adapter}
          rows={1}
          className="flex-1 resize-none rounded-xl border-theme bg-card-alt px-3.5 py-2 text-[15px] text-ink placeholder:text-ink-4 focus:bg-card focus:outline-none focus:ring-1 focus:ring-[var(--border)] transition-colors disabled:opacity-60"
          style={{ maxHeight: 120 }}
        />
        <Button size="icon" onClick={() => void handleSend()} disabled={streaming || !adapter || !text.trim()} className="shrink-0">
          <Send size={15} />
        </Button>
      </div>
    </div>
  )
}

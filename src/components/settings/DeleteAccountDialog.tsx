import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { deleteAccount, deleteGuestAccount } from '@/lib/deleteAccount'

/**
 * 注销账号 确认对话框. Requires typing the current email to enable the destructive
 * action (skipped in 游客模式, which has no account — there the confirm button just
 * wipes local data). On success the lib signs out / clears local and reloads to the
 * login gate, so this component never unmounts itself manually.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const isGuest = useAuthStore((s) => s.status === 'guest')
  const email = useAuthStore((s) => s.email)
  const userId = useAuthStore((s) => s.userId)

  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guests need no email match; authed users must type their exact login email.
  const canConfirm = isGuest || (!!email && typed.trim().toLowerCase() === email.toLowerCase())

  async function handleConfirm() {
    if (busy || !canConfirm) return
    setBusy(true)
    setError(null)
    try {
      if (isGuest) { deleteGuestAccount(); return }
      if (!userId) throw new Error('未登录')
      await deleteAccount(userId)
    } catch (err) {
      setError((err as Error).message || '注销失败，请稍后重试')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
      style={{ animation: 'sheet-backdrop-in 0.2s ease-out' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="w-full max-w-[400px] rounded-2xl bg-card p-6 [animation:milestone-pop-in_0.24s_cubic-bezier(0.32,0.72,0,1)]">
        <div className="mb-3 flex items-center gap-2 text-red-600">
          <AlertTriangle size={20} />
          <h3 className="text-[17px] font-medium">确认注销账号？</h3>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-3">
          这将<span className="text-red-600">永久删除</span>你所有的消费记录、许愿池、复盘数据，无法恢复。
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-4">建议先导出数据备份。</p>

        {!isGuest && (
          <div className="mt-4">
            <Input
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setError(null) }}
              placeholder="输入邮箱地址确认"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        )}

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>取消</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || busy}
          >
            {busy ? '注销中…' : '确认注销'}
          </Button>
        </div>
      </div>
    </div>
  )
}

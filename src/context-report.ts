import type { ContextPost } from './protocol'

/**
 * Traduz o JSON que o Claude Code entrega ao statusline no post de contexto do
 * hub. O statusline é a única fonte com o percentual já calculado pelo próprio
 * Claude Code (hooks e transcript não trazem o tamanho da janela do modelo).
 */
export function toContextPost(raw: unknown): ContextPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  const sessionId = typeof p.session_id === 'string' ? p.session_id : ''
  const cw =
    typeof p.context_window === 'object' && p.context_window !== null
      ? (p.context_window as Record<string, unknown>)
      : null
  if (sessionId === '' || cw === null) return null
  const pct = cw.used_percentage
  if (typeof pct !== 'number' || Number.isNaN(pct)) return null

  const post: ContextPost = { sessionId, pct: Math.min(100, Math.max(0, pct)) }
  if (typeof cw.current_usage === 'number' && cw.current_usage >= 0) {
    post.usedTokens = cw.current_usage
  }
  if (typeof cw.context_window_size === 'number' && cw.context_window_size > 0) {
    post.maxTokens = cw.context_window_size
  }
  return post
}

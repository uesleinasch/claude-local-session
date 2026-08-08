export const INITIAL_BACKOFF_MS = 1000
export const MAX_BACKOFF_MS = 15_000
export const PING_MS = 45_000
export const PONG_TIMEOUT_MS = 4000

/** O que fazer quando a página volta ao foreground (ou a rede volta). */
export function wakeAction(readyState) {
  if (readyState === 0) return 'wait'
  if (readyState === 1) return 'ping'
  return 'reconnect'
}

export function nextBackoff(current) {
  return Math.min(current * 2, MAX_BACKOFF_MS)
}

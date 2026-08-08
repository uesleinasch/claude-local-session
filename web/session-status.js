const MINUTE = 60_000
const HOUR = 3_600_000

function idleLabel(session, now) {
  const since = session.lastEventAt
  if (typeof since !== 'number') return 'ociosa'
  const elapsed = now - since
  if (elapsed < MINUTE) return 'ociosa'
  if (elapsed < HOUR) return `ociosa há ${Math.floor(elapsed / MINUTE)} min`
  return `ociosa há ${Math.floor(elapsed / HOUR)} h`
}

/** O que a lista de sessões diz sobre uma sessão, em uma linha. */
export function sessionStatus(session, now) {
  if (!session.alive) return { tone: 'dead', label: 'encerrada' }
  if (session.waiting === true) return { tone: 'waiting', label: 'aguardando você' }
  if (session.busy === true) return { tone: 'busy', label: 'trabalhando' }
  return { tone: 'idle', label: idleLabel(session, now) }
}

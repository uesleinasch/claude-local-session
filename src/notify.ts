import type { FeedEvent } from './protocol'

export type Notification = {
  key: string
  title: string
  message: string
  tags: string
  priority: number
}

const MAX_MESSAGE = 400
const MAX_SEEN = 1000

const clip = (text: string): string =>
  text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text

export function notificationFor(label: string, event: FeedEvent): Notification | null {
  switch (event.kind) {
    case 'permission': {
      if (event.resolved !== undefined) return null
      const what = event.description === '' ? event.toolName : `${event.toolName}: ${event.description}`
      return {
        key: `perm:${event.requestId}`,
        title: label,
        message: clip(`Permissão — ${what}`),
        tags: 'lock',
        priority: 4,
      }
    }
    case 'question': {
      if (event.resolved !== undefined) return null
      return {
        key: `q:${event.questionId}`,
        title: label,
        message: clip(`Pergunta — ${event.questions[0]?.question ?? ''}`),
        tags: 'question',
        priority: 4,
      }
    }
    case 'activity': {
      if (event.status !== 'idle') return null
      return {
        key: `idle:${event.ts}`,
        title: label,
        message: 'Turno encerrado',
        tags: 'white_check_mark',
        priority: 3,
      }
    }
    case 'reply':
      return {
        key: `reply:${event.ts}`,
        title: label,
        message: clip(event.text),
        tags: 'speech_balloon',
        priority: 3,
      }
    default:
      return null
  }
}

/**
 * ntfy publica por JSON no servidor, com o tópico no corpo — o título com acento
 * quebraria se fosse por header, que é latin-1.
 */
export function splitNtfyUrl(url: string): { base: string; topic: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const parts = parsed.pathname.split('/').filter(p => p !== '')
  const topic = parts.pop()
  if (topic === undefined) return null
  const path = parts.length > 0 ? `/${parts.join('/')}` : ''
  return { base: `${parsed.origin}${path}`, topic }
}

export type Transport = (n: Notification) => Promise<boolean>

export function postToNtfy(url: string): Transport | null {
  const target = splitNtfyUrl(url)
  if (!target) return null
  return async n => {
    try {
      const res = await fetch(target.base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: target.topic,
          title: n.title,
          message: n.message,
          tags: [n.tags],
          priority: n.priority,
        }),
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

export class Notifier {
  private readonly seen = new Set<string>()

  constructor(private readonly transport: Transport | null) {}

  size(): number {
    return this.seen.size
  }

  async notify(label: string, event: FeedEvent): Promise<boolean> {
    if (this.transport === null) return false
    const n = notificationFor(label, event)
    if (n === null || this.seen.has(n.key)) return false
    this.seen.add(n.key)
    if (this.seen.size > MAX_SEEN) {
      for (const old of [...this.seen].slice(0, this.seen.size - MAX_SEEN)) this.seen.delete(old)
    }
    return this.transport(n)
  }
}

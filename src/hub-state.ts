import {
  DEAD_SESSION_TTL_MS,
  MAX_EVENTS,
  type FeedEvent,
  type HubToBrowser,
  type HubToSession,
  type PermissionBehavior,
  type SessionSummary,
} from './protocol'

export type Sink = { send(data: string): void }

type SessionEntry = {
  summary: SessionSummary
  sink: Sink | null
  events: FeedEvent[]
}

export type RegisterInfo = {
  sessionId: string
  cwd: string
  label: string
  pid: number
}

export class Registry {
  private readonly sessions = new Map<string, SessionEntry>()
  private readonly browsers = new Map<Sink, string | null>()
  private readonly sinkToSession = new Map<Sink, string>()

  addBrowser(sink: Sink): void {
    this.browsers.set(sink, null)
    this.sendTo(sink, { type: 'sessions', sessions: this.summaries() })
  }

  removeBrowser(sink: Sink): void {
    this.browsers.delete(sink)
  }

  subscribe(sink: Sink, sessionId: string): void {
    if (!this.browsers.has(sink)) return
    this.browsers.set(sink, sessionId)
    const entry = this.sessions.get(sessionId)
    this.sendTo(sink, { type: 'history', sessionId, events: entry ? [...entry.events] : [] })
  }

  registerSession(sink: Sink, info: RegisterInfo): void {
    const existing = this.sessions.get(info.sessionId)
    if (existing) {
      existing.sink = sink
      existing.summary = { ...existing.summary, ...info, id: info.sessionId, alive: true }
      delete existing.summary.endedAt
    } else {
      this.sessions.set(info.sessionId, {
        summary: { id: info.sessionId, label: info.label, cwd: info.cwd, pid: info.pid, alive: true },
        sink,
        events: [],
      })
    }
    this.sinkToSession.set(sink, info.sessionId)
    this.broadcastSessions()
  }

  removeSession(sink: Sink, now = Date.now()): void {
    const sessionId = this.sinkToSession.get(sink)
    if (sessionId === undefined) return
    this.sinkToSession.delete(sink)
    const entry = this.sessions.get(sessionId)
    // Só derruba se o sink que caiu ainda é o corrente: uma reconexão rápida
    // já trocou o sink, e o close atrasado do socket velho não pode matar o novo.
    if (!entry || entry.sink !== sink) return
    entry.sink = null
    entry.summary.alive = false
    entry.summary.endedAt = now
    this.broadcastSessions()
  }

  sessionIdFor(sink: Sink): string | undefined {
    return this.sinkToSession.get(sink)
  }

  push(sessionId: string, event: FeedEvent): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return

    if (event.kind === 'permission') {
      const at = entry.events.findIndex(
        e => e.kind === 'permission' && e.requestId === event.requestId,
      )
      if (at !== -1) {
        entry.events[at] = event
        this.broadcastEvent(sessionId, event)
        return
      }
    }

    entry.events.push(event)
    if (entry.events.length > MAX_EVENTS) entry.events.splice(0, entry.events.length - MAX_EVENTS)
    this.broadcastEvent(sessionId, event)
  }

  resolvePermission(sessionId: string, requestId: string, behavior: PermissionBehavior): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    const found = entry.events.find(e => e.kind === 'permission' && e.requestId === requestId)
    if (!found || found.kind !== 'permission') return
    this.push(sessionId, { ...found, resolved: behavior })
  }

  toSession(sessionId: string, msg: HubToSession): boolean {
    const sink = this.sessions.get(sessionId)?.sink
    if (!sink) return false
    sink.send(JSON.stringify(msg))
    return true
  }

  summaries(): SessionSummary[] {
    return [...this.sessions.values()]
      .map(e => ({ ...e.summary }))
      .sort((a, b) =>
        a.alive === b.alive ? a.label.localeCompare(b.label) : a.alive ? -1 : 1,
      )
  }

  hasAlive(): boolean {
    for (const entry of this.sessions.values()) if (entry.sink) return true
    return false
  }

  sweep(now = Date.now()): void {
    let removed = false
    for (const [id, entry] of this.sessions) {
      const ended = entry.summary.endedAt
      if (entry.sink === null && ended !== undefined && now - ended > DEAD_SESSION_TTL_MS) {
        this.sessions.delete(id)
        removed = true
      }
    }
    if (removed) this.broadcastSessions()
  }

  private broadcastSessions(): void {
    const msg: HubToBrowser = { type: 'sessions', sessions: this.summaries() }
    for (const sink of this.browsers.keys()) this.sendTo(sink, msg)
  }

  private broadcastEvent(sessionId: string, event: FeedEvent): void {
    const msg: HubToBrowser = { type: 'event', sessionId, event }
    for (const [sink, subscribed] of this.browsers) {
      if (subscribed === sessionId) this.sendTo(sink, msg)
    }
  }

  private sendTo(sink: Sink, msg: HubToBrowser): void {
    try {
      sink.send(JSON.stringify(msg))
    } catch {}
  }
}

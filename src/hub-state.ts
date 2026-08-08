import {
  DEAD_SESSION_TTL_MS,
  MAX_EVENTS,
  type ContextPost,
  type FeedEvent,
  type HubToBrowser,
  type HubToSession,
  type PermissionBehavior,
  type QuestionSpec,
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

/** Janela em que um preview de PreToolUse ainda descreve o pedido de permissão da mesma tool. */
const PREVIEW_FRESH_MS = 15_000

export class Registry {
  private readonly sessions = new Map<string, SessionEntry>()
  private readonly browsers = new Map<Sink, string | null>()
  private readonly sinkToSession = new Map<Sink, string>()
  private readonly previews = new Map<string, { tool: string; preview: string; ts: number }>()

  constructor(private readonly onEvent?: (sessionId: string, event: FeedEvent) => void) {}

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

  /** Repovoa uma sessão persistida no boot do hub, já encerrada e sem sink. */
  hydrateSession(info: RegisterInfo, events: FeedEvent[], endedAt: number): void {
    if (this.sessions.has(info.sessionId)) return
    this.sessions.set(info.sessionId, {
      summary: {
        id: info.sessionId,
        label: info.label,
        cwd: info.cwd,
        pid: info.pid,
        alive: false,
        endedAt,
      },
      sink: null,
      events: events.slice(-MAX_EVENTS),
    })
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
    entry.summary.busy = false
    entry.summary.endedAt = now
    this.broadcastSessions()
  }

  sessionIdFor(sink: Sink): string | undefined {
    return this.sinkToSession.get(sink)
  }

  /** Remoção deliberada (kill pelo navegador): some da lista na hora. */
  dropSession(sessionId: string): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.sessions.delete(sessionId)
    this.previews.delete(sessionId)
    for (const [sink, id] of this.sinkToSession) {
      if (id === sessionId) this.sinkToSession.delete(sink)
    }
    this.broadcastSessions()
  }

  push(sessionId: string, event: FeedEvent): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return

    const wasBusy = entry.summary.busy === true
    if (
      event.kind === 'prompt' ||
      (event.kind === 'question' && event.resolved === undefined) ||
      (event.kind === 'activity' && event.status === 'start')
    ) {
      entry.summary.busy = true
    } else if (event.kind === 'activity' && event.status === 'idle') {
      entry.summary.busy = false
    }
    if ((entry.summary.busy === true) !== wasBusy) this.broadcastSessions()

    if (event.kind === 'permission') {
      const requestId = event.requestId
      if (event.preview === undefined && event.resolved === undefined) {
        const p = this.previews.get(sessionId)
        if (p && p.tool === event.toolName && event.ts - p.ts < PREVIEW_FRESH_MS) {
          event = { ...event, preview: p.preview }
          this.previews.delete(sessionId)
        }
      }
      const at = entry.events.findIndex(
        e => e.kind === 'permission' && e.requestId === requestId,
      )
      if (at !== -1) {
        entry.events[at] = event
        this.onEvent?.(sessionId, event)
        this.broadcastEvent(sessionId, event)
        return
      }
    }

    if (event.kind === 'question') {
      const questionId = event.questionId
      const at = entry.events.findIndex(
        e => e.kind === 'question' && e.questionId === questionId,
      )
      if (at !== -1) {
        entry.events[at] = event
        this.onEvent?.(sessionId, event)
        this.broadcastEvent(sessionId, event)
        return
      }
    }

    entry.events.push(event)
    if (entry.events.length > MAX_EVENTS) entry.events.splice(0, entry.events.length - MAX_EVENTS)
    this.onEvent?.(sessionId, event)
    this.broadcastEvent(sessionId, event)

    // Turno encerrado (Stop/interrupção) com diálogo ainda na tela: o card sem
    // resposta ficaria "aguardando" para sempre — cancela para refletir a TUI.
    if (event.kind === 'activity' && event.status === 'idle') {
      for (const open of entry.events.filter(
        e => e.kind === 'question' && e.resolved === undefined,
      )) {
        if (open.kind === 'question') this.push(sessionId, { ...open, resolved: {} })
      }
    }
  }

  /**
   * O hook PreToolUse chega por HTTP e o pedido de permissão pelo WebSocket da
   * sessão — a ordem não é garantida. Guarda o preview para o pedido que vier,
   * e completa retroativamente o card que chegou primeiro.
   */
  notePreview(sessionId: string, tool: string, preview: string, ts = Date.now()): void {
    if (tool === '' || preview === '') return
    this.previews.set(sessionId, { tool, preview, ts })

    const entry = this.sessions.get(sessionId)
    if (!entry) return
    const last = [...entry.events]
      .reverse()
      .find(e => e.kind === 'permission' && e.resolved === undefined)
    if (
      last?.kind === 'permission' &&
      last.toolName === tool &&
      last.preview === undefined &&
      ts - last.ts < PREVIEW_FRESH_MS
    ) {
      this.previews.delete(sessionId)
      this.push(sessionId, { ...last, preview })
    }
  }

  resolveQuestion(sessionId: string, questionId: string, answers: Record<string, string>): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    const found = entry.events.find(e => e.kind === 'question' && e.questionId === questionId)
    if (!found || found.kind !== 'question') return
    this.push(sessionId, { ...found, resolved: answers })
  }

  /** Perguntas do card ainda sem resposta — insumo do tradutor de teclas. */
  openQuestion(sessionId: string, questionId: string): QuestionSpec[] | null {
    const entry = this.sessions.get(sessionId)
    if (!entry) return null
    const found = entry.events.find(
      e => e.kind === 'question' && e.questionId === questionId && e.resolved === undefined,
    )
    return found?.kind === 'question' ? found.questions : null
  }

  resolvePermission(
    sessionId: string,
    requestId: string,
    behavior: PermissionBehavior,
    auto = false,
  ): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    const found = entry.events.find(e => e.kind === 'permission' && e.requestId === requestId)
    if (!found || found.kind !== 'permission') return
    this.push(sessionId, { ...found, resolved: behavior, ...(auto ? { auto: true } : {}) })
  }

  /** Broadcast só quando algo visível muda: o statusline reporta a cada refresh. */
  noteContext(post: ContextPost): void {
    const entry = this.sessions.get(post.sessionId)
    if (!entry) return
    let changed = false

    if (post.pct !== undefined) {
      const prev = entry.summary.context
      entry.summary.context = { pct: post.pct }
      if (post.usedTokens !== undefined) entry.summary.context.usedTokens = post.usedTokens
      if (post.maxTokens !== undefined) entry.summary.context.maxTokens = post.maxTokens
      if (prev === undefined || Math.round(prev.pct) !== Math.round(post.pct)) changed = true
    }

    if (post.model !== undefined && entry.summary.model?.id !== post.model.id) {
      entry.summary.model = post.model
      changed = true
    }

    if (changed) this.broadcastSessions()
  }

  setAuto(sessionId: string, on: boolean): boolean {
    const entry = this.sessions.get(sessionId)
    if (!entry) return false
    entry.summary.auto = on
    this.broadcastSessions()
    return true
  }

  isAuto(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.summary.auto === true
  }

  /** Pedidos de permissão ainda sem decisão — aprovados em lote ao ligar o auto. */
  openPermissions(sessionId: string): string[] {
    const entry = this.sessions.get(sessionId)
    if (!entry) return []
    return entry.events
      .filter(e => e.kind === 'permission' && e.resolved === undefined)
      .map(e => (e.kind === 'permission' ? e.requestId : ''))
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

  hasBrowsers(): boolean {
    return this.browsers.size > 0
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

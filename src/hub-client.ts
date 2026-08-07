import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { HubToSession, SessionToHub } from './protocol'

const MAX_QUEUE = 50
const SPAWN_THROTTLE_MS = 5_000
const BACKOFF_MIN_MS = 1_000
const BACKOFF_MAX_MS = 30_000

export type HubClientOptions = {
  port: number
  token: string
  /** Raiz do projeto — usada para localizar src/hub.ts ao spawnar o daemon. */
  root: string
  register: Extract<SessionToHub, { type: 'register' }>
  onMessage: (msg: HubToSession) => void
}

export class HubClient {
  private ws: WebSocket | null = null
  private queue: string[] = []
  private backoff = BACKOFF_MIN_MS
  private lastSpawn = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(private readonly opts: HubClientOptions) {}

  start(): void {
    this.connect()
  }

  send(msg: SessionToHub): void {
    const data = JSON.stringify(msg)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
      return
    }
    this.queue.push(data)
    if (this.queue.length > MAX_QUEUE) this.queue.shift()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    try {
      this.ws?.close()
    } catch {}
    this.ws = null
  }

  private connect(): void {
    if (this.stopped) return
    const { port, token } = this.opts
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/_ws?role=session&t=${token}`)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.backoff = BACKOFF_MIN_MS
      ws.send(JSON.stringify(this.opts.register))
      const pending = this.queue
      this.queue = []
      for (const data of pending) ws.send(data)
    }
    ws.onmessage = ev => {
      try {
        const parsed: unknown = JSON.parse(String(ev.data))
        if (typeof parsed === 'object' && parsed !== null) {
          this.opts.onMessage(parsed as HubToSession)
        }
      } catch {}
    }
    ws.onerror = () => {}
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return
    this.spawnHub()
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
    this.timer = setTimeout(() => {
      this.timer = null
      this.connect()
    }, delay)
  }

  private spawnHub(): void {
    const now = Date.now()
    if (now - this.lastSpawn < SPAWN_THROTTLE_MS) return
    this.lastSpawn = now
    try {
      // Desanexado de propósito: o hub precisa sobreviver ao fim desta sessão.
      // Se outro daemon já tem a porta, este sai sozinho com EADDRINUSE.
      const child = spawn(process.execPath, [join(this.opts.root, 'src', 'hub.ts')], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
    } catch {}
  }
}

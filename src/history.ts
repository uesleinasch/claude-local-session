import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { RegisterInfo } from './hub-state'
import { MAX_EVENTS, type FeedEvent } from './protocol'

const ROTATE_CHECK_EVERY = 200
const MAX_LINES = 1_000
const HYDRATE_MAX_AGE_MS = 48 * 60 * 60_000

type MetaLine = { kind: 'meta'; id: string; label: string; cwd: string; pid: number }
type Line = MetaLine | FeedEvent

export type PersistedSession = { info: RegisterInfo; events: FeedEvent[]; endedAt: number }

/**
 * Reproduz a semântica do Registry.push para permissões: o arquivo é
 * append-only, então cada atualização do card vira uma linha nova — na
 * leitura, a última versão de cada requestId vence, na posição da primeira.
 */
export function foldEvents(events: FeedEvent[]): FeedEvent[] {
  const out: FeedEvent[] = []
  const permAt = new Map<string, number>()
  for (const e of events) {
    if (e.kind === 'permission') {
      const at = permAt.get(e.requestId)
      if (at !== undefined) {
        out[at] = e
        continue
      }
      permAt.set(e.requestId, out.length)
    }
    out.push(e)
  }
  return out
}

function parseLines(raw: string): { meta: MetaLine | null; events: FeedEvent[] } {
  let meta: MetaLine | null = null
  const events: FeedEvent[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    const o = parsed as Line
    if (o.kind === 'meta') meta = o as MetaLine
    else events.push(o as FeedEvent)
  }
  return { meta, events: foldEvents(events).slice(-MAX_EVENTS) }
}

export class HistoryStore {
  private readonly appends = new Map<string, number>()

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }

  private fileFor(sessionId: string): string {
    return join(this.dir, `${sessionId.replace(/[^\w.-]/g, '_')}.jsonl`)
  }

  /** Toda falha é engolida: histórico é conveniência, o hub não pode cair por disco. */
  appendEvent(sessionId: string, event: FeedEvent): void {
    try {
      const file = this.fileFor(sessionId)
      appendFileSync(file, `${JSON.stringify(event)}\n`, { mode: 0o600 })
      const n = (this.appends.get(sessionId) ?? 0) + 1
      this.appends.set(sessionId, n)
      if (n % ROTATE_CHECK_EVERY === 0) this.rotate(file)
    } catch {}
  }

  appendMeta(info: RegisterInfo): void {
    const meta: MetaLine = {
      kind: 'meta',
      id: info.sessionId,
      label: info.label,
      cwd: info.cwd,
      pid: info.pid,
    }
    try {
      appendFileSync(this.fileFor(info.sessionId), `${JSON.stringify(meta)}\n`, { mode: 0o600 })
    } catch {}
  }

  /** Kill deliberado: sem isto, o hydrate do próximo boot ressuscitaria a sessão. */
  remove(sessionId: string): void {
    try {
      unlinkSync(this.fileFor(sessionId))
    } catch {}
    this.appends.delete(sessionId)
  }

  load(sessionId: string): FeedEvent[] {
    try {
      return parseLines(readFileSync(this.fileFor(sessionId), 'utf8')).events
    } catch {
      return []
    }
  }

  /** Sessões gravadas recentemente, para repovoar a lista após um restart do hub. */
  loadRecent(now = Date.now()): PersistedSession[] {
    const out: PersistedSession[] = []
    let names: string[]
    try {
      names = readdirSync(this.dir)
    } catch {
      return out
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      try {
        const file = join(this.dir, name)
        const mtime = statSync(file).mtimeMs
        if (now - mtime > HYDRATE_MAX_AGE_MS) continue
        const { meta, events } = parseLines(readFileSync(file, 'utf8'))
        if (!meta || events.length === 0) continue
        out.push({
          info: { sessionId: meta.id, label: meta.label, cwd: meta.cwd, pid: meta.pid },
          events,
          endedAt: mtime,
        })
      } catch {}
    }
    return out
  }

  private rotate(file: string): void {
    const raw = readFileSync(file, 'utf8')
    let lines = 0
    for (let i = 0; i < raw.length; i++) if (raw[i] === '\n') lines++
    if (lines <= MAX_LINES) return

    const { meta, events } = parseLines(raw)
    const head = meta ? `${JSON.stringify(meta)}\n` : ''
    const body = events.map(e => JSON.stringify(e)).join('\n')
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, `${head}${body}\n`, { mode: 0o600 })
    renameSync(tmp, file)
  }
}

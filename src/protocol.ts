export const DEFAULT_PORT = 7777
export const MAX_EVENTS = 200
export const IDLE_SHUTDOWN_MS = 60_000
export const DEAD_SESSION_TTL_MS = 10 * 60_000
export const HOOK_TIMEOUT_MS = 300

export type ActivityStatus = 'start' | 'end' | 'idle'
export type PermissionBehavior = 'allow' | 'deny'

export type FeedEvent =
  | { kind: 'prompt'; ts: number; text: string }
  | { kind: 'reply'; ts: number; text: string }
  | { kind: 'activity'; ts: number; tool: string; detail: string; status: ActivityStatus }
  | {
      kind: 'permission'
      ts: number
      requestId: string
      toolName: string
      description: string
      inputPreview: string
      preview?: string
      resolved?: PermissionBehavior
    }

export type SessionSummary = {
  id: string
  label: string
  cwd: string
  pid: number
  alive: boolean
  /** Turno em andamento: prompt/tool start liga, Stop hook ou interrupção desliga. */
  busy?: boolean
  endedAt?: number
}

export type SessionToHub =
  | { type: 'register'; sessionId: string; cwd: string; label: string; pid: number }
  | { type: 'reply'; text: string }
  | {
      type: 'permission_request'
      requestId: string
      toolName: string
      description: string
      inputPreview: string
    }

export type HubToSession =
  | { type: 'prompt'; text: string }
  | { type: 'permission_decision'; requestId: string; behavior: PermissionBehavior }

export type BrowserToHub =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'prompt'; sessionId: string; text: string }
  | {
      type: 'permission_decision'
      sessionId: string
      requestId: string
      behavior: PermissionBehavior
    }
  | { type: 'spawn'; dir: string }
  | { type: 'interrupt'; sessionId: string }
  | { type: 'kill'; sessionId: string }
  | { type: 'browse'; path: string }
  | { type: 'favorite'; path: string; on: boolean }

export type HubToBrowser =
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'history'; sessionId: string; events: FeedEvent[] }
  | { type: 'event'; sessionId: string; event: FeedEvent }
  | {
      type: 'config'
      projects: string[]
      canSpawn: boolean
      canInterrupt: boolean
      home?: string
    }
  | { type: 'dir'; path: string; parent: string | null; dirs: { name: string; path: string }[] }
  | { type: 'toast'; text: string }

export type ActivityPost = {
  sessionId: string
  tool: string
  detail: string
  status: ActivityStatus
  preview?: string
}

export function isPermissionBehavior(v: unknown): v is PermissionBehavior {
  return v === 'allow' || v === 'deny'
}

export function isActivityStatus(v: unknown): v is ActivityStatus {
  return v === 'start' || v === 'end' || v === 'idle'
}

export const MAX_PREVIEW = 4_000

export function parseActivityPost(raw: unknown): ActivityPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.sessionId !== 'string' || o.sessionId === '') return null
  if (!isActivityStatus(o.status)) return null
  const post: ActivityPost = {
    sessionId: o.sessionId,
    tool: typeof o.tool === 'string' ? o.tool : '',
    detail: typeof o.detail === 'string' ? o.detail : '',
    status: o.status,
  }
  if (typeof o.preview === 'string' && o.preview !== '') {
    post.preview = o.preview.slice(0, MAX_PREVIEW)
  }
  return post
}

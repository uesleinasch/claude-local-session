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
      /** Resolvido pelo auto mode do hub, sem toque humano. */
      auto?: boolean
    }
  | {
      kind: 'question'
      ts: number
      questionId: string
      questions: QuestionSpec[]
      /** Respostas por pergunta quando respondida; objeto vazio = cancelada. */
      resolved?: Record<string, string>
    }

export type SessionSummary = {
  id: string
  label: string
  cwd: string
  pid: number
  alive: boolean
  /** Turno em andamento: prompt/tool start liga, Stop hook ou interrupção desliga. */
  busy?: boolean
  /** Auto mode: o hub aprova sozinho os pedidos de permissão desta sessão. */
  auto?: boolean
  /** Há permissão ou pergunta esperando resposta humana. */
  waiting?: boolean
  /** Instante do último evento do feed — insumo do "ociosa há N min". */
  lastEventAt?: number
  /** Uso da janela de contexto, reportado pelo statusline. */
  context?: SessionContext
  /** Modelo ativo, reportado pelo statusline. */
  model?: SessionModel
  endedAt?: number
}

export type SessionContext = { pct: number; usedTokens?: number; maxTokens?: number }
export type SessionModel = { id: string; name: string }

export type ContextPost = {
  sessionId: string
  pct?: number
  usedTokens?: number
  maxTokens?: number
  model?: SessionModel
}

export const MODELS: { alias: string; name: string }[] = [
  { alias: 'fable', name: 'Fable 5' },
  { alias: 'opus', name: 'Opus 5' },
  { alias: 'sonnet', name: 'Sonnet 5' },
  { alias: 'haiku', name: 'Haiku 4.5' },
]

export function isModelAlias(v: unknown): boolean {
  return typeof v === 'string' && MODELS.some(m => m.alias === v)
}

function parseModel(raw: unknown): SessionModel | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id === '' || typeof o.name !== 'string' || o.name === '') {
    return undefined
  }
  return { id: o.id.slice(0, 60), name: o.name.slice(0, 40) }
}

export function parseContextPost(raw: unknown): ContextPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.sessionId !== 'string' || o.sessionId === '') return null
  const post: ContextPost = { sessionId: o.sessionId }
  if (typeof o.pct === 'number' && !Number.isNaN(o.pct)) {
    post.pct = Math.min(100, Math.max(0, o.pct))
    if (typeof o.usedTokens === 'number' && o.usedTokens >= 0) post.usedTokens = o.usedTokens
    if (typeof o.maxTokens === 'number' && o.maxTokens > 0) post.maxTokens = o.maxTokens
  }
  const model = parseModel(o.model)
  if (model) post.model = model
  if (post.pct === undefined && post.model === undefined) return null
  return post
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
  | { type: 'ping' }
  | { type: 'subscribe'; sessionId: string }
  | { type: 'prompt'; sessionId: string; text: string }
  | {
      type: 'permission_decision'
      sessionId: string
      requestId: string
      behavior: PermissionBehavior
    }
  | { type: 'answer'; sessionId: string; questionId: string; answers: QuestionAnswer[] }
  | { type: 'automode'; sessionId: string; on: boolean }
  | { type: 'setmodel'; sessionId: string; model: string }
  | { type: 'spawn'; dir: string }
  | { type: 'interrupt'; sessionId: string }
  | { type: 'kill'; sessionId: string }
  | { type: 'changes'; sessionId: string }
  | { type: 'browse'; path: string }
  | { type: 'favorite'; path: string; on: boolean }
  | { type: 'term_open'; dir: string; cols: number; rows: number }
  | { type: 'term_input'; text: string; enter?: boolean }
  | { type: 'term_key'; key: string }
  | { type: 'term_resize'; cols: number; rows: number }
  | { type: 'term_close' }
  | { type: 'term_kill' }

export type HubToBrowser =
  | { type: 'pong' }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'history'; sessionId: string; events: FeedEvent[] }
  | { type: 'event'; sessionId: string; event: FeedEvent }
  | {
      type: 'config'
      projects: string[]
      canSpawn: boolean
      canInterrupt: boolean
      canTerminal: boolean
      quickPrompts: string[]
      home?: string
    }
  | { type: 'dir'; path: string; parent: string | null; dirs: { name: string; path: string }[] }
  | { type: 'changes'; sessionId: string; ok: boolean; text: string }
  | { type: 'toast'; text: string }
  | { type: 'term_ready'; dir: string; seed: string; cols: number; rows: number }
  | { type: 'term_data'; data: string }
  | { type: 'term_exit'; reason: string }

export type QuestionOption = { label: string; description: string }

export type QuestionSpec = {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

export type QuestionPayload = {
  questionId: string
  questions?: QuestionSpec[]
  answers?: Record<string, string>
}

/** Resposta do navegador a uma pergunta: índices escolhidos e/ou texto do "Other". */
export type QuestionAnswer = { chosen: number[]; otherText?: string }

export type ActivityPost = {
  sessionId: string
  tool: string
  detail: string
  status: ActivityStatus
  preview?: string
  question?: QuestionPayload
}

export function isPermissionBehavior(v: unknown): v is PermissionBehavior {
  return v === 'allow' || v === 'deny'
}

export function isActivityStatus(v: unknown): v is ActivityStatus {
  return v === 'start' || v === 'end' || v === 'idle'
}

export const MAX_QUICK_PROMPTS = 8
const MAX_QUICK_PROMPT_LEN = 200

/** Atalhos do composer. Nenhum com efeito colateral: um toque acidental não pode commitar. */
export const DEFAULT_QUICK_PROMPTS = [
  'continuar',
  'rodar os testes',
  'explique o que você fez',
  'resuma o diff',
  'o que falta?',
]

export function parseQuickPrompts(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw
    .filter((p): p is string => typeof p === 'string')
    .map(p => p.trim().slice(0, MAX_QUICK_PROMPT_LEN))
    .filter(p => p !== '')
    .slice(0, MAX_QUICK_PROMPTS)
  return out.length > 0 ? out : null
}

export const MAX_PREVIEW = 4_000
export const MAX_QUESTIONS = 4
export const MAX_OPTIONS = 8

const clip = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v !== '' ? v.slice(0, max) : null

export function parseQuestionSpecs(raw: unknown): QuestionSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_QUESTIONS) return null
  const out: QuestionSpec[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null
    const q = item as Record<string, unknown>
    const question = clip(q.question, 500)
    const header = clip(q.header, 60)
    if (question === null || header === null) return null
    if (!Array.isArray(q.options) || q.options.length === 0 || q.options.length > MAX_OPTIONS) {
      return null
    }
    const options: QuestionOption[] = []
    for (const o of q.options) {
      const label = clip((o as Record<string, unknown>)?.label, 200)
      if (label === null) return null
      options.push({ label, description: clip((o as Record<string, unknown>)?.description, 500) ?? '' })
    }
    out.push({ question, header, options, multiSelect: q.multiSelect === true })
  }
  return out
}

function parseQuestionPayload(raw: unknown): QuestionPayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const questionId = clip(o.questionId, 200)
  if (questionId === null) return null
  const payload: QuestionPayload = { questionId }
  if (o.questions !== undefined) {
    const questions = parseQuestionSpecs(o.questions)
    if (questions === null) return null
    payload.questions = questions
  }
  if (typeof o.answers === 'object' && o.answers !== null) {
    const answers: Record<string, string> = {}
    for (const [k, v] of Object.entries(o.answers).slice(0, MAX_OPTIONS)) {
      if (typeof v === 'string') answers[k.slice(0, 500)] = v.slice(0, 1_000)
    }
    payload.answers = answers
  }
  return payload
}

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
  if (o.question !== undefined) {
    const question = parseQuestionPayload(o.question)
    if (question !== null) post.question = question
  }
  return post
}

import type { Server, ServerWebSocket } from 'bun'
import { execFile } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { configDir, loadConfig, readCookie, saveProjects, tokenMatches } from './config'
import { formatChanges } from './git-changes'
import { HistoryStore } from './history'
import { Registry, type Sink } from './hub-state'
import { Notifier, postToNtfy } from './notify'
import {
  DEFAULT_QUICK_PROMPTS,
  IDLE_SHUTDOWN_MS,
  isPermissionBehavior,
  isModelAlias,
  MAX_QUESTIONS,
  parseActivityPost,
  parseContextPost,
  parseQuickPrompts,
  type BrowserToHub,
  type HubToBrowser,
  type QuestionAnswer,
  type SessionToHub,
} from './protocol'
import { keySequenceFor, type KeyStep } from './question-keys'
import { MAX_UPLOAD_BYTES, sniffImage, uploadName } from './upload'
import { detectPluginIdentity, type PluginIdentity } from './setup-core'

const cfg = loadConfig()
const ROOT = join(import.meta.dir, '..')
const WEB_DIR = join(ROOT, 'web')

const store = new HistoryStore(join(configDir(), 'history'))
const notifier = new Notifier(cfg.notifyUrl === undefined ? null : postToNtfy(cfg.notifyUrl))
const registry = new Registry((sessionId, event) => {
  store.appendEvent(sessionId, event)
  void notifier.notify(labelOf(sessionId), event)
})

function labelOf(sessionId: string): string {
  return registry.summaries().find(s => s.id === sessionId)?.label ?? sessionId
}
for (const { info, events, endedAt } of store.loadRecent()) {
  registry.hydrateSession(info, events, endedAt)
}

function pluginIdentity(root: string): PluginIdentity | null {
  const fromPath = detectPluginIdentity(root)
  if (fromPath) return fromPath
  try {
    const mkt = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
    const plg = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
    if (typeof mkt?.name === 'string' && typeof plg?.name === 'string') {
      return { plugin: plg.name, marketplace: mkt.name }
    }
  } catch {}
  return null
}

const HOME = homedir()
const ROOTS = (cfg.projectsRoot ?? []).filter(p => typeof p === 'string' && p.startsWith('/'))
const IDENTITY = pluginIdentity(ROOT)
const HAS_TMUX = Bun.which('tmux') !== null
const CAN_SPAWN = HAS_TMUX && Bun.which('claude') !== null && IDENTITY !== null
const CAN_INTERRUPT = HAS_TMUX
const MAX_DIRS = 400
const QUICK_PROMPTS = parseQuickPrompts(cfg.quickPrompts) ?? DEFAULT_QUICK_PROMPTS

// Favoritos: persistidos como `projects` no config.json, editáveis pela página.
let favorites = (cfg.projects ?? []).filter(p => typeof p === 'string' && p.startsWith('/'))

/** Fronteira de navegação/spawn: a home do usuário e os projectsRoot do config. */
function allowedBase(path: string): boolean {
  if (path === HOME || path.startsWith(`${HOME}/`)) return true
  return ROOTS.some(root => path === root || path.startsWith(`${root}/`))
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function listDirs(path: string): { name: string; path: string }[] | null {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: join(path, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_DIRS)
  } catch {
    return null
  }
}

type WsData = { role: 'session' | 'browser' }
type Ws = ServerWebSocket<WsData>

const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/markdown.js': { file: 'markdown.js', type: 'text/javascript; charset=utf-8' },
  '/connection.js': { file: 'connection.js', type: 'text/javascript; charset=utf-8' },
  '/session-status.js': { file: 'session-status.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
}

function toast(ws: Ws, text: string): void {
  try {
    ws.send(JSON.stringify({ type: 'toast', text } satisfies HubToBrowser))
  } catch {}
}

const browserSockets = new Set<Ws>()

function configMsg(): string {
  return JSON.stringify({
    type: 'config',
    projects: favorites,
    canSpawn: CAN_SPAWN,
    canInterrupt: CAN_INTERRUPT,
    quickPrompts: QUICK_PROMPTS,
    home: HOME,
  } satisfies HubToBrowser)
}

// Favorito marcado num navegador aparece em todos os outros na hora.
function broadcastConfig(): void {
  for (const sock of browserSockets) {
    try {
      sock.send(configMsg())
    } catch {}
  }
}

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile(cmd, args, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }),
    )
  })
}

// Leitura pura do repositório da sessão: responde "o que ele mexeu?" sem exigir
// que a pessoa entre no terminal. `--` fecha a linha de comando contra um cwd
// que comece com hífen.
async function gitChanges(cwd: string): Promise<{ ok: boolean; text: string }> {
  const git = (...args: string[]) => run('git', ['-C', cwd, ...args])
  const inside = await git('rev-parse', '--is-inside-work-tree')
  if (!inside.ok || inside.out !== 'true') {
    return { ok: false, text: 'esta sessão não está num repositório git' }
  }
  const [status, stat, diff] = await Promise.all([
    git('status', '--short', '--untracked-files=all'),
    git('diff', '--stat', 'HEAD', '--'),
    git('diff', 'HEAD', '--'),
  ])
  return {
    ok: true,
    text: formatChanges({ status: status.out, stat: stat.out, diff: diff.out }),
  }
}

/** Env sem as variáveis de sessão do Claude: o hub pode ter herdado CLAUDE_*
 * de quem o spawnou, e elas contaminariam a sessão nova via ambiente do tmux. */
function cleanEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE') && k !== 'AI_AGENT'),
  )
}

// O claude é um app de TTY: sem terminal não há sessão interativa. O tmux dá o
// TTY e a sobrevivência — a sessão continua viva se o hub ou o navegador caírem.
async function spawnSession(dir: string): Promise<string | null> {
  if (!IDENTITY) return 'identidade do plugin desconhecida'
  const name = `ls-${basename(dir).replace(/[^\w-]/g, '_')}-${Date.now().toString(36)}`
  const args = [
    'new-session',
    '-d',
    '-s',
    name,
    '-c',
    dir,
    'claude',
    '--channels',
    `plugin:${IDENTITY.plugin}@${IDENTITY.marketplace}`,
  ]
  const res = await new Promise<{ ok: boolean; out: string }>(resolve => {
    execFile('tmux', args, { env: cleanEnv() }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }),
    )
  })
  return res.ok ? null : `tmux falhou: ${res.out}`
}

function ancestorsOf(pid: number): Set<number> {
  const out = new Set<number>()
  let cur = pid
  for (let i = 0; i < 25 && cur > 1; i++) {
    out.add(cur)
    try {
      // /proc/<pid>/stat: o ppid é o campo 4, contado após o ")" que fecha o comm.
      const stat = readFileSync(`/proc/${cur}/stat`, 'utf8')
      cur = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    } catch {
      break
    }
  }
  return out
}

async function findPane(
  pid: number,
): Promise<{ paneId: string; sessionName: string } | 'no-tmux' | 'not-found'> {
  const panes = await run('tmux', ['list-panes', '-a', '-F', '#{pane_pid} #{pane_id} #{session_name}'])
  if (!panes.ok) return 'no-tmux'
  const chain = ancestorsOf(pid)
  for (const line of panes.out.split('\n')) {
    const [panePid, paneId, sessionName] = line.split(' ')
    if (panePid && paneId && sessionName && chain.has(Number(panePid))) {
      return { paneId, sessionName }
    }
  }
  return 'not-found'
}

// Escape no pane onde o claude roda = o mesmo gesto que interrompe no terminal.
// Vale para qualquer sessão dentro de tmux, não só as spawnadas por aqui.
async function interruptSession(pid: number): Promise<string | null> {
  const pane = await findPane(pid)
  if (pane === 'no-tmux') return 'tmux indisponível para interromper'
  if (pane === 'not-found') return 'esta sessão não roda dentro de tmux — interrupção indisponível'
  const sent = await run('tmux', ['send-keys', '-t', pane.paneId, 'Escape'])
  return sent.ok ? null : 'falha ao enviar Escape para o tmux'
}

// O diálogo redesenha entre um passo e outro; tecla enviada cedo demais
// (ex.: Enter antes da tela de review) se perde — daí a pausa entre passos.
const ANSWER_STEP_DELAY_MS = 300

async function answerQuestion(pid: number, steps: KeyStep[]): Promise<string | null> {
  const pane = await findPane(pid)
  if (pane === 'no-tmux') return 'tmux indisponível para responder'
  if (pane === 'not-found') return 'esta sessão não roda dentro de tmux — responda pelo terminal'
  for (const step of steps) {
    const args =
      'text' in step
        ? ['send-keys', '-t', pane.paneId, '-l', '--', step.text]
        : ['send-keys', '-t', pane.paneId, step.key]
    const sent = await run('tmux', args)
    if (!sent.ok) return 'falha ao enviar teclas para o tmux'
    await Bun.sleep(ANSWER_STEP_DELAY_MS)
  }
  return null
}

// Digita `/model <alias>` no pane e confirma — o mesmo braço remoto do "parar".
// O Claude Code troca o modelo na hora (e o salva como default de novas sessões).
async function setSessionModel(pid: number, alias: string): Promise<string | null> {
  const pane = await findPane(pid)
  if (pane === 'no-tmux') return 'tmux indisponível para trocar o modelo'
  if (pane === 'not-found') return 'esta sessão não roda dentro de tmux — troque pelo terminal'
  const typed = await run('tmux', ['send-keys', '-t', pane.paneId, '-l', '--', `/model ${alias}`])
  if (!typed.ok) return 'falha ao enviar o comando para o tmux'
  await Bun.sleep(ANSWER_STEP_DELAY_MS)
  const sent = await run('tmux', ['send-keys', '-t', pane.paneId, 'Enter'])
  return sent.ok ? null : 'falha ao confirmar a troca de modelo'
}

function parseAnswers(raw: unknown): QuestionAnswer[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_QUESTIONS) return null
  const out: QuestionAnswer[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null
    const a = item as Record<string, unknown>
    if (!Array.isArray(a.chosen) || !a.chosen.every(n => typeof n === 'number')) return null
    const answer: QuestionAnswer = { chosen: a.chosen as number[] }
    if (typeof a.otherText === 'string') answer.otherText = a.otherText
    out.push(answer)
  }
  return out
}

function claudeAncestorOf(pid: number): number | null {
  let cur = pid
  for (let i = 0; i < 25 && cur > 1; i++) {
    try {
      if (readFileSync(`/proc/${cur}/comm`, 'utf8').trim() === 'claude') return cur
      const stat = readFileSync(`/proc/${cur}/stat`, 'utf8')
      cur = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    } catch {
      return null
    }
  }
  return null
}

async function killSession(pid: number): Promise<string | null> {
  const pane = await findPane(pid)
  if (typeof pane === 'object') {
    // '=' força match exato do nome: kill-session -t é prefix-match por padrão.
    const res = await run('tmux', ['kill-session', '-t', `=${pane.sessionName}`])
    return res.ok ? null : 'falha ao encerrar a sessão do tmux'
  }
  // Fora do tmux (inclusive sem servidor tmux nenhum): finaliza o claude
  // diretamente. O confirm do navegador é o guarda; o token já dá esse poder.
  const claudePid = claudeAncestorOf(pid)
  if (claudePid === null) return 'processo do claude não encontrado — encerre pelo terminal'
  try {
    process.kill(claudePid, 'SIGTERM')
    return null
  } catch {
    return 'falha ao finalizar o processo do claude'
  }
}

// 404 em vez de 401: uma resposta de "não autorizado" confirmaria que o serviço existe.
function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

function extractToken(req: Request, url: URL): string | null {
  return (
    url.searchParams.get('t') ??
    req.headers.get('x-ls-token') ??
    readCookie(req.headers.get('cookie'), 'ls_token')
  )
}

async function handleActivity(req: Request): Promise<Response> {
  if (req.method !== 'POST') return notFound()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const post = parseActivityPost(body)
  if (!post) return new Response('bad request', { status: 400 })
  // AskUserQuestion não entra na régua de atividade: o card de pergunta é o
  // próprio registro — start abre o card, end resolve com as respostas.
  if (post.question !== undefined) {
    if (post.status === 'start' && post.question.questions !== undefined) {
      registry.push(post.sessionId, {
        kind: 'question',
        ts: Date.now(),
        questionId: post.question.questionId,
        questions: post.question.questions,
      })
    } else if (post.status === 'end') {
      registry.resolveQuestion(post.sessionId, post.question.questionId, post.question.answers ?? {})
    }
    return new Response('ok')
  }
  // O preview não entra na régua de atividade — ele existe para enriquecer o
  // card de permissão da mesma tool, que chega pelo WebSocket da sessão.
  if (post.status === 'start' && post.preview !== undefined) {
    registry.notePreview(post.sessionId, post.tool, post.preview)
  }
  registry.push(post.sessionId, {
    kind: 'activity',
    ts: Date.now(),
    tool: post.tool,
    detail: post.detail,
    status: post.status,
  })
  return new Response('ok')
}

async function handleContext(req: Request): Promise<Response> {
  if (req.method !== 'POST') return notFound()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const post = parseContextPost(body)
  if (!post) return new Response('bad request', { status: 400 })
  registry.noteContext(post)
  return new Response('ok')
}

// O canal só carrega texto, então a foto vira arquivo em disco e o prompt cita
// o caminho — o Claude abre com Read como faria com qualquer arquivo do projeto.
async function handleUpload(req: Request, url: URL): Promise<Response> {
  if (req.method !== 'POST') return notFound()
  const raw = await req.arrayBuffer()
  if (raw.byteLength === 0 || raw.byteLength > MAX_UPLOAD_BYTES) {
    return new Response('bad request', { status: 400 })
  }
  const bytes = new Uint8Array(raw)
  const kind = sniffImage(bytes)
  if (kind === null) return new Response('bad request', { status: 400 })

  const dir = join(configDir(), 'uploads')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, uploadName(url.searchParams.get('session') ?? '', kind, Date.now()))
  writeFileSync(path, bytes, { mode: 0o600 })
  return Response.json({ path })
}

function onSessionMessage(ws: Ws, msg: SessionToHub): void {
  switch (msg.type) {
    case 'register': {
      if (typeof msg.sessionId !== 'string' || msg.sessionId === '') return
      const info = {
        sessionId: msg.sessionId,
        cwd: String(msg.cwd ?? ''),
        label: String(msg.label ?? msg.sessionId),
        pid: Number(msg.pid ?? 0),
      }
      registry.registerSession(ws as Sink, info)
      store.appendMeta(info)
      return
    }
    case 'reply': {
      const id = registry.sessionIdFor(ws as Sink)
      if (!id) return
      registry.push(id, { kind: 'reply', ts: Date.now(), text: String(msg.text ?? '') })
      return
    }
    case 'permission_request': {
      const id = registry.sessionIdFor(ws as Sink)
      if (!id || typeof msg.requestId !== 'string') return
      const auto = registry.isAuto(id)
      registry.push(id, {
        kind: 'permission',
        ts: Date.now(),
        requestId: msg.requestId,
        toolName: String(msg.toolName ?? ''),
        description: String(msg.description ?? ''),
        inputPreview: String(msg.inputPreview ?? ''),
        ...(auto ? { resolved: 'allow' as const, auto: true } : {}),
      })
      if (auto) {
        registry.toSession(id, {
          type: 'permission_decision',
          requestId: msg.requestId,
          behavior: 'allow',
        })
      }
      return
    }
  }
}

function onBrowserMessage(ws: Ws, msg: BrowserToHub): void {
  switch (msg.type) {
    case 'ping': {
      try {
        ws.send(JSON.stringify({ type: 'pong' } satisfies HubToBrowser))
      } catch {}
      return
    }
    case 'changes': {
      if (typeof msg.sessionId !== 'string') return
      const sessionId = msg.sessionId
      const s = registry.summaries().find(x => x.id === sessionId)
      if (!s || s.cwd === '') {
        toast(ws, 'não sei em que diretório essa sessão roda')
        return
      }
      void gitChanges(s.cwd).then(res => {
        try {
          ws.send(JSON.stringify({ type: 'changes', sessionId, ...res } satisfies HubToBrowser))
        } catch {}
      })
      return
    }
    case 'subscribe': {
      if (typeof msg.sessionId !== 'string') return
      registry.subscribe(ws as Sink, msg.sessionId)
      return
    }
    case 'prompt': {
      const text = String(msg.text ?? '').trim()
      if (text === '' || typeof msg.sessionId !== 'string') return
      if (!registry.toSession(msg.sessionId, { type: 'prompt', text })) return
      registry.push(msg.sessionId, { kind: 'prompt', ts: Date.now(), text })
      return
    }
    case 'permission_decision': {
      if (!isPermissionBehavior(msg.behavior)) return
      if (typeof msg.sessionId !== 'string' || typeof msg.requestId !== 'string') return
      const sent = registry.toSession(msg.sessionId, {
        type: 'permission_decision',
        requestId: msg.requestId,
        behavior: msg.behavior,
      })
      if (!sent) return
      registry.resolvePermission(msg.sessionId, msg.requestId, msg.behavior)
      return
    }
    case 'automode': {
      if (typeof msg.sessionId !== 'string' || typeof msg.on !== 'boolean') return
      if (!registry.setAuto(msg.sessionId, msg.on)) {
        toast(ws, 'sessão desconhecida')
        return
      }
      if (msg.on) {
        // Pedido parado esperando é justamente o que motiva ligar o auto agora.
        for (const requestId of registry.openPermissions(msg.sessionId)) {
          const sent = registry.toSession(msg.sessionId, {
            type: 'permission_decision',
            requestId,
            behavior: 'allow',
          })
          if (sent) registry.resolvePermission(msg.sessionId, requestId, 'allow', true)
        }
      }
      toast(ws, msg.on ? 'auto ligado — permissões desta sessão serão aprovadas' : 'auto desligado')
      return
    }
    case 'setmodel': {
      if (typeof msg.sessionId !== 'string' || !isModelAlias(msg.model)) return
      const s = registry.summaries().find(x => x.id === msg.sessionId)
      if (!s || !s.alive || s.pid <= 0) {
        toast(ws, 'sessão sem processo conhecido')
        return
      }
      void setSessionModel(s.pid, msg.model).then(err => {
        if (err) toast(ws, err)
      })
      return
    }
    case 'answer': {
      if (typeof msg.sessionId !== 'string' || typeof msg.questionId !== 'string') return
      const questions = registry.openQuestion(msg.sessionId, msg.questionId)
      if (!questions) {
        toast(ws, 'pergunta já respondida ou desconhecida')
        return
      }
      const s = registry.summaries().find(x => x.id === msg.sessionId)
      if (!s || !s.alive || s.pid <= 0) {
        toast(ws, 'sessão sem processo conhecido')
        return
      }
      const answers = parseAnswers(msg.answers)
      const steps = answers === null ? null : keySequenceFor(questions, answers)
      if (steps === null) {
        toast(ws, 'resposta inválida para esta pergunta')
        return
      }
      void answerQuestion(s.pid, steps).then(err => {
        if (err) toast(ws, err)
      })
      return
    }
    case 'spawn': {
      if (typeof msg.dir !== 'string') return
      const dir = resolve(msg.dir)
      if (!CAN_SPAWN || !allowedBase(dir) || !isDir(dir)) {
        toast(ws, 'diretório não autorizado para nova sessão')
        return
      }
      void spawnSession(dir).then(err => {
        if (err) toast(ws, err)
      })
      return
    }
    case 'browse': {
      if (typeof msg.path !== 'string') return
      const path = resolve(msg.path === '' ? HOME : msg.path)
      if (!allowedBase(path)) {
        toast(ws, 'fora da área permitida')
        return
      }
      const dirs = listDirs(path)
      if (dirs === null) {
        toast(ws, 'não consegui ler o diretório')
        return
      }
      const up = dirname(path)
      const parent = up !== path && allowedBase(up) ? up : null
      try {
        ws.send(JSON.stringify({ type: 'dir', path, parent, dirs } satisfies HubToBrowser))
      } catch {}
      return
    }
    case 'favorite': {
      if (typeof msg.path !== 'string' || typeof msg.on !== 'boolean') return
      const path = resolve(msg.path)
      if (!allowedBase(path)) {
        toast(ws, 'fora da área permitida')
        return
      }
      const has = favorites.includes(path)
      if (msg.on && !has) {
        if (!isDir(path)) {
          toast(ws, 'diretório inexistente')
          return
        }
        favorites = [...favorites, path].sort()
      } else if (!msg.on && has) {
        favorites = favorites.filter(p => p !== path)
      } else {
        return
      }
      saveProjects(favorites)
      broadcastConfig()
      return
    }
    case 'kill': {
      if (typeof msg.sessionId !== 'string') return
      const s = registry.summaries().find(x => x.id === msg.sessionId)
      if (!s) return
      const drop = () => {
        registry.dropSession(s.id)
        store.remove(s.id)
        toast(ws, `sessão ${s.label} encerrada`)
      }
      // Encerrada: só limpa da lista. Viva: mata o tmux antes; viva fora de
      // tmux é o terminal do usuário — recusar em vez de sumir com sessão ativa.
      if (!s.alive) {
        drop()
        return
      }
      if (s.pid <= 0) {
        toast(ws, 'sessão sem processo conhecido')
        return
      }
      void killSession(s.pid).then(err => (err ? toast(ws, err) : drop()))
      return
    }
    case 'interrupt': {
      if (typeof msg.sessionId !== 'string') return
      const s = registry.summaries().find(x => x.id === msg.sessionId)
      if (!s || !s.alive || s.pid <= 0) {
        toast(ws, 'sessão sem processo conhecido')
        return
      }
      void interruptSession(s.pid).then(err => {
        if (err) {
          toast(ws, err)
          return
        }
        // O turno morre no terminal sem produzir reply nem Stop hook — sem
        // isto a página não dá nenhum sinal de que a interrupção funcionou.
        toast(ws, 'turno interrompido')
        registry.push(msg.sessionId, {
          kind: 'activity',
          ts: Date.now(),
          tool: '',
          detail: '',
          status: 'idle',
        })
      })
      return
    }
  }
}

let server: Server<WsData>
try {
  server = Bun.serve<WsData, string>({
    port: cfg.port,
    hostname: '0.0.0.0',
    idleTimeout: 120,

    fetch(req, srv) {
      const url = new URL(req.url)
      if (!tokenMatches(cfg.token, extractToken(req, url))) return notFound()

      if (url.pathname === '/_ws') {
        const role = url.searchParams.get('role') === 'session' ? 'session' : 'browser'
        return srv.upgrade(req, { data: { role } }) ? undefined : notFound()
      }
      if (url.pathname === '/_upload') return handleUpload(req, url)
      if (url.pathname === '/_activity') return handleActivity(req)
      if (url.pathname === '/_context') return handleContext(req)

      const asset = STATIC[url.pathname]
      if (!asset) return notFound()
      const headers: Record<string, string> = {
        'content-type': asset.type,
        'cache-control': 'no-store',
      }
      if (url.pathname === '/') {
        headers['set-cookie'] =
          `ls_token=${cfg.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`
      }
      return new Response(Bun.file(join(WEB_DIR, asset.file)), { headers })
    },

    websocket: {
      open(ws: Ws) {
        if (ws.data.role === 'browser') {
          browserSockets.add(ws)
          registry.addBrowser(ws as Sink)
          try {
            ws.send(configMsg())
          } catch {}
        }
      },
      message(ws: Ws, raw) {
        let msg: unknown
        try {
          msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
        } catch {
          return
        }
        if (typeof msg !== 'object' || msg === null) return
        if (ws.data.role === 'session') onSessionMessage(ws, msg as SessionToHub)
        else onBrowserMessage(ws, msg as BrowserToHub)
      },
      close(ws: Ws) {
        if (ws.data.role === 'browser') {
          browserSockets.delete(ws)
          registry.removeBrowser(ws as Sink)
        } else {
          registry.removeSession(ws as Sink)
        }
      },
    },
  })
} catch {
  // Outra instância ganhou a porta na largada — o vencedor atende por todos.
  process.exit(0)
}

let lastAlive = Date.now()
setInterval(() => {
  registry.sweep()
  // Com spawn configurado, o hub é serviço permanente: matar a última sessão
  // pelo navegador não pode derrubar justamente quem permite criar a próxima.
  // Navegador conectado também segura — fechar tudo com alguém olhando o
  // histórico derrubaria a página no meio da leitura.
  if (registry.hasAlive() || registry.hasBrowsers() || CAN_SPAWN) {
    lastAlive = Date.now()
    return
  }
  if (Date.now() - lastAlive > IDLE_SHUTDOWN_MS) {
    server.stop(true)
    process.exit(0)
  }
}, 15_000)

process.stderr.write(`local-session hub: :${cfg.port}\n`)

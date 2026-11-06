import type { Server, ServerWebSocket } from 'bun'
import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { cp, readdir } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  configDir,
  lanAddress,
  loadConfig,
  readCookie,
  saveProjects,
  tailscaleAddress,
  tokenMatches,
} from './config'
import { montarDescoberta } from './endpoints'
import {
  contentDisposition,
  copyTarget,
  findDirs,
  insideBase,
  isWithin,
  validName,
  type DirChild,
} from './files'
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
import { probeTailscale, resolveState } from './tailscale'
import { dirIsTrusted, isTrustPrompt, TRUST_KEYS } from './trust'
import {
  clampCols,
  clampRows,
  isTermKey,
  MAX_TERM_INPUT,
  Terminals,
  type TermListener,
} from './terminal'
import { MAX_UPLOAD_BYTES, sniffImage, uploadName } from './upload'
import { isStandalone, pluginRoot } from './cli-core'
import { BUILT_VERSION, installedVersion, pluginMismatch } from './plugin-meta'
import { detectPluginIdentity, type PluginIdentity } from './setup-core'
import { assetPath } from './web-assets'

const cfg = loadConfig()
const ROOT = pluginRoot({
  standalone: isStandalone(Bun.main),
  moduleDir: import.meta.dir,
  execPath: process.execPath,
  env: process.env.LOCAL_SESSION_ROOT,
})

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
const CAN_TERMINAL = HAS_TMUX && Bun.which('mkfifo') !== null
const MAX_DIRS = 400
const QUICK_PROMPTS = parseQuickPrompts(cfg.quickPrompts) ?? DEFAULT_QUICK_PROMPTS

// Favoritos: persistidos como `projects` no config.json, editáveis pela página.
let favorites = (cfg.projects ?? []).filter(p => typeof p === 'string' && p.startsWith('/'))

function realPath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

const BASES = [HOME, ...ROOTS].map(p => realPath(p) ?? p)

/** Fronteira de navegação/spawn/arquivos: a home do usuário e os projectsRoot do config. */
function allowedBase(path: string): boolean {
  const real = realPath(path)
  return real !== null && insideBase(real, BASES)
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

type Listing = Pick<Extract<HubToBrowser, { type: 'dir' }>, 'dirs' | 'files'>

function listEntries(path: string): Listing | null {
  try {
    const entries = readdirSync(path, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && (e.isDirectory() || e.isFile()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_DIRS)
    const out: Listing = { dirs: [], files: [] }
    for (const e of entries) {
      const full = join(path, e.name)
      try {
        const st = statSync(full)
        if (e.isDirectory()) out.dirs.push({ name: e.name, path: full, mtime: st.mtimeMs })
        else out.files.push({ name: e.name, path: full, size: st.size, mtime: st.mtimeMs })
      } catch {}
    }
    return out
  } catch {
    return null
  }
}

function sendDir(ws: Ws, path: string): void {
  const listing = listEntries(path)
  if (listing === null) {
    toast(ws, 'não consegui ler o diretório')
    return
  }
  const up = dirname(path)
  const parent = up !== path && allowedBase(up) ? up : null
  toBrowser(ws, { type: 'dir', path, parent, ...listing })
}

const FIND_BUDGET_MS = 1500
const MAX_QUERY = 100

async function readChildren(path: string): Promise<DirChild[] | null> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }))
  } catch {
    return null
  }
}

async function findFor(ws: Ws, root: string, query: string, seq: number): Promise<void> {
  const real = realPath(root)
  if (real === null || !insideBase(real, BASES) || !isDir(real)) {
    toast(ws, 'fora da área permitida')
    return
  }
  const { results, truncated } = await findDirs(real, query, readChildren, {
    deadline: Date.now() + FIND_BUDGET_MS,
  })
  toBrowser(ws, { type: 'found', root, query, seq, results, truncated })
}

const MAX_COPIES = 2
let copying = 0

async function copyEntry(ws: Ws, from: string, to: string): Promise<void> {
  const realFrom = realPath(from)
  const realTo = realPath(to)
  if (realFrom === null || realTo === null || !insideBase(realFrom, BASES) || !insideBase(realTo, BASES)) {
    toast(ws, 'fora da área permitida')
    return
  }
  if (!isDir(realTo)) {
    toast(ws, 'o destino não é uma pasta')
    return
  }
  if (isWithin(realTo, realFrom)) {
    toast(ws, 'não dá para copiar uma pasta para dentro dela')
    return
  }
  const name = copyTarget(basename(realFrom), n => existsSync(join(realTo, n)))
  if (name === null) {
    toast(ws, 'cópias demais com esse nome')
    return
  }
  if (copying >= MAX_COPIES) {
    toast(ws, 'já há cópias em andamento — espere terminar')
    return
  }
  copying++
  toast(ws, `copiando ${basename(realFrom)}…`)
  try {
    await cp(realFrom, join(realTo, name), {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    })
    toast(ws, `copiado como ${name}`)
  } catch {
    toast(ws, `a cópia de ${basename(realFrom)} falhou`)
  } finally {
    copying--
    broadcastBrowsers({ type: 'dir_changed', path: to })
  }
}

type WsData = { role: 'session' | 'browser' }
type Ws = ServerWebSocket<WsData>

// `immutable` só para o que é biblioteca de terceiros com versão no endereço:
// são centenas de KB que não podem viajar de novo a cada refresh pelo celular.
const STATIC: Record<string, { file: string; type: string; immutable?: true }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/markdown.js': { file: 'markdown.js', type: 'text/javascript; charset=utf-8' },
  '/connection.js': { file: 'connection.js', type: 'text/javascript; charset=utf-8' },
  '/browse-core.js': { file: 'browse-core.js', type: 'text/javascript; charset=utf-8' },
  '/session-status.js': { file: 'session-status.js', type: 'text/javascript; charset=utf-8' },
  '/terminal-panel.js': { file: 'terminal-panel.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
  '/tokens.css': { file: 'tokens.css', type: 'text/css; charset=utf-8' },
  '/icons.svg': { file: 'icons.svg', type: 'image/svg+xml; charset=utf-8' },
  '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml; charset=utf-8' },
  '/fonts/inter-latin-opsz-normal.woff2': {
    file: 'fonts/inter-latin-opsz-normal.woff2',
    type: 'font/woff2',
    immutable: true,
  },
  '/vendor/xterm.js': {
    file: 'vendor/xterm.js',
    type: 'text/javascript; charset=utf-8',
    immutable: true,
  },
  '/vendor/addon-fit.js': {
    file: 'vendor/addon-fit.js',
    type: 'text/javascript; charset=utf-8',
    immutable: true,
  },
  '/vendor/xterm.css': { file: 'vendor/xterm.css', type: 'text/css; charset=utf-8', immutable: true },
}

function toast(ws: Ws, text: string): void {
  try {
    ws.send(JSON.stringify({ type: 'toast', text } satisfies HubToBrowser))
  } catch {}
}

const browserSockets = new Set<Ws>()

const OUTDATED = pluginMismatch(BUILT_VERSION, installedVersion(ROOT))

function configMsg(): string {
  return JSON.stringify({
    type: 'config',
    projects: favorites,
    canSpawn: CAN_SPAWN,
    canTerminal: CAN_TERMINAL,
    quickPrompts: QUICK_PROMPTS,
    home: HOME,
    ...(OUTDATED ? { outdated: OUTDATED } : {}),
  } satisfies HubToBrowser)
}

function broadcastBrowsers(msg: HubToBrowser): void {
  for (const sock of browserSockets) toBrowser(sock, msg)
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
async function gitChanges(cwd: string): Promise<{ ok: boolean; text: string; branch?: string }> {
  const git = (...args: string[]) => run('git', ['-C', cwd, ...args])
  const inside = await git('rev-parse', '--is-inside-work-tree')
  if (!inside.ok || inside.out !== 'true') {
    return { ok: false, text: 'esta sessão não está num repositório git' }
  }
  const [status, stat, diff, branch] = await Promise.all([
    git('status', '--short', '--untracked-files=all'),
    git('diff', '--stat', 'HEAD', '--'),
    git('diff', 'HEAD', '--'),
    git('rev-parse', '--abbrev-ref', 'HEAD'),
  ])
  return {
    ok: true,
    text: formatChanges({ status: status.out, stat: stat.out, diff: diff.out }),
    ...(branch.ok && branch.out !== '' ? { branch: branch.out } : {}),
  }
}

/** Env sem as variáveis de sessão do Claude: o hub pode ter herdado CLAUDE_*
 * de quem o spawnou, e elas contaminariam a sessão nova via ambiente do tmux. */
function cleanEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE') && k !== 'AI_AGENT'),
  )
}

const terminals = new Terminals(cleanEnv())

/** Terminal que cada navegador assiste — no máximo um painel aberto por socket. */
const watching = new Map<Ws, { dir: string; listener: TermListener }>()

/** Teto do que fica represado entre o `attach` e o `term_ready` do navegador. */
const MAX_PENDING_TERM_BYTES = 256 * 1024

function toBrowser(ws: Ws, msg: HubToBrowser): void {
  try {
    ws.send(JSON.stringify(msg))
  } catch {}
}

function stopWatching(ws: Ws): void {
  const w = watching.get(ws)
  if (!w) return
  watching.delete(ws)
  void terminals.detach(w.dir, w.listener)
}

function openTerminal(ws: Ws, dir: string, size: { cols: number; rows: number }): void {
  stopWatching(ws)
  // A saída do tmux já corre antes da foto ficar pronta; sem represar, o
  // navegador receberia bytes novos antes do seed e o xterm os perderia.
  let ready = false
  let pending: string[] = []
  let pendingBytes = 0
  const listener: TermListener = {
    data: text => {
      if (ready) {
        toBrowser(ws, { type: 'term_data', data: text })
        return
      }
      pendingBytes += text.length
      if (pendingBytes <= MAX_PENDING_TERM_BYTES) pending.push(text)
    },
    exit: reason => {
      watching.delete(ws)
      toBrowser(ws, { type: 'term_exit', reason })
    },
  }
  watching.set(ws, { dir, listener })

  void terminals.attach(dir, size, listener).then(res => {
    if (!res.ok) {
      watching.delete(ws)
      toBrowser(ws, { type: 'term_exit', reason: res.error })
      return
    }
    toBrowser(ws, { type: 'term_ready', dir, seed: res.seed, cols: res.cols, rows: res.rows })
    ready = true
    for (const chunk of pending) toBrowser(ws, { type: 'term_data', data: chunk })
    pending = []
  })
}

// O claude é um app de TTY: sem terminal não há sessão interativa. O tmux dá o
// TTY e a sobrevivência — a sessão continua viva se o hub ou o navegador caírem.
async function spawnSession(dir: string): Promise<{ name: string } | { error: string }> {
  if (!IDENTITY) return { error: 'identidade do plugin desconhecida' }
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
  return res.ok ? { name } : { error: `tmux falhou: ${res.out}` }
}

const TRUST_WAIT_MS = 30_000
const TRUST_POLL_MS = 500

async function paneOfSession(name: string): Promise<string | null> {
  const panes = await run('tmux', ['list-panes', '-a', '-F', '#{pane_id} #{session_name}'])
  if (!panes.ok) return null
  for (const line of panes.out.split('\n')) {
    const [paneId, sessionName] = line.split(' ')
    if (paneId !== undefined && sessionName === name) return paneId
  }
  return null
}

/**
 * O diálogo de confiança leva alguns segundos para ser desenhado e some sozinho
 * se a pasta já era confiada — por isso o laço espera a tela mostrar o diálogo
 * em vez de mandar as teclas de uma vez. Sem essa checagem, um Enter às cegas
 * cairia no prompt de uma sessão já pronta.
 */
async function acceptTrustPrompt(sessionName: string): Promise<void> {
  const deadline = Date.now() + TRUST_WAIT_MS
  while (Date.now() < deadline) {
    const paneId = await paneOfSession(sessionName)
    if (paneId !== null) {
      const screen = await run('tmux', ['capture-pane', '-p', '-t', paneId])
      if (screen.ok && isTrustPrompt(screen.out)) {
        for (const key of TRUST_KEYS) {
          await run('tmux', ['send-keys', '-t', paneId, key])
          await Bun.sleep(ANSWER_STEP_DELAY_MS)
        }
        return
      }
    }
    await Bun.sleep(TRUST_POLL_MS)
  }
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

const DESCOBERTA_TTL_MS = 30_000
let descobertaCache: { ate: number; corpo: string } | null = null

/**
 * O app dispara esta rota em todos os candidatos de uma vez para ver quem
 * responde primeiro, e cada resposta custa um `tailscale status` em subprocesso:
 * sem o cache, uma abertura do celular spawna um processo por endereço.
 */
async function handleEndpoints(): Promise<Response> {
  const agora = Date.now()
  if (descobertaCache === null || agora > descobertaCache.ate) {
    const tailscale = resolveState(await probeTailscale(), tailscaleAddress())
    const corpo = JSON.stringify(
      montarDescoberta({
        versao: BUILT_VERSION,
        porta: cfg.port,
        lan: await lanAddress(),
        tailscale: tailscale?.kind === 'running' ? tailscale.host : null,
        hostname: hostname(),
        ntfy: cfg.notifyUrl,
      }),
    )
    descobertaCache = { ate: agora + DESCOBERTA_TTL_MS, corpo }
  }
  return new Response(descobertaCache.corpo, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
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
  if (post.terminalPrompt !== undefined) {
    registry.mirrorTerminalPrompt(post.sessionId, post.terminalPrompt)
    return new Response('ok')
  }
  if (post.terminalReply !== undefined) {
    registry.mirrorTerminalReply(post.sessionId, post.terminalReply)
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
function handleDownload(req: Request, url: URL): Response {
  if (req.method !== 'GET') return notFound()
  const asked = url.searchParams.get('path')
  if (asked === null || !asked.startsWith('/')) return notFound()
  const real = realPath(resolve(asked))
  if (real === null || !insideBase(real, BASES)) return notFound()
  try {
    if (!statSync(real).isFile()) return notFound()
  } catch {
    return notFound()
  }
  // octet-stream + nosniff: um .html do disco renderizado nesta origem rodaria com o token.
  return new Response(Bun.file(real), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': contentDisposition(basename(resolve(asked))),
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  })
}

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
      void findPane(info.pid).then(pane => registry.setTmux(info.sessionId, typeof pane === 'object'))
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
      // Sessão nova nasce detached: se a pasta ainda não passou pelo diálogo de
      // confiança, o claude para nele e ninguém responde — nada registra no hub
      // e a página fica sem a sessão. Confirmar é decisão de quem está lá.
      const trusted = dirIsTrusted(dir)
      if (!trusted && msg.trust !== true) {
        toBrowser(ws, { type: 'spawn_trust', dir })
        return
      }
      void spawnSession(dir).then(res => {
        if ('error' in res) {
          toast(ws, res.error)
          return
        }
        if (!trusted) void acceptTrustPrompt(res.name)
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
      sendDir(ws, path)
      return
    }
    case 'mkdir': {
      if (typeof msg.parent !== 'string' || typeof msg.name !== 'string') return
      const parent = resolve(msg.parent)
      if (!allowedBase(parent) || !isDir(parent)) {
        toast(ws, 'fora da área permitida')
        return
      }
      if (!validName(msg.name)) {
        toast(ws, 'nome inválido')
        return
      }
      try {
        mkdirSync(join(parent, msg.name))
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        toast(ws, code === 'EEXIST' ? 'já existe um item com esse nome' : 'não consegui criar a pasta')
        return
      }
      sendDir(ws, parent)
      broadcastBrowsers({ type: 'dir_changed', path: parent })
      return
    }
    case 'find': {
      if (typeof msg.root !== 'string' || typeof msg.query !== 'string') return
      const query = msg.query.trim()
      if (query.length < 2 || query.length > MAX_QUERY) return
      const seq = typeof msg.seq === 'number' ? msg.seq : 0
      void findFor(ws, resolve(msg.root), query, seq)
      return
    }
    case 'copy': {
      if (typeof msg.from !== 'string' || typeof msg.to !== 'string') return
      void copyEntry(ws, resolve(msg.from), resolve(msg.to))
      return
    }
    case 'favorite': {
      if (typeof msg.path !== 'string' || typeof msg.on !== 'boolean') return
      const path = resolve(msg.path)
      const has = favorites.includes(path)
      if (msg.on && !has) {
        if (!allowedBase(path)) {
          toast(ws, 'fora da área permitida')
          return
        }
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
    case 'term_open': {
      if (typeof msg.dir !== 'string') return
      if (!CAN_TERMINAL) {
        toast(ws, 'tmux indisponível — terminal desligado nesta máquina')
        return
      }
      const dir = resolve(msg.dir)
      if (!allowedBase(dir) || !isDir(dir)) {
        toast(ws, 'diretório não autorizado para terminal')
        return
      }
      openTerminal(ws, dir, { cols: clampCols(msg.cols), rows: clampRows(msg.rows) })
      return
    }
    case 'term_input': {
      const w = watching.get(ws)
      if (!w) return
      const text = String(msg.text ?? '').slice(0, MAX_TERM_INPUT)
      const enter = msg.enter === true
      if (text === '' && !enter) return
      void terminals.write(w.dir, text, enter).then(err => {
        if (err) toast(ws, err)
      })
      return
    }
    case 'term_key': {
      const w = watching.get(ws)
      if (!w || !isTermKey(msg.key)) return
      void terminals.key(w.dir, msg.key).then(err => {
        if (err) toast(ws, err)
      })
      return
    }
    case 'term_resize': {
      const w = watching.get(ws)
      if (!w) return
      void terminals.resize(w.dir, { cols: clampCols(msg.cols), rows: clampRows(msg.rows) })
      return
    }
    case 'term_close': {
      stopWatching(ws)
      return
    }
    case 'term_kill': {
      const w = watching.get(ws)
      if (!w) return
      void terminals.kill(w.dir).then(err => {
        if (err) toast(ws, err)
      })
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
function startServer(): void {
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
        if (url.pathname === '/_endpoints') return handleEndpoints()
        if (url.pathname === '/_upload') return handleUpload(req, url)
        if (url.pathname === '/_download') return handleDownload(req, url)
        if (url.pathname === '/_activity') return handleActivity(req)
        if (url.pathname === '/_context') return handleContext(req)

        const asset = STATIC[url.pathname]
        if (!asset) return notFound()
        const file = assetPath(asset.file)
        if (file === null) return notFound()
        const headers: Record<string, string> = {
          'content-type': asset.type,
          'cache-control': asset.immutable
            ? 'private, max-age=31536000, immutable'
            : 'no-store',
        }
        if (url.pathname === '/') {
          headers['set-cookie'] =
            `ls_token=${cfg.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`
        }
        return new Response(Bun.file(file), { headers })
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
            stopWatching(ws)
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
}

function watchIdle(): void {
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
}

export function main(): void {
  startServer()
  watchIdle()
  process.stderr.write(`local-session hub: :${cfg.port}\n`)
}

if (import.meta.main) main()

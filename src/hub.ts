import type { Server, ServerWebSocket } from 'bun'
import { execFile } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { configDir, loadConfig, readCookie, tokenMatches } from './config'
import { HistoryStore } from './history'
import { Registry, type Sink } from './hub-state'
import {
  IDLE_SHUTDOWN_MS,
  isPermissionBehavior,
  parseActivityPost,
  type BrowserToHub,
  type HubToBrowser,
  type SessionToHub,
} from './protocol'
import { detectPluginIdentity, type PluginIdentity } from './setup-core'

const cfg = loadConfig()
const ROOT = join(import.meta.dir, '..')
const WEB_DIR = join(ROOT, 'web')

const store = new HistoryStore(join(configDir(), 'history'))
const registry = new Registry((sessionId, event) => store.appendEvent(sessionId, event))
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

const PROJECTS = (cfg.projects ?? []).filter(p => typeof p === 'string' && p.startsWith('/'))
const ROOTS = (cfg.projectsRoot ?? []).filter(p => typeof p === 'string' && p.startsWith('/'))
const IDENTITY = pluginIdentity(ROOT)
const HAS_TMUX = Bun.which('tmux') !== null
const CAN_SPAWN =
  HAS_TMUX &&
  Bun.which('claude') !== null &&
  IDENTITY !== null &&
  (PROJECTS.length > 0 || ROOTS.length > 0)
const CAN_INTERRUPT = HAS_TMUX

/**
 * Recalculado a cada uso: um repositório clonado depois do boot do hub já
 * aparece como opção. O navegador só escolhe dentro desta lista — nunca envia
 * caminho arbitrário.
 */
function projectDirs(): string[] {
  const out = new Set<string>(PROJECTS)
  for (const root of ROOTS) {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) out.add(join(root, entry.name))
      }
    } catch {}
  }
  return [...out].sort()
}

type WsData = { role: 'session' | 'browser' }
type Ws = ServerWebSocket<WsData>

const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/markdown.js': { file: 'markdown.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
}

function toast(ws: Ws, text: string): void {
  try {
    ws.send(JSON.stringify({ type: 'toast', text } satisfies HubToBrowser))
  } catch {}
}

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile(cmd, args, (err, stdout, stderr) =>
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }),
    )
  })
}

// O claude é um app de TTY: sem terminal não há sessão interativa. O tmux dá o
// TTY e a sobrevivência — a sessão continua viva se o hub ou o navegador caírem.
async function spawnSession(dir: string): Promise<string | null> {
  if (!IDENTITY) return 'identidade do plugin desconhecida'
  const name = `ls-${basename(dir).replace(/[^\w-]/g, '_')}-${Date.now().toString(36)}`
  const res = await run('tmux', [
    'new-session',
    '-d',
    '-s',
    name,
    '-c',
    dir,
    'claude',
    '--channels',
    `plugin:${IDENTITY.plugin}@${IDENTITY.marketplace}`,
  ])
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

// Escape no pane onde o claude roda = o mesmo gesto que interrompe no terminal.
// Vale para qualquer sessão dentro de tmux, não só as spawnadas por aqui.
async function interruptSession(pid: number): Promise<string | null> {
  const panes = await run('tmux', ['list-panes', '-a', '-F', '#{pane_pid} #{pane_id}'])
  if (!panes.ok) return 'tmux indisponível para interromper'
  const chain = ancestorsOf(pid)
  for (const line of panes.out.split('\n')) {
    const [panePid, paneId] = line.split(' ')
    if (panePid && paneId && chain.has(Number(panePid))) {
      const sent = await run('tmux', ['send-keys', '-t', paneId, 'Escape'])
      return sent.ok ? null : 'falha ao enviar Escape para o tmux'
    }
  }
  return 'esta sessão não roda dentro de tmux — interrupção indisponível'
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
      registry.push(id, {
        kind: 'permission',
        ts: Date.now(),
        requestId: msg.requestId,
        toolName: String(msg.toolName ?? ''),
        description: String(msg.description ?? ''),
        inputPreview: String(msg.inputPreview ?? ''),
      })
      return
    }
  }
}

function onBrowserMessage(ws: Ws, msg: BrowserToHub): void {
  switch (msg.type) {
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
    case 'spawn': {
      if (typeof msg.dir !== 'string') return
      // Allowlist por igualdade exata: o browser escolhe entre os projetos
      // declarados em config.json, nunca envia um caminho arbitrário.
      if (!CAN_SPAWN || !projectDirs().includes(msg.dir)) {
        toast(ws, 'diretório não autorizado para nova sessão')
        return
      }
      void spawnSession(msg.dir).then(err => {
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
        if (err) toast(ws, err)
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
      if (url.pathname === '/_activity') return handleActivity(req)

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
          registry.addBrowser(ws as Sink)
          try {
            ws.send(
              JSON.stringify({
                type: 'config',
                projects: CAN_SPAWN ? projectDirs() : [],
                canSpawn: CAN_SPAWN,
                canInterrupt: CAN_INTERRUPT,
              } satisfies HubToBrowser),
            )
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
        if (ws.data.role === 'browser') registry.removeBrowser(ws as Sink)
        else registry.removeSession(ws as Sink)
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
  if (registry.hasAlive()) {
    lastAlive = Date.now()
    return
  }
  if (Date.now() - lastAlive > IDLE_SHUTDOWN_MS) {
    server.stop(true)
    process.exit(0)
  }
}, 15_000)

process.stderr.write(`local-session hub: :${cfg.port}\n`)

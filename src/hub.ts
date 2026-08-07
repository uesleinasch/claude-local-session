import type { Server, ServerWebSocket } from 'bun'
import { join } from 'node:path'
import { loadConfig, readCookie, tokenMatches } from './config'
import { Registry, type Sink } from './hub-state'
import {
  IDLE_SHUTDOWN_MS,
  isPermissionBehavior,
  parseActivityPost,
  type BrowserToHub,
  type SessionToHub,
} from './protocol'

const cfg = loadConfig()
const registry = new Registry()
const WEB_DIR = join(import.meta.dir, '..', 'web')

type WsData = { role: 'session' | 'browser' }
type Ws = ServerWebSocket<WsData>

const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'style.css', type: 'text/css; charset=utf-8' },
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
      registry.registerSession(ws as Sink, {
        sessionId: msg.sessionId,
        cwd: String(msg.cwd ?? ''),
        label: String(msg.label ?? msg.sessionId),
        pid: Number(msg.pid ?? 0),
      })
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
        if (ws.data.role === 'browser') registry.addBrowser(ws as Sink)
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

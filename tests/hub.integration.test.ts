import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Subprocess } from 'bun'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config'
import type { Descoberta } from '../src/endpoints'
import { BUILT_VERSION } from '../src/plugin-meta'

let dir: string
let port: number
let token: string
let hub: Subprocess

/** ntfy de mentira: recebe os pushes do hub para que o teste os inspecione. */
type Push = { topic: string; title: string; message: string }
let notifyServer: ReturnType<typeof Bun.serve>
const pushes: Push[] = []

async function waitFor(pred: () => boolean, ms = 4000): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (pred()) return
    await Bun.sleep(25)
  }
  throw new Error('timeout esperando a condição')
}

function base(): string {
  return `http://127.0.0.1:${port}`
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') })
  const found = probe.port
  probe.stop(true)
  if (found === undefined) throw new Error('não consegui descobrir uma porta livre')
  return found
}

async function waitReady(timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base()}/?t=${token}`)
      if (res.ok) return
    } catch {}
    await Bun.sleep(50)
  }
  throw new Error('hub não subiu a tempo')
}

type Collector = {
  socket: WebSocket
  wait(pred: (m: any) => boolean, ms?: number): Promise<any>
  seen(): any[]
}

async function connect(role: 'session' | 'browser'): Promise<Collector> {
  const query = role === 'session' ? `?role=session&t=${token}` : `?t=${token}`
  const socket = new WebSocket(`ws://127.0.0.1:${port}/_ws${query}`)
  const messages: any[] = []
  const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = []

  socket.onmessage = ev => {
    const msg = JSON.parse(String(ev.data))
    messages.push(msg)
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.pred(msg)) {
        waiters[i]!.resolve(msg)
        waiters.splice(i, 1)
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`websocket ${role} falhou`))
  })

  return {
    socket,
    seen: () => messages,
    wait(pred, ms = 4000) {
      const found = messages.find(pred)
      if (found) return Promise.resolve(found)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout esperando mensagem')), ms)
        waiters.push({
          pred,
          resolve: m => {
            clearTimeout(timer)
            resolve(m)
          },
        })
      })
    },
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ls-hub-'))
  const cfg = loadConfig(dir)
  token = cfg.token

  notifyServer = Bun.serve({
    port: 0,
    async fetch(req) {
      pushes.push((await req.json()) as Push)
      return new Response('ok')
    },
  })
  // Sem projectsRoot a fronteira do hub é a home de verdade, e os diretórios
  // temporários deste teste ficariam de fora do que ele aceita abrir.
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({
      ...cfg,
      notifyUrl: `http://127.0.0.1:${notifyServer.port}/avisos`,
      projectsRoot: [tmpdir()],
    }),
  )

  port = await freePort()
  hub = Bun.spawn(['bun', join(import.meta.dir, '..', 'src', 'hub.ts')], {
    env: { ...process.env, LOCAL_SESSION_DIR: dir, LOCAL_SESSION_PORT: String(port) },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await waitReady()
})

afterAll(() => {
  hub?.kill()
  notifyServer?.stop(true)
  rmSync(dir, { recursive: true, force: true })
})

describe('gate de token', () => {
  test('serve a página com token e devolve o cookie', async () => {
    const res = await fetch(`${base()}/?t=${token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('ls_token=')
    expect(await res.text()).toContain('Local Session')
  })

  test('aceita o cookie no lugar da query', async () => {
    const res = await fetch(`${base()}/app.js`, { headers: { cookie: `ls_token=${token}` } })
    expect(res.status).toBe(200)
  })

  /**
   * A allowlist de estáticos do hub é escrita à mão: um arquivo novo no `web/`
   * carrega na página do dev (que já tem tudo em cache) e dá 404 no celular.
   * Por isso a lista sai do próprio HTML, não de um rol repetido aqui.
   */
  test('serve tudo que a página pede, senão ela carrega pela metade', async () => {
    const webDir = join(import.meta.dir, '..', 'web')
    const html = readFileSync(join(webDir, 'index.html'), 'utf8')
    const wanted = new Set(
      [...html.matchAll(/(?:src|href)="(\/[^"#]+)/g)].map(m => m[1]!).filter(p => p !== '/'),
    )
    for (const file of ['app.js', 'terminal-panel.js']) {
      const mod = readFileSync(join(webDir, file), 'utf8')
      for (const imp of mod.matchAll(/from '\.\/([\w.-]+)'/g)) wanted.add(`/${imp[1]!}`)
    }
    expect(wanted.size).toBeGreaterThan(4)

    for (const path of wanted) {
      const res = await fetch(`${base()}${path}?t=${token}`)
      expect(res.status, `${path} deveria ser servido pelo hub`).toBe(200)
    }
  })

  test('a biblioteca do terminal pode ficar em cache; o resto, nunca', async () => {
    const lib = await fetch(`${base()}/vendor/xterm.js?t=${token}`)
    expect(lib.headers.get('cache-control')).toContain('immutable')
    const app = await fetch(`${base()}/app.js?t=${token}`)
    expect(app.headers.get('cache-control')).toBe('no-store')
  })

  test('fonte servida com token é woff2 imutável', async () => {
    const res = await fetch(`${base()}/fonts/inter-latin-opsz-normal.woff2?t=${token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/woff2')
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  test('sprite de ícones servido com token é svg', async () => {
    const res = await fetch(`${base()}/icons.svg?t=${token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8')
  })

  test('responde 404 sem token, sem revelar o serviço', async () => {
    for (const path of [
      '/',
      '/app.js',
      '/style.css',
      '/tokens.css',
      '/fonts/inter-latin-opsz-normal.woff2',
      '/icons.svg',
      '/_ws',
      '/_activity',
    ]) {
      const res = await fetch(base() + path)
      expect(res.status).toBe(404)
    }
  })

  test('responde 404 com token errado do mesmo tamanho', async () => {
    const res = await fetch(`${base()}/?t=${'0'.repeat(token.length)}`)
    expect(res.status).toBe(404)
  })

  test('rota desconhecida com token válido continua 404', async () => {
    const res = await fetch(`${base()}/../etc/passwd?t=${token}`)
    expect(res.status).toBe(404)
  })
})

describe('descoberta para o app', () => {
  test('entrega versão, porta e candidatos rotulados', async () => {
    const res = await fetch(`${base()}/_endpoints?t=${token}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Descoberta
    expect(body.versao).toBe(BUILT_VERSION)
    expect(body.porta).toBe(port)
    for (const candidato of body.candidatos) {
      expect(['lan', 'vpn']).toContain(candidato.rotulo)
      expect(candidato.host).not.toBe('127.0.0.1')
    }
  })

  test('o tópico ntfy configurado vai junto, para o app não perguntar de novo', async () => {
    const res = await fetch(`${base()}/_endpoints?t=${token}`)
    const body = (await res.json()) as Descoberta
    expect(body.ntfy).toBe(`http://127.0.0.1:${notifyServer.port}/avisos`)
  })

  test('sem token a descoberta não existe', async () => {
    const res = await fetch(`${base()}/_endpoints`)
    expect(res.status).toBe(404)
  })
})

describe('keepalive', () => {
  test('ping do navegador volta como pong, provando que a conexão vive', async () => {
    const browser = await connect('browser')
    browser.socket.send(JSON.stringify({ type: 'ping' }))
    const pong = await browser.wait(m => m.type === 'pong')
    expect(pong.type).toBe('pong')
    browser.socket.close()
  })
})

describe('notificações', () => {
  test('pedido de permissão vira push com o projeto no título', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({
        type: 'register',
        sessionId: 'notif-1',
        cwd: '/home/u/proj',
        label: 'proj-notif',
        pid: 0,
      }),
    )
    session.socket.send(
      JSON.stringify({
        type: 'permission_request',
        requestId: 'perm-notif',
        toolName: 'Bash',
        description: 'listar arquivos',
        inputPreview: 'ls',
      }),
    )

    await waitFor(() => pushes.some(p => p.message.includes('Bash')))
    const push = pushes.find(p => p.message.includes('Bash'))!
    expect(push.title).toBe('proj-notif')
    expect(push.topic).toBe('avisos')

    session.socket.close()
  })

  test('turno encerrado avisa que a sessão ficou ociosa', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({
        type: 'register',
        sessionId: 'notif-2',
        cwd: '/home/u/proj',
        label: 'proj-idle',
        pid: 0,
      }),
    )
    await Bun.sleep(50)
    await fetch(`${base()}/_activity?t=${token}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'notif-2', tool: '', detail: '', status: 'idle' }),
    })

    await waitFor(() => pushes.some(p => p.title === 'proj-idle'))
    session.socket.close()
  })
})

describe('acompanhar no celular o que acontece no terminal', () => {
  test('prompt e resposta do terminal chegam ao feed da página', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'term-1', cwd: '/home/u/proj', label: 'proj', pid: 0 }),
    )
    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'term-1'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'term-1' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'term-1')

    const post = (body: object) =>
      fetch(`${base()}/_activity?t=${token}`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: 'term-1', tool: '', detail: '', ...body }),
      })

    await post({ status: 'start', terminalPrompt: 'rode os testes' })
    const prompt = await browser.wait(m => m.type === 'event' && m.event.kind === 'prompt')
    expect(prompt.event).toMatchObject({ text: 'rode os testes', origin: 'terminal' })

    await post({ status: 'idle', terminalReply: 'tudo verde' })
    const reply = await browser.wait(m => m.type === 'event' && m.event.kind === 'reply')
    expect(reply.event).toMatchObject({ text: 'tudo verde', origin: 'terminal' })
    await browser.wait(m => m.type === 'event' && m.event.kind === 'activity' && m.event.status === 'idle')

    session.socket.close()
    browser.socket.close()
  })
})

describe('o que mudou', () => {
  test('o hub devolve o estado do repositório da sessão', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'ls-repo-'))
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 'teste@local'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 'teste'], { cwd: repo })
    writeFileSync(join(repo, 'a.txt'), 'um\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'inicial'], { cwd: repo })
    writeFileSync(join(repo, 'a.txt'), 'dois\n')
    writeFileSync(join(repo, 'novo.txt'), 'novo\n')

    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'chg-1', cwd: repo, label: 'repo', pid: 0 }),
    )
    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'chg-1'))

    browser.socket.send(JSON.stringify({ type: 'changes', sessionId: 'chg-1' }))
    const msg = await browser.wait(m => m.type === 'changes')

    expect(msg.ok).toBe(true)
    expect(msg.text).toContain('a.txt')
    expect(msg.text).toContain('novo.txt')

    session.socket.close()
    browser.socket.close()
    rmSync(repo, { recursive: true, force: true })
  })

  test('diretório fora do git responde sem quebrar', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'ls-plain-'))
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'chg-2', cwd: plain, label: 'plain', pid: 0 }),
    )
    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'chg-2'))

    browser.socket.send(JSON.stringify({ type: 'changes', sessionId: 'chg-2' }))
    const msg = await browser.wait(m => m.type === 'changes')
    expect(msg.ok).toBe(false)

    session.socket.close()
    browser.socket.close()
    rmSync(plain, { recursive: true, force: true })
  })
})

describe.if(Bun.which('tmux') !== null && Bun.which('mkfifo') !== null)('terminal remoto', () => {
  const work = () => mkdtempSync(join(tmpdir(), 'ls-wsterm-'))

  test('abre, roda um comando e o que sai volta pelo socket', async () => {
    const cwd = work()
    const browser = await connect('browser')
    browser.socket.send(JSON.stringify({ type: 'term_open', dir: cwd, cols: 80, rows: 24 }))

    const ready = await browser.wait(m => m.type === 'term_ready', 10_000)
    expect(ready.dir).toBe(cwd)
    expect(ready.cols).toBe(80)

    browser.socket.send(JSON.stringify({ type: 'term_input', text: 'echo pelo-socket', enter: true }))
    const saida = await browser.wait(
      m => m.type === 'term_data' && String(m.data).includes('pelo-socket'),
      10_000,
    )
    expect(saida.data).toContain('pelo-socket')

    browser.socket.send(JSON.stringify({ type: 'term_kill' }))
    await browser.wait(m => m.type === 'term_exit', 10_000)
    browser.socket.close()
    rmSync(cwd, { recursive: true, force: true })
  })

  test('diretório fora da fronteira é recusado', async () => {
    const browser = await connect('browser')
    browser.socket.send(JSON.stringify({ type: 'term_open', dir: '/etc', cols: 80, rows: 24 }))
    const aviso = await browser.wait(m => m.type === 'toast')
    expect(aviso.text).toContain('não autorizado')
    expect(browser.seen().some(m => m.type === 'term_ready')).toBe(false)
    browser.socket.close()
  })

  test('teclas fora da allowlist não viram comando no tmux', async () => {
    const cwd = work()
    const browser = await connect('browser')
    browser.socket.send(JSON.stringify({ type: 'term_open', dir: cwd, cols: 80, rows: 24 }))
    await browser.wait(m => m.type === 'term_ready', 10_000)

    browser.socket.send(JSON.stringify({ type: 'term_key', key: 'C-x' }))
    browser.socket.send(JSON.stringify({ type: 'term_input', text: 'echo depois-da-tecla', enter: true }))
    const saida = await browser.wait(
      m => m.type === 'term_data' && String(m.data).includes('depois-da-tecla'),
      10_000,
    )
    expect(saida).toBeDefined()

    browser.socket.send(JSON.stringify({ type: 'term_kill' }))
    await browser.wait(m => m.type === 'term_exit', 10_000)
    browser.socket.close()
    rmSync(cwd, { recursive: true, force: true })
  })

  test('fechar o navegador não mata o que está rodando', async () => {
    const cwd = work()
    const um = await connect('browser')
    um.socket.send(JSON.stringify({ type: 'term_open', dir: cwd, cols: 80, rows: 24 }))
    await um.wait(m => m.type === 'term_ready', 10_000)
    um.socket.send(JSON.stringify({ type: 'term_input', text: 'echo marca-persistente', enter: true }))
    await um.wait(m => m.type === 'term_data' && String(m.data).includes('marca-persistente'), 10_000)
    um.socket.close()

    await Bun.sleep(300)
    const dois = await connect('browser')
    dois.socket.send(JSON.stringify({ type: 'term_open', dir: cwd, cols: 80, rows: 24 }))
    const ready = await dois.wait(m => m.type === 'term_ready', 10_000)
    expect(ready.seed).toContain('marca-persistente')

    dois.socket.send(JSON.stringify({ type: 'term_kill' }))
    await dois.wait(m => m.type === 'term_exit', 10_000)
    dois.socket.close()
    rmSync(cwd, { recursive: true, force: true })
  })
})

describe('upload de imagem', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

  test('imagem vira arquivo em disco e o hub devolve o caminho', async () => {
    const res = await fetch(`${base()}/_upload?t=${token}&session=up-1`, {
      method: 'POST',
      body: png,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { path: string }
    expect(body.path).toContain('up-1')
    expect(body.path).toEndWith('.png')
    expect(existsSync(body.path)).toBe(true)
  })

  test('arquivo que não é imagem é recusado', async () => {
    const res = await fetch(`${base()}/_upload?t=${token}&session=up-2`, {
      method: 'POST',
      body: '#!/bin/sh\nrm -rf /\n',
    })
    expect(res.status).toBe(400)
  })

  test('sem token não sobe nada', async () => {
    const res = await fetch(`${base()}/_upload?session=up-3`, { method: 'POST', body: png })
    expect(res.status).toBe(404)
  })
})

describe('gerenciador de arquivos', () => {
  let area: string
  let page: Collector

  beforeAll(async () => {
    area = realpathSync(mkdtempSync(join(tmpdir(), 'ls-files-')))
    mkdirSync(join(area, 'modelo', 'src'), { recursive: true })
    writeFileSync(join(area, 'modelo', 'src', 'a.txt'), 'conteúdo')
    writeFileSync(join(area, 'relatório.txt'), 'olá')
    symlinkSync('/', join(area, 'fuga'))
    page = await connect('browser')
  })

  afterAll(() => {
    page?.socket.close()
    rmSync(area, { recursive: true, force: true })
  })

  test('a listagem traz arquivos com tamanho, além das pastas', async () => {
    page.socket.send(JSON.stringify({ type: 'browse', path: area }))
    const dir = await page.wait(m => m.type === 'dir' && m.path === area)
    expect(dir.dirs.map((d: any) => d.name)).toEqual(['modelo'])
    expect(dir.files).toEqual([
      expect.objectContaining({ name: 'relatório.txt', size: 4, path: join(area, 'relatório.txt') }),
    ])
  })

  test('symlink para fora da área não é navegável', async () => {
    page.socket.send(JSON.stringify({ type: 'browse', path: join(area, 'fuga', 'etc') }))
    const t = await page.wait(m => m.type === 'toast' && m.text === 'fora da área permitida')
    expect(t).toBeDefined()
  })

  test('cria pasta e devolve a listagem atualizada', async () => {
    page.socket.send(JSON.stringify({ type: 'mkdir', parent: area, name: 'nova pasta' }))
    await page.wait(
      m => m.type === 'dir' && m.path === area && m.dirs.some((d: any) => d.name === 'nova pasta'),
    )
    expect(existsSync(join(area, 'nova pasta'))).toBe(true)
  })

  test('nome que sai do diretório é recusado', async () => {
    page.socket.send(JSON.stringify({ type: 'mkdir', parent: area, name: '../escapou' }))
    await page.wait(m => m.type === 'toast' && m.text === 'nome inválido')
    expect(existsSync(join(area, '..', 'escapou'))).toBe(false)
  })

  test('copiar pasta para a mesma pasta cria a cópia sem sobrescrever', async () => {
    page.socket.send(JSON.stringify({ type: 'copy', from: join(area, 'modelo'), to: area }))
    await page.wait(m => m.type === 'toast' && m.text === 'copiado como modelo (cópia)')
    expect(readFileSync(join(area, 'modelo (cópia)', 'src', 'a.txt'), 'utf8')).toBe('conteúdo')
  })

  test('copiar pasta para dentro dela mesma é recusado', async () => {
    page.socket.send(
      JSON.stringify({ type: 'copy', from: join(area, 'modelo'), to: join(area, 'modelo', 'src') }),
    )
    await page.wait(m => m.type === 'toast' && m.text === 'não dá para copiar uma pasta para dentro dela')
  })

  test('copiar de fora da área é recusado', async () => {
    page.socket.send(JSON.stringify({ type: 'copy', from: join(area, 'fuga', 'etc'), to: area }))
    await page.wait(m => m.type === 'toast' && m.text === 'fora da área permitida')
    expect(existsSync(join(area, 'etc'))).toBe(false)
  })

  test('pastas trazem a data de modificação', async () => {
    page.socket.send(JSON.stringify({ type: 'browse', path: area }))
    const dir = await page.wait(m => m.type === 'dir' && m.path === area)
    expect(typeof dir.dirs[0].mtime).toBe('number')
  })

  test('busca acha subpasta pelo nome e não atravessa symlink para fora', async () => {
    page.socket.send(JSON.stringify({ type: 'find', root: area, query: 'SRC', seq: 7 }))
    const found = await page.wait(m => m.type === 'found' && m.seq === 7)
    const rels = found.results.map((r: any) => r.rel).sort()
    expect(rels).toContain('modelo/src')
    expect(found.results.every((r: any) => r.path.startsWith(area))).toBe(true)

    page.socket.send(JSON.stringify({ type: 'find', root: area, query: 'etc', seq: 8 }))
    const fora = await page.wait(m => m.type === 'found' && m.seq === 8)
    expect(fora.results).toEqual([])
  })

  test('busca com raiz fora da área é recusada', async () => {
    const toastsAntes = page.seen().filter(m => m.type === 'toast').length
    page.socket.send(JSON.stringify({ type: 'find', root: '/etc', query: 'ssh', seq: 9 }))
    page.socket.send(JSON.stringify({ type: 'find', root: area, query: 'modelo', seq: 10 }))
    await page.wait(m => m.type === 'found' && m.seq === 10)
    const novos = page.seen().filter(m => m.type === 'toast').slice(toastsAntes)
    expect(novos.map(m => m.text)).toContain('fora da área permitida')
    expect(page.seen().some(m => m.type === 'found' && m.seq === 9)).toBe(false)
  })

  test('download entrega o arquivo como anexo', async () => {
    const path = encodeURIComponent(join(area, 'relatório.txt'))
    const res = await fetch(`${base()}/_download?path=${path}`, {
      headers: { cookie: `ls_token=${token}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain(`filename*=UTF-8''relat%C3%B3rio.txt`)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toBe('olá')
  })

  test('download recusa pasta, symlink para fora e requisição sem token', async () => {
    const q = (p: string) => encodeURIComponent(p)
    const semToken = await fetch(`${base()}/_download?path=${q(join(area, 'relatório.txt'))}`)
    expect(semToken.status).toBe(404)
    for (const p of [join(area, 'modelo'), join(area, 'fuga', 'etc', 'hostname'), '/etc/hostname']) {
      const res = await fetch(`${base()}/_download?t=${token}&path=${q(p)}`)
      expect(res.status).toBe(404)
    }
  })
})

describe.if(Bun.which('tmux') !== null)('sessão dentro ou fora do tmux', () => {
  const nome = `ls-teste-pane-${process.pid}`

  afterAll(() => {
    Bun.spawnSync(['tmux', 'kill-session', '-t', `=${nome}`])
  })

  async function tmuxDe(sessionId: string, pid: number): Promise<boolean> {
    const session = await connect('session')
    session.socket.send(JSON.stringify({ type: 'register', sessionId, cwd: '/p', label: 'p', pid }))
    const browser = await connect('browser')
    const msg = await browser.wait(
      m =>
        m.type === 'sessions' &&
        m.sessions.some((s: any) => s.id === sessionId && typeof s.tmux === 'boolean'),
    )
    session.socket.close()
    browser.socket.close()
    return msg.sessions.find((s: any) => s.id === sessionId).tmux
  }

  test('processo num pane do tmux chega à página como controlável', async () => {
    Bun.spawnSync(['tmux', 'new-session', '-d', '-s', nome, 'sleep 300'])
    const pid = Number(
      Bun.spawnSync(['tmux', 'list-panes', '-t', `=${nome}`, '-F', '#{pane_pid}']).stdout.toString().trim(),
    )
    expect(pid).toBeGreaterThan(1)
    expect(await tmuxDe('tmux-dentro', pid)).toBe(true)
  })

  test('processo fora de qualquer pane chega como não controlável, mesmo com tmux na máquina', async () => {
    expect(await tmuxDe('tmux-fora', 999_999_999)).toBe(false)
  })
})

describe('ciclo completo', () => {
  test('sessão registrada aparece para o browser', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({
        type: 'register',
        sessionId: 'it-1',
        cwd: '/home/u/proj',
        label: 'proj',
        pid: 111,
      }),
    )

    const browser = await connect('browser')
    const msg = await browser.wait(
      m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-1'),
    )
    expect(msg.sessions.find((s: any) => s.id === 'it-1')).toMatchObject({
      label: 'proj',
      cwd: '/home/u/proj',
      alive: true,
    })

    session.socket.close()
    browser.socket.close()
  })

  test('prompt do browser chega na sessão e ecoa no feed', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-2', cwd: '/p', label: 'p', pid: 2 }),
    )

    const inbound: any[] = []
    session.socket.onmessage = ev => inbound.push(JSON.parse(String(ev.data)))

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-2'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-2' }))
    browser.socket.send(
      JSON.stringify({ type: 'prompt', sessionId: 'it-2', text: 'roda os testes' }),
    )

    const echo = await browser.wait(m => m.type === 'event' && m.event.kind === 'prompt')
    expect(echo.event.text).toBe('roda os testes')

    await Bun.sleep(50)
    expect(inbound).toContainEqual({ type: 'prompt', text: 'roda os testes' })

    session.socket.close()
    browser.socket.close()
  })

  test('reply da sessão chega no browser', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-3', cwd: '/p', label: 'p', pid: 3 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-3'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-3' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'it-3')

    session.socket.send(JSON.stringify({ type: 'reply', text: '3 testes falharam' }))

    const got = await browser.wait(m => m.type === 'event' && m.event.kind === 'reply')
    expect(got.event.text).toBe('3 testes falharam')

    session.socket.close()
    browser.socket.close()
  })

  test('permissão vai e volta e fica marcada como resolvida', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-4', cwd: '/p', label: 'p', pid: 4 }),
    )

    const inbound: any[] = []
    session.socket.onmessage = ev => inbound.push(JSON.parse(String(ev.data)))

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-4'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-4' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'it-4')

    session.socket.send(
      JSON.stringify({
        type: 'permission_request',
        requestId: 'req-9',
        toolName: 'Bash',
        description: 'rm -rf node_modules',
        inputPreview: 'rm -rf node_modules',
      }),
    )

    const card = await browser.wait(m => m.type === 'event' && m.event.kind === 'permission')
    expect(card.event.resolved).toBeUndefined()

    browser.socket.send(
      JSON.stringify({
        type: 'permission_decision',
        sessionId: 'it-4',
        requestId: 'req-9',
        behavior: 'allow',
      }),
    )

    const resolved = await browser.wait(
      m => m.type === 'event' && m.event.kind === 'permission' && m.event.resolved === 'allow',
    )
    expect(resolved.event.requestId).toBe('req-9')

    await Bun.sleep(50)
    expect(inbound).toContainEqual({
      type: 'permission_decision',
      requestId: 'req-9',
      behavior: 'allow',
    })

    session.socket.close()
    browser.socket.close()
  })

  test('POST de atividade vira evento no feed', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-5', cwd: '/p', label: 'p', pid: 5 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-5'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-5' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'it-5')

    const res = await fetch(`${base()}/_activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ls-token': token },
      body: JSON.stringify({ sessionId: 'it-5', tool: 'Bash', detail: 'npm test', status: 'start' }),
    })
    expect(res.status).toBe(200)

    const got = await browser.wait(m => m.type === 'event' && m.event.kind === 'activity')
    expect(got.event).toMatchObject({ tool: 'Bash', detail: 'npm test', status: 'start' })

    session.socket.close()
    browser.socket.close()
  })

  test('pergunta do hook vira card, resposta do hook resolve o card', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-q', cwd: '/p', label: 'p', pid: 7 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-q'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-q' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'it-q')

    const questions = [
      {
        question: 'Qual fruta?',
        header: 'Fruta',
        options: [
          { label: 'Maçã', description: '' },
          { label: 'Banana', description: '' },
        ],
        multiSelect: false,
      },
    ]
    const post = (body: unknown) =>
      fetch(`${base()}/_activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ls-token': token },
        body: JSON.stringify(body),
      })

    const started = await post({
      sessionId: 'it-q',
      tool: 'AskUserQuestion',
      detail: 'Qual fruta?',
      status: 'start',
      question: { questionId: 'toolu_q1', questions },
    })
    expect(started.status).toBe(200)

    const card = await browser.wait(m => m.type === 'event' && m.event.kind === 'question')
    expect(card.event).toMatchObject({ questionId: 'toolu_q1', questions })
    expect(card.event.resolved).toBeUndefined()

    // a pergunta deixa a sessão ocupada
    const busy = await browser.wait(
      m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-q' && s.busy),
    )
    expect(busy).toBeDefined()

    const ended = await post({
      sessionId: 'it-q',
      tool: 'AskUserQuestion',
      detail: 'Qual fruta?',
      status: 'end',
      question: { questionId: 'toolu_q1', answers: { 'Qual fruta?': 'Banana' } },
    })
    expect(ended.status).toBe(200)

    const resolved = await browser.wait(
      m => m.type === 'event' && m.event.kind === 'question' && m.event.resolved !== undefined,
    )
    expect(resolved.event.resolved).toEqual({ 'Qual fruta?': 'Banana' })

    session.socket.close()
    browser.socket.close()
  })

  test('answer para pergunta desconhecida devolve toast de erro', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-q2', cwd: '/p', label: 'p', pid: 8 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-q2'))
    browser.socket.send(
      JSON.stringify({
        type: 'answer',
        sessionId: 'it-q2',
        questionId: 'fantasma',
        answers: [{ chosen: [0] }],
      }),
    )

    const toast = await browser.wait(m => m.type === 'toast')
    expect(toast.text).toContain('pergunta')

    session.socket.close()
    browser.socket.close()
  })

  test('auto mode aprova pedido novo sem toque e marca o card', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-a', cwd: '/p', label: 'p', pid: 9 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-a'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-a' }))
    browser.socket.send(JSON.stringify({ type: 'automode', sessionId: 'it-a', on: true }))
    await browser.wait(
      m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-a' && s.auto),
    )

    session.socket.send(
      JSON.stringify({
        type: 'permission_request',
        requestId: 'r-auto',
        toolName: 'Bash',
        description: 'rm x',
        inputPreview: 'rm x',
      }),
    )

    const decision = await session.wait(m => m.type === 'permission_decision')
    expect(decision).toEqual({ type: 'permission_decision', requestId: 'r-auto', behavior: 'allow' })

    const card = await browser.wait(
      m => m.type === 'event' && m.event.kind === 'permission' && m.event.requestId === 'r-auto',
    )
    expect(card.event).toMatchObject({ resolved: 'allow', auto: true })

    session.socket.close()
    browser.socket.close()
  })

  test('ligar o auto aprova pedido que já estava pendente', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-a2', cwd: '/p', label: 'p', pid: 10 }),
    )

    const browser = await connect('browser')
    await browser.wait(m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-a2'))
    browser.socket.send(JSON.stringify({ type: 'subscribe', sessionId: 'it-a2' }))
    await browser.wait(m => m.type === 'history' && m.sessionId === 'it-a2')

    session.socket.send(
      JSON.stringify({
        type: 'permission_request',
        requestId: 'r-antes',
        toolName: 'Bash',
        description: 'x',
        inputPreview: 'x',
      }),
    )
    await browser.wait(m => m.type === 'event' && m.event.kind === 'permission')

    browser.socket.send(JSON.stringify({ type: 'automode', sessionId: 'it-a2', on: true }))

    const decision = await session.wait(m => m.type === 'permission_decision')
    expect(decision.requestId).toBe('r-antes')
    expect(decision.behavior).toBe('allow')

    const resolved = await browser.wait(
      m => m.type === 'event' && m.event.kind === 'permission' && m.event.resolved === 'allow',
    )
    expect(resolved.event.auto).toBe(true)

    session.socket.close()
    browser.socket.close()
  })

  test('atividade sem token é rejeitada', async () => {
    const res = await fetch(`${base()}/_activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'it-5', tool: 'Bash', detail: 'x', status: 'start' }),
    })
    expect(res.status).toBe(404)
  })

  test('sessão que cai é marcada como encerrada', async () => {
    const session = await connect('session')
    session.socket.send(
      JSON.stringify({ type: 'register', sessionId: 'it-6', cwd: '/p', label: 'p', pid: 6 }),
    )

    const browser = await connect('browser')
    await browser.wait(
      m => m.type === 'sessions' && m.sessions.some((s: any) => s.id === 'it-6' && s.alive),
    )

    session.socket.close()

    const after = await browser.wait(
      m =>
        m.type === 'sessions' &&
        m.sessions.some((s: any) => s.id === 'it-6' && s.alive === false),
    )
    expect(after.sessions.find((s: any) => s.id === 'it-6').endedAt).toBeNumber()

    browser.socket.close()
  })
})

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Subprocess } from 'bun'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config'

let dir: string
let port: number
let token: string
let hub: Subprocess

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
  token = loadConfig(dir).token
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
  rmSync(dir, { recursive: true, force: true })
})

describe('gate de token', () => {
  test('serve a página com token e devolve o cookie', async () => {
    const res = await fetch(`${base()}/?t=${token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('ls_token=')
    expect(await res.text()).toContain('local-session')
  })

  test('aceita o cookie no lugar da query', async () => {
    const res = await fetch(`${base()}/app.js`, { headers: { cookie: `ls_token=${token}` } })
    expect(res.status).toBe(200)
  })

  test('responde 404 sem token, sem revelar o serviço', async () => {
    for (const path of ['/', '/app.js', '/style.css', '/_ws', '/_activity']) {
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
    await Bun.sleep(50)

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
    await Bun.sleep(50)

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
    await Bun.sleep(50)

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
    await Bun.sleep(50)

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

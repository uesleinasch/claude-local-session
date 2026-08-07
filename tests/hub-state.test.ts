import { describe, expect, test } from 'bun:test'
import { Registry } from '../src/hub-state'
import { DEAD_SESSION_TTL_MS, MAX_EVENTS, type FeedEvent } from '../src/protocol'

type Spy = { send(data: string): void; sent: any[] }

function spy(): Spy {
  const sent: any[] = []
  return { send: (data: string) => sent.push(JSON.parse(data)), sent }
}

const INFO = { sessionId: 's1', cwd: '/home/u/proj', label: 'proj', pid: 42 }

function activity(detail: string): FeedEvent {
  return { kind: 'activity', ts: 1, tool: 'Bash', detail, status: 'start' }
}

describe('registro de sessão', () => {
  test('browser conectado recebe a sessão nova na lista', () => {
    const reg = new Registry()
    const browser = spy()
    reg.addBrowser(browser)
    reg.registerSession(spy(), INFO)

    const last = browser.sent.at(-1)
    expect(last.type).toBe('sessions')
    expect(last.sessions).toEqual([
      { id: 's1', label: 'proj', cwd: '/home/u/proj', pid: 42, alive: true },
    ])
  })

  test('sessões vivas vêm antes das encerradas', () => {
    const reg = new Registry()
    const dead = spy()
    reg.registerSession(dead, { ...INFO, sessionId: 'a', label: 'aaa' })
    reg.registerSession(spy(), { ...INFO, sessionId: 'b', label: 'bbb' })
    reg.removeSession(dead)

    expect(reg.summaries().map(s => s.id)).toEqual(['b', 'a'])
  })

  test('reconexão preserva o histórico e revive a sessão', () => {
    const reg = new Registry()
    const first = spy()
    reg.registerSession(first, INFO)
    reg.push('s1', activity('npm test'))
    reg.removeSession(first)

    const second = spy()
    reg.registerSession(second, INFO)

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')

    expect(reg.summaries()[0]).toMatchObject({ alive: true })
    expect(reg.summaries()[0]!.endedAt).toBeUndefined()
    expect(browser.sent.at(-1).events).toHaveLength(1)
  })

  test('close atrasado do socket antigo não derruba a conexão nova', () => {
    const reg = new Registry()
    const first = spy()
    const second = spy()
    reg.registerSession(first, INFO)
    reg.registerSession(second, INFO)

    reg.removeSession(first)

    expect(reg.hasAlive()).toBe(true)
    expect(reg.toSession('s1', { type: 'prompt', text: 'oi' })).toBe(true)
  })
})

describe('roteamento', () => {
  test('entrega ao sink da sessão certa', () => {
    const reg = new Registry()
    const session = spy()
    reg.registerSession(session, INFO)

    expect(reg.toSession('s1', { type: 'prompt', text: 'roda os testes' })).toBe(true)
    expect(session.sent.at(-1)).toEqual({ type: 'prompt', text: 'roda os testes' })
  })

  test('recusa entrega para sessão encerrada', () => {
    const reg = new Registry()
    const session = spy()
    reg.registerSession(session, INFO)
    reg.removeSession(session)

    expect(reg.toSession('s1', { type: 'prompt', text: 'oi' })).toBe(false)
  })

  test('recusa entrega para sessão inexistente', () => {
    expect(new Registry().toSession('fantasma', { type: 'prompt', text: 'oi' })).toBe(false)
  })

  test('evento só chega ao browser inscrito naquela sessão', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.registerSession(spy(), { ...INFO, sessionId: 's2', label: 'outro' })

    const dentro = spy()
    const fora = spy()
    reg.addBrowser(dentro)
    reg.addBrowser(fora)
    reg.subscribe(dentro, 's1')
    reg.subscribe(fora, 's2')

    const before = fora.sent.length
    reg.push('s1', activity('npm test'))

    expect(dentro.sent.at(-1)).toMatchObject({ type: 'event', sessionId: 's1' })
    expect(fora.sent).toHaveLength(before)
  })

  test('browser removido para de receber', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    reg.removeBrowser(browser)

    const before = browser.sent.length
    reg.push('s1', activity('npm test'))
    expect(browser.sent).toHaveLength(before)
  })
})

describe('histórico', () => {
  test('descarta evento de sessão desconhecida', () => {
    const reg = new Registry()
    const browser = spy()
    reg.addBrowser(browser)
    const before = browser.sent.length

    reg.push('fantasma', activity('npm test'))
    expect(browser.sent).toHaveLength(before)
  })

  test('ring buffer mantém os últimos MAX_EVENTS', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    for (let i = 0; i < MAX_EVENTS + 25; i++) reg.push('s1', activity(`cmd-${i}`))

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')

    const { events } = browser.sent.at(-1)
    expect(events).toHaveLength(MAX_EVENTS)
    expect(events.at(-1).detail).toBe(`cmd-${MAX_EVENTS + 24}`)
    expect(events[0].detail).toBe('cmd-25')
  })

  test('assinar sessão sem histórico devolve lista vazia', () => {
    const reg = new Registry()
    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 'fantasma')

    expect(browser.sent.at(-1)).toEqual({ type: 'history', sessionId: 'fantasma', events: [] })
  })
})

describe('permissão', () => {
  const perm: FeedEvent = {
    kind: 'permission',
    ts: 1,
    requestId: 'req-1',
    toolName: 'Bash',
    description: 'rm -rf node_modules',
    inputPreview: 'rm -rf node_modules',
  }

  test('resolver atualiza o card no lugar em vez de duplicar', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', perm)
    reg.resolvePermission('s1', 'req-1', 'allow')

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')

    const { events } = browser.sent.at(-1)
    expect(events).toHaveLength(1)
    expect(events[0].resolved).toBe('allow')
  })

  test('resolver requestId desconhecido não cria card', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.resolvePermission('s1', 'req-fantasma', 'deny')

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    expect(browser.sent.at(-1).events).toHaveLength(0)
  })
})

describe('limpeza', () => {
  test('sweep descarta sessão encerrada depois do TTL', () => {
    const reg = new Registry()
    const session = spy()
    reg.registerSession(session, INFO)
    reg.removeSession(session, 1_000)

    reg.sweep(1_000 + DEAD_SESSION_TTL_MS - 1)
    expect(reg.summaries()).toHaveLength(1)

    reg.sweep(1_000 + DEAD_SESSION_TTL_MS + 1)
    expect(reg.summaries()).toHaveLength(0)
  })

  test('sweep não toca em sessão viva', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.sweep(Date.now() + DEAD_SESSION_TTL_MS * 10)
    expect(reg.summaries()).toHaveLength(1)
  })

  test('hasAlive acompanha a última sessão a cair', () => {
    const reg = new Registry()
    const session = spy()
    reg.registerSession(session, INFO)
    expect(reg.hasAlive()).toBe(true)
    reg.removeSession(session)
    expect(reg.hasAlive()).toBe(false)
  })
})

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

    const before = fora.sent.filter(m => m.type === 'event').length
    reg.push('s1', activity('npm test'))

    expect(dentro.sent.at(-1)).toMatchObject({ type: 'event', sessionId: 's1' })
    // A virada de busy manda 'sessions' para todos — mas 'event' só ao inscrito.
    expect(fora.sent.filter(m => m.type === 'event')).toHaveLength(before)
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

  test('preview do hook enriquece o card da mesma tool', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.notePreview('s1', 'Bash', 'rm -rf node_modules && bun install', 1_000)
    reg.push('s1', { ...perm, ts: 2_000 })

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    expect(browser.sent.at(-1).events[0].preview).toBe('rm -rf node_modules && bun install')
  })

  test('preview que chega depois completa o card retroativamente', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', { ...perm, ts: 1_000 })
    reg.notePreview('s1', 'Bash', 'comando completo', 2_000)

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    const { events } = browser.sent.at(-1)
    expect(events).toHaveLength(1)
    expect(events[0].preview).toBe('comando completo')
  })

  test('preview velho ou de outra tool não contamina o card', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.notePreview('s1', 'Edit', 'diff de outra coisa', 1_000)
    reg.push('s1', { ...perm, ts: 2_000 })

    const reg2 = new Registry()
    reg2.registerSession(spy(), INFO)
    reg2.notePreview('s1', 'Bash', 'muito antigo', 1_000)
    reg2.push('s1', { ...perm, ts: 60_000 })

    for (const r of [reg, reg2]) {
      const browser = spy()
      r.addBrowser(browser)
      r.subscribe(browser, 's1')
      expect(browser.sent.at(-1).events[0].preview).toBeUndefined()
    }
  })

  test('card resolvido não recebe preview atrasado', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', { ...perm, ts: 1_000 })
    reg.resolvePermission('s1', 'req-1', 'deny')
    reg.notePreview('s1', 'Bash', 'tarde demais', 2_000)

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    expect(browser.sent.at(-1).events[0].preview).toBeUndefined()
  })
})

describe('auto mode', () => {
  const perm = (requestId: string): FeedEvent => ({
    kind: 'permission',
    ts: 1,
    requestId,
    toolName: 'Bash',
    description: 'x',
    inputPreview: 'x',
  })

  test('setAuto marca a sessão e a lista broadcastada carrega o estado', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    expect(reg.setAuto('s1', true)).toBe(true)
    expect(reg.isAuto('s1')).toBe(true)
    expect(browser.sent.at(-1).sessions[0].auto).toBe(true)

    reg.setAuto('s1', false)
    expect(reg.isAuto('s1')).toBe(false)
  })

  test('setAuto em sessão desconhecida é recusado', () => {
    const reg = new Registry()
    expect(reg.setAuto('fantasma', true)).toBe(false)
    expect(reg.isAuto('fantasma')).toBe(false)
  })

  test('re-registro (reconexão) preserva o auto', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.setAuto('s1', true)
    reg.registerSession(spy(), INFO)
    expect(reg.isAuto('s1')).toBe(true)
  })

  test('openPermissions lista só os pedidos pendentes', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', perm('r1'))
    reg.push('s1', perm('r2'))
    reg.resolvePermission('s1', 'r1', 'deny')

    expect(reg.openPermissions('s1')).toEqual(['r2'])
    expect(reg.openPermissions('fantasma')).toEqual([])
  })

  test('resolvePermission com auto marca o card', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', perm('r1'))
    reg.resolvePermission('s1', 'r1', 'allow', true)

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    const { events } = browser.sent.at(-1)
    expect(events[0]).toMatchObject({ resolved: 'allow', auto: true })
  })
})

describe('contexto da sessão', () => {
  test('noteContext guarda na sessão e broadcasted na lista', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.noteContext({ sessionId: 's1', pct: 25.3, usedTokens: 253_000, maxTokens: 1_000_000 })
    const last = browser.sent.at(-1)
    expect(last.type).toBe('sessions')
    expect(last.sessions[0].context).toEqual({ pct: 25.3, usedTokens: 253_000, maxTokens: 1_000_000 })
  })

  test('variação menor que 1 ponto não gera novo broadcast', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.noteContext({ sessionId: 's1', pct: 25.0 })
    const count = browser.sent.length
    reg.noteContext({ sessionId: 's1', pct: 25.4 })
    expect(browser.sent.length).toBe(count)

    reg.noteContext({ sessionId: 's1', pct: 26.2 })
    expect(browser.sent.length).toBe(count + 1)
  })

  test('sessão desconhecida é ignorada', () => {
    const reg = new Registry()
    const browser = spy()
    reg.addBrowser(browser)
    const before = browser.sent.length
    reg.noteContext({ sessionId: 'fantasma', pct: 50 })
    expect(browser.sent.length).toBe(before)
  })

  test('modelo do statusline aparece na lista', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.noteContext({ sessionId: 's1', model: { id: 'claude-opus-5', name: 'Opus 5' } })
    expect(browser.sent.at(-1).sessions[0].model).toEqual({ id: 'claude-opus-5', name: 'Opus 5' })
  })

  test('mudança de modelo rebroadcasta mesmo sem mudar o percentual', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.noteContext({ sessionId: 's1', pct: 30, model: { id: 'claude-fable-5', name: 'Fable 5' } })
    const count = browser.sent.length
    // mesmo pct, modelo novo → tem que reemitir
    reg.noteContext({ sessionId: 's1', pct: 30, model: { id: 'claude-opus-5', name: 'Opus 5' } })
    expect(browser.sent.length).toBe(count + 1)
    expect(browser.sent.at(-1).sessions[0].model.name).toBe('Opus 5')
  })

  test('post sem modelo preserva o modelo já conhecido', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.noteContext({ sessionId: 's1', model: { id: 'claude-fable-5', name: 'Fable 5' } })
    reg.noteContext({ sessionId: 's1', pct: 42 })
    expect(reg.summaries()[0]!.model).toEqual({ id: 'claude-fable-5', name: 'Fable 5' })
    expect(reg.summaries()[0]!.context).toEqual({ pct: 42 })
  })
})

describe('pergunta (AskUserQuestion)', () => {
  const question: FeedEvent = {
    kind: 'question',
    ts: 1,
    questionId: 'toolu_1',
    questions: [
      {
        question: 'Qual fruta?',
        header: 'Fruta',
        options: [
          { label: 'Maçã', description: '' },
          { label: 'Banana', description: '' },
        ],
        multiSelect: false,
      },
    ],
  }

  function subscribed(reg: Registry): Spy {
    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    return browser
  }

  test('pergunta aberta liga busy', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', question)
    expect(reg.summaries()[0]!.busy).toBe(true)
  })

  test('resolver atualiza o card no lugar em vez de duplicar', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', question)
    reg.resolveQuestion('s1', 'toolu_1', { 'Qual fruta?': 'Banana' })

    const { events } = subscribed(reg).sent.at(-1)
    expect(events).toHaveLength(1)
    expect(events[0].resolved).toEqual({ 'Qual fruta?': 'Banana' })
  })

  test('mesmo questionId substitui o card', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', question)
    reg.push('s1', { ...question, ts: 2 })

    expect(subscribed(reg).sent.at(-1).events).toHaveLength(1)
  })

  test('resolver questionId desconhecido não cria card', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.resolveQuestion('s1', 'fantasma', {})
    expect(subscribed(reg).sent.at(-1).events).toHaveLength(0)
  })

  test('idle cancela pergunta aberta com resolved vazio', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', question)
    reg.push('s1', { kind: 'activity', ts: 2, tool: '', detail: '', status: 'idle' })

    const { events } = subscribed(reg).sent.at(-1)
    const card = events.find((e: FeedEvent) => e.kind === 'question')
    expect(card.resolved).toEqual({})
    expect(reg.summaries()[0]!.busy).toBe(false)
  })

  test('openQuestion devolve as perguntas do card aberto e some após resolver', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', question)
    expect(reg.openQuestion('s1', 'toolu_1')).toEqual(question.kind === 'question' ? question.questions : [])

    reg.resolveQuestion('s1', 'toolu_1', {})
    expect(reg.openQuestion('s1', 'toolu_1')).toBeNull()
    expect(reg.openQuestion('s1', 'fantasma')).toBeNull()
    expect(reg.openQuestion('outra', 'toolu_1')).toBeNull()
  })
})

describe('dropSession', () => {
  test('remove da lista na hora e notifica os browsers', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.dropSession('s1')
    expect(reg.summaries()).toHaveLength(0)
    expect(browser.sent.at(-1)).toEqual({ type: 'sessions', sessions: [] })
  })

  test('close atrasado do sink da sessão removida não quebra nada', () => {
    const reg = new Registry()
    const sink = spy()
    reg.registerSession(sink, INFO)
    reg.dropSession('s1')
    reg.removeSession(sink)
    expect(reg.summaries()).toHaveLength(0)
  })

  test('id desconhecido é silencioso', () => {
    const reg = new Registry()
    const browser = spy()
    reg.addBrowser(browser)
    const before = browser.sent.length
    reg.dropSession('fantasma')
    expect(browser.sent).toHaveLength(before)
  })
})

describe('estado ocupado', () => {
  test('prompt liga busy; idle desliga', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    expect(reg.summaries()[0]!.busy).not.toBe(true)

    reg.push('s1', { kind: 'prompt', ts: 1, text: 'oi' })
    expect(reg.summaries()[0]!.busy).toBe(true)

    reg.push('s1', { kind: 'activity', ts: 2, tool: '', detail: '', status: 'idle' })
    expect(reg.summaries()[0]!.busy).toBe(false)
  })

  test('tool start também liga busy', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', activity('npm test'))
    expect(reg.summaries()[0]!.busy).toBe(true)
  })

  test('virada de busy manda a lista atualizada a todos os browsers', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.push('s1', activity('npm test'))
    const lists = browser.sent.filter(m => m.type === 'sessions')
    expect(lists.at(-1).sessions[0].busy).toBe(true)
  })

  test('queda da sessão zera busy junto com alive', () => {
    const reg = new Registry()
    const sink = spy()
    reg.registerSession(sink, INFO)
    reg.push('s1', activity('npm test'))
    reg.removeSession(sink)

    expect(reg.summaries()[0]).toMatchObject({ alive: false, busy: false })
  })
})

describe('badges da lista', () => {
  const permission = (over: Partial<Extract<FeedEvent, { kind: 'permission' }>> = {}): FeedEvent => ({
    kind: 'permission',
    ts: 10,
    requestId: 'r1',
    toolName: 'Bash',
    description: '',
    inputPreview: 'ls',
    ...over,
  })

  test('pedido de permissão em aberto marca a sessão como esperando por mim', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    expect(reg.summaries()[0]!.waiting).not.toBe(true)

    reg.push('s1', permission())
    expect(reg.summaries()[0]!.waiting).toBe(true)
  })

  test('permissão decidida tira a marca', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', permission())
    reg.resolvePermission('s1', 'r1', 'allow')
    expect(reg.summaries()[0]!.waiting).toBe(false)
  })

  test('com dois pedidos, decidir um só não desmarca', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', permission())
    reg.push('s1', permission({ requestId: 'r2' }))
    reg.resolvePermission('s1', 'r1', 'allow')
    expect(reg.summaries()[0]!.waiting).toBe(true)
  })

  test('pergunta em aberto também espera por mim', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', { kind: 'question', ts: 3, questionId: 'q1', questions: [] })
    expect(reg.summaries()[0]!.waiting).toBe(true)

    reg.resolveQuestion('s1', 'q1', {})
    expect(reg.summaries()[0]!.waiting).toBe(false)
  })

  test('a marca entra na lista mandada aos browsers', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    const browser = spy()
    reg.addBrowser(browser)

    reg.push('s1', permission())
    const lists = browser.sent.filter(m => m.type === 'sessions')
    expect(lists.at(-1).sessions[0].waiting).toBe(true)
  })

  test('cada evento carimba o instante da última atividade', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.push('s1', { kind: 'prompt', ts: 111, text: 'oi' })
    expect(reg.summaries()[0]!.lastEventAt).toBe(111)

    reg.push('s1', { kind: 'activity', ts: 222, tool: '', detail: '', status: 'idle' })
    expect(reg.summaries()[0]!.lastEventAt).toBe(222)
  })

  test('sessão que caiu não fica marcada esperando resposta', () => {
    const reg = new Registry()
    const sink = spy()
    reg.registerSession(sink, INFO)
    reg.push('s1', permission())
    reg.removeSession(sink)

    expect(reg.summaries()[0]!.waiting).toBe(false)
  })
})

describe('persistência', () => {
  test('onEvent recebe cada evento aceito', () => {
    const got: Array<[string, FeedEvent]> = []
    const reg = new Registry((id, e) => got.push([id, e]))
    reg.registerSession(spy(), INFO)
    reg.push('s1', activity('npm test'))
    reg.push('fantasma', activity('descartado'))

    expect(got).toHaveLength(1)
    expect(got[0]![0]).toBe('s1')
  })

  test('hydrateSession repovoa uma sessão encerrada com histórico', () => {
    const reg = new Registry()
    reg.hydrateSession(INFO, [activity('do disco')], 5_000)

    expect(reg.summaries()).toEqual([
      { id: 's1', label: 'proj', cwd: '/home/u/proj', pid: 42, alive: false, endedAt: 5_000 },
    ])

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    expect(browser.sent.at(-1).events).toHaveLength(1)
  })

  test('hydrateSession não sobrescreve sessão já registrada', () => {
    const reg = new Registry()
    reg.registerSession(spy(), INFO)
    reg.hydrateSession(INFO, [activity('velho')], 5_000)

    expect(reg.summaries()[0]).toMatchObject({ alive: true })
  })

  test('register após hydrate revive a sessão preservando o histórico', () => {
    const reg = new Registry()
    reg.hydrateSession(INFO, [activity('do disco')], 5_000)
    reg.registerSession(spy(), INFO)

    const browser = spy()
    reg.addBrowser(browser)
    reg.subscribe(browser, 's1')
    expect(reg.summaries()[0]).toMatchObject({ alive: true })
    expect(reg.summaries()[0]!.endedAt).toBeUndefined()
    expect(browser.sent.at(-1).events).toHaveLength(1)
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

  test('hasBrowsers acompanha conexões de navegador', () => {
    const reg = new Registry()
    expect(reg.hasBrowsers()).toBe(false)
    const browser = spy()
    reg.addBrowser(browser)
    expect(reg.hasBrowsers()).toBe(true)
    reg.removeBrowser(browser)
    expect(reg.hasBrowsers()).toBe(false)
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

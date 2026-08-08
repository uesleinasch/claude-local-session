import { describe, expect, test } from 'bun:test'
import {
  Notifier,
  notificationFor,
  postToNtfy,
  splitNtfyUrl,
  type Notification,
} from '../src/notify'
import type { FeedEvent } from '../src/protocol'

const perm = (over: Partial<Extract<FeedEvent, { kind: 'permission' }>> = {}): FeedEvent => ({
  kind: 'permission',
  ts: 1000,
  requestId: 'r1',
  toolName: 'Bash',
  description: 'rodar os testes',
  inputPreview: 'bun test',
  ...over,
})

describe('notificationFor', () => {
  test('pedido de permissão pendente vira aviso com a tool no texto', () => {
    const n = notificationFor('meu-projeto', perm())
    expect(n?.title).toBe('meu-projeto')
    expect(n?.message).toContain('Bash')
    expect(n?.key).toBe('perm:r1')
  })

  test('permissão já resolvida não avisa ninguém', () => {
    expect(notificationFor('p', perm({ resolved: 'allow' }))).toBeNull()
  })

  test('sessão que ficou ociosa avisa que o turno acabou', () => {
    const n = notificationFor('p', { kind: 'activity', ts: 7, tool: '', detail: '', status: 'idle' })
    expect(n).not.toBeNull()
    expect(n?.key).toBe('idle:7')
  })

  test('atividade em andamento não avisa — seria um push por tool', () => {
    for (const status of ['start', 'end'] as const) {
      expect(
        notificationFor('p', { kind: 'activity', ts: 7, tool: 'Read', detail: 'x', status }),
      ).toBeNull()
    }
  })

  test('reply leva o texto da resposta', () => {
    const n = notificationFor('p', { kind: 'reply', ts: 3, text: 'terminei o roadmap' })
    expect(n?.message).toBe('terminei o roadmap')
    expect(n?.key).toBe('reply:3')
  })

  test('reply gigante é cortado para caber na notificação', () => {
    const n = notificationFor('p', { kind: 'reply', ts: 3, text: 'x'.repeat(1000) })
    expect(n!.message.length).toBeLessThanOrEqual(400)
  })

  test('prompt que eu mesmo mandei não vira push', () => {
    expect(notificationFor('p', { kind: 'prompt', ts: 3, text: 'oi' })).toBeNull()
  })

  test('pergunta pendente avisa com o enunciado', () => {
    const n = notificationFor('p', {
      kind: 'question',
      ts: 5,
      questionId: 'q1',
      questions: [{ question: 'Qual banco?', header: 'Banco', options: [], multiSelect: false }],
    })
    expect(n?.message).toContain('Qual banco?')
    expect(n?.key).toBe('q:q1')
  })

  test('pergunta já respondida não avisa', () => {
    const n = notificationFor('p', {
      kind: 'question',
      ts: 5,
      questionId: 'q1',
      questions: [{ question: 'Qual banco?', header: 'Banco', options: [], multiSelect: false }],
      resolved: { Banco: 'Postgres' },
    })
    expect(n).toBeNull()
  })
})

describe('splitNtfyUrl', () => {
  test('separa servidor e tópico', () => {
    expect(splitNtfyUrl('https://ntfy.sh/meu-topico')).toEqual({
      base: 'https://ntfy.sh',
      topic: 'meu-topico',
    })
  })

  test('barra no fim não vira tópico vazio', () => {
    expect(splitNtfyUrl('https://ntfy.sh/meu-topico/')?.topic).toBe('meu-topico')
  })

  test('servidor próprio atrás de subcaminho preserva o caminho', () => {
    expect(splitNtfyUrl('http://192.168.1.9/ntfy/avisos')).toEqual({
      base: 'http://192.168.1.9/ntfy',
      topic: 'avisos',
    })
  })

  test('url sem tópico não serve', () => {
    expect(splitNtfyUrl('https://ntfy.sh')).toBeNull()
    expect(splitNtfyUrl('https://ntfy.sh/')).toBeNull()
  })

  test('texto que não é url não serve', () => {
    expect(splitNtfyUrl('ntfy.sh/topico')).toBeNull()
    expect(splitNtfyUrl('')).toBeNull()
  })
})

describe('Notifier', () => {
  function spy() {
    const sent: Notification[] = []
    const notifier = new Notifier(async n => {
      sent.push(n)
      return true
    })
    return { sent, notifier }
  }

  test('envia o aviso do evento', async () => {
    const { sent, notifier } = spy()
    await notifier.notify('p', perm())
    expect(sent).toHaveLength(1)
    expect(sent[0]?.title).toBe('p')
  })

  test('o mesmo pedido de permissão só avisa uma vez, mesmo re-emitido com preview', async () => {
    const { sent, notifier } = spy()
    await notifier.notify('p', perm())
    await notifier.notify('p', perm({ preview: 'diff aqui' }))
    expect(sent).toHaveLength(1)
  })

  test('sem transporte o hub segue sem push, e sem erro', async () => {
    const notifier = new Notifier(null)
    expect(await notifier.notify('p', perm())).toBe(false)
  })

  test('url inválida não vira transporte — o hub fica sem push em vez de postar torto', () => {
    expect(postToNtfy('ntfy.sh/topico')).toBeNull()
    expect(postToNtfy('https://ntfy.sh')).toBeNull()
    expect(postToNtfy('https://ntfy.sh/topico')).not.toBeNull()
  })

  test('a memória de já-avisados não cresce sem limite', async () => {
    const { sent, notifier } = spy()
    for (let i = 0; i < 1200; i++) {
      await notifier.notify('p', { kind: 'reply', ts: i, text: 'oi' })
    }
    expect(sent).toHaveLength(1200)
    expect(notifier.size()).toBeLessThanOrEqual(1000)
  })
})

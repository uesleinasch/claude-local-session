import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HistoryStore, foldEvents } from '../src/history'
import { MAX_EVENTS, type FeedEvent } from '../src/protocol'

const INFO = { sessionId: 's1', cwd: '/home/u/proj', label: 'proj', pid: 42 }

function reply(text: string): FeedEvent {
  return { kind: 'reply', ts: 1, text }
}

function perm(requestId: string, resolved?: 'allow' | 'deny'): FeedEvent {
  return {
    kind: 'permission',
    ts: 1,
    requestId,
    toolName: 'Bash',
    description: 'x',
    inputPreview: 'x',
    ...(resolved ? { resolved } : {}),
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ls-history-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('foldEvents', () => {
  test('a última versão do card de permissão vence, na posição original', () => {
    const folded = foldEvents([perm('r1'), reply('a'), perm('r1', 'allow')])
    expect(folded).toHaveLength(2)
    expect(folded[0]).toMatchObject({ kind: 'permission', resolved: 'allow' })
    expect(folded[1]).toMatchObject({ kind: 'reply' })
  })
})

describe('HistoryStore', () => {
  test('append e load devolvem os mesmos eventos', () => {
    const store = new HistoryStore(dir)
    store.appendMeta(INFO)
    store.appendEvent('s1', reply('olá'))
    store.appendEvent('s1', reply('mundo'))

    expect(store.load('s1')).toEqual([reply('olá'), reply('mundo')])
  })

  test('arquivo de histórico é legível só pelo dono', () => {
    const store = new HistoryStore(dir)
    store.appendEvent('s1', reply('x'))
    const mode = statSync(join(dir, 's1.jsonl')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('sessionId com caracteres de caminho não escapa do diretório', () => {
    const store = new HistoryStore(dir)
    store.appendEvent('../fora', reply('x'))
    expect(() => statSync(join(dir, '.._fora.jsonl'))).not.toThrow()
  })

  test('linha corrompida no meio do arquivo é ignorada', () => {
    const store = new HistoryStore(dir)
    store.appendEvent('s1', reply('antes'))
    writeFileSync(join(dir, 's1.jsonl'), `${readFileSync(join(dir, 's1.jsonl'), 'utf8')}lixo\n`)
    store.appendEvent('s1', reply('depois'))

    expect(store.load('s1')).toEqual([reply('antes'), reply('depois')])
  })

  test('load limita ao ring buffer do hub', () => {
    const store = new HistoryStore(dir)
    for (let i = 0; i < MAX_EVENTS + 30; i++) store.appendEvent('s1', reply(`m${i}`))
    const events = store.load('s1')
    expect(events).toHaveLength(MAX_EVENTS)
    expect(events.at(-1)).toEqual(reply(`m${MAX_EVENTS + 29}`))
  })

  test('loadRecent devolve meta e eventos para hidratar o boot', () => {
    const store = new HistoryStore(dir)
    store.appendMeta(INFO)
    store.appendEvent('s1', reply('sobrevivi ao restart'))

    const recent = new HistoryStore(dir).loadRecent()
    expect(recent).toHaveLength(1)
    expect(recent[0]!.info).toEqual(INFO)
    expect(recent[0]!.events).toEqual([reply('sobrevivi ao restart')])
  })

  test('loadRecent ignora arquivo antigo demais', () => {
    const store = new HistoryStore(dir)
    store.appendMeta(INFO)
    store.appendEvent('s1', reply('velho'))

    const recent = new HistoryStore(dir).loadRecent(Date.now() + 49 * 60 * 60_000)
    expect(recent).toHaveLength(0)
  })

  test('loadRecent ignora arquivo sem meta', () => {
    const store = new HistoryStore(dir)
    store.appendEvent('s1', reply('sem meta'))
    expect(new HistoryStore(dir).loadRecent()).toHaveLength(0)
  })
})

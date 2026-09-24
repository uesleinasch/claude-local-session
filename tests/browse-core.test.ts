import { describe, expect, test } from 'bun:test'
// @ts-expect-error módulo JS do front, sem tipos.
import { crumbs, parseSort, relativeTime, sortEntries, SORT_OPTIONS } from '../web/browse-core.js'

const names = (xs: { name: string }[]) => xs.map(x => x.name)

describe('sortEntries', () => {
  const items = [
    { name: 'b10', mtime: 3, size: 5 },
    { name: 'B2', mtime: 1, size: 50 },
    { name: 'a', mtime: 2, size: 500 },
  ]

  test('nome ignora caixa e compara números como números', () => {
    expect(names(sortEntries(items, 'name', false))).toEqual(['a', 'B2', 'b10'])
    expect(names(sortEntries(items, 'name', true))).toEqual(['b10', 'B2', 'a'])
  })

  test('data e tamanho', () => {
    expect(names(sortEntries(items, 'mtime', true))).toEqual(['b10', 'a', 'B2'])
    expect(names(sortEntries(items, 'size', true))).toEqual(['a', 'B2', 'b10'])
  })

  test('sem o campo (pasta não tem tamanho), cai no nome', () => {
    const dirs = [{ name: 'z' }, { name: 'm' }]
    expect(names(sortEntries(dirs, 'size', true))).toEqual(['m', 'z'])
  })

  test('não altera a lista original', () => {
    const copy = [...items]
    sortEntries(items, 'size', true)
    expect(items).toEqual(copy)
  })
})

describe('parseSort', () => {
  test('lê o valor de cada opção do seletor', () => {
    for (const opt of SORT_OPTIONS) {
      const [key, dir] = opt.value.split('-')
      expect(parseSort(opt.value)).toEqual({ key, desc: dir === 'desc' })
    }
  })

  test('valor salvo inválido volta para nome A→Z', () => {
    for (const bad of [null, '', 'name', 'x-asc', 'size-sideways', '__proto__-asc']) {
      expect(parseSort(bad)).toEqual({ key: 'name', desc: false })
    }
  })
})

describe('relativeTime', () => {
  const now = new Date(2026, 8, 24, 15, 0).getTime()
  const MIN = 60_000

  test('faixas curtas', () => {
    expect(relativeTime(now - 10_000, now)).toBe('agora')
    expect(relativeTime(now - 5 * MIN, now)).toBe('há 5 min')
    expect(relativeTime(now - 125 * MIN, now)).toBe('há 2 h')
  })

  test('dias e data cheia', () => {
    expect(relativeTime(now - 30 * 60 * MIN, now)).toBe('ontem')
    expect(relativeTime(now - 4 * 24 * 60 * MIN, now)).toBe('há 4 dias')
    expect(relativeTime(new Date(2025, 0, 5).getTime(), now)).toBe('05/01/2025')
  })

  test('sem data não mostra nada', () => {
    expect(relativeTime(undefined, now)).toBe('')
  })
})

describe('crumbs', () => {
  test('dentro da home começa em ~', () => {
    expect(crumbs('/home/eu/repos/app', '/home/eu')).toEqual([
      { label: '~', path: '/home/eu' },
      { label: 'repos', path: '/home/eu/repos' },
      { label: 'app', path: '/home/eu/repos/app' },
    ])
  })

  test('fora da home começa na raiz', () => {
    expect(crumbs('/srv/proj', '/home/eu')).toEqual([
      { label: '/', path: '/' },
      { label: 'srv', path: '/srv' },
      { label: 'proj', path: '/srv/proj' },
    ])
  })

  test('a própria home', () => {
    expect(crumbs('/home/eu', '/home/eu')).toEqual([{ label: '~', path: '/home/eu' }])
  })
})

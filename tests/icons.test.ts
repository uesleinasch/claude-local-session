import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSprite, WEB_ICONS } from '../src/icons-core'

const WEB = join(import.meta.dir, '..', 'web')
const ler = (arquivo: string) => readFileSync(join(WEB, arquivo), 'utf8')

describe('sprite de ícones', () => {
  test('buildSprite gera um symbol por ícone', () => {
    const sprite = buildSprite(new Map([['a', 'M0 0'], ['b', 'M1 1']]))
    expect(sprite.startsWith('<svg xmlns="http://www.w3.org/2000/svg" style="display:none">')).toBe(true)
    expect(sprite).toContain('<symbol id="i-a" viewBox="0 -960 960 960"><path d="M0 0"/></symbol>')
    expect(sprite).toContain('<symbol id="i-b" viewBox="0 -960 960 960"><path d="M1 1"/></symbol>')
  })

  test('o sprite servido tem todo WEB_ICONS', () => {
    const sprite = ler('icons.svg')
    for (const nome of WEB_ICONS) expect(sprite).toContain(`id="i-${nome}"`)
  })

  test('todo ícone citado na página existe no sprite — senão o botão fica vazio, sem erro', () => {
    const js = ler('app.js') + ler('terminal-panel.js')
    const citados = new Set([
      ...[...js.matchAll(/\bicon\('([\w-]+)'/g)].map(m => m[1]!),
      ...[...js.matchAll(/\biconButton\([^,]+,[^,]+,\s*'([\w-]+)'/g)].map(m => m[1]!),
      ...[...js.matchAll(/\bicon:\s*'([\w-]+)'/g)].map(m => m[1]!),
      ...[...ler('index.html').matchAll(/#i-([\w-]+)/g)].map(m => m[1]!),
    ])
    expect(citados.size).toBeGreaterThan(10)
    expect([...citados].filter(n => !WEB_ICONS.includes(n))).toEqual([])
  })

  test('sem glifo de interface sobrando no html e no app.js', () => {
    for (const arquivo of ['index.html', 'app.js']) {
      expect(ler(arquivo)).not.toMatch(/[☆★▶✓✕↻⋯▾▸📎↑←◈⑂▮⚡⧉]/u)
    }
  })
})

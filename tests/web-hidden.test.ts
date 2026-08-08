import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(import.meta.dir, '..', 'web')
const html = readFileSync(join(WEB, 'index.html'), 'utf8')
const css = readFileSync(join(WEB, 'style.css'), 'utf8')

function idsWithHiddenAttribute(): string[] {
  const found: string[] = []
  for (const tag of html.matchAll(/<[a-z][^>]*>/gi)) {
    const id = tag[0].match(/\sid="([\w-]+)"/)?.[1]
    if (id && /\shidden(?=[\s/>])/.test(tag[0])) found.push(id)
  }
  return found
}

function idsWhoseRuleSetsDisplay(): Set<string> {
  const found = new Set<string>()
  for (const rule of css.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)) {
    if (/(?:^|;)\s*display\s*:/.test(rule[2]!)) found.add(rule[1]!)
  }
  return found
}

function idsGuardedAgainstHidden(): Set<string> {
  return new Set([...css.matchAll(/#([\w-]+)\[hidden\]/g)].map(m => m[1]!))
}

describe('atributo hidden versus display por id', () => {
  /**
   * `#id { display: … }` tem especificidade maior que o `display: none` que o
   * navegador aplica ao atributo `hidden` — sem a regra `#id[hidden]`, o elemento
   * nasce visível e `el.hidden = true` não tem efeito nenhum.
   */
  test('todo id com display próprio e hidden no html tem a regra que o esconde', () => {
    const display = idsWhoseRuleSetsDisplay()
    const guarded = idsGuardedAgainstHidden()
    const desprotegidos = idsWithHiddenAttribute()
      .filter(id => display.has(id))
      .filter(id => !guarded.has(id))

    expect(desprotegidos).toEqual([])
  })

  test('o teste enxerga o html e o css de verdade', () => {
    expect(idsWithHiddenAttribute().length).toBeGreaterThan(0)
    expect(idsWhoseRuleSetsDisplay().size).toBeGreaterThan(0)
  })
})

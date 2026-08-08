import { describe, expect, test } from 'bun:test'
// @ts-expect-error módulo JS do front, sem tipos — o parse é puro e testável aqui.
import { parseInline, parseMarkdown } from '../web/markdown.js'

describe('parseInline', () => {
  test('texto simples vira um span único', () => {
    expect(parseInline('olá mundo')).toEqual([{ t: 'text', text: 'olá mundo' }])
  })

  test('negrito, itálico e código convivem na mesma linha', () => {
    expect(parseInline('a **b** c *d* e `f`')).toEqual([
      { t: 'text', text: 'a ' },
      { t: 'strong', text: 'b' },
      { t: 'text', text: ' c ' },
      { t: 'em', text: 'd' },
      { t: 'text', text: ' e ' },
      { t: 'code', text: 'f' },
    ])
  })

  test('link http vira âncora', () => {
    expect(parseInline('[docs](https://exemplo.com/x)')).toEqual([
      { t: 'link', text: 'docs', href: 'https://exemplo.com/x' },
    ])
  })

  test('link com esquema perigoso degrada para texto', () => {
    expect(parseInline('[clique](javascript:alert)')).toEqual([{ t: 'text', text: 'clique' }])
    expect(parseInline('[x](data:text/html;b64)')).toEqual([{ t: 'text', text: 'x' }])
  })

  test('asteriscos de multiplicação não viram itálico', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ t: 'text', text: '2 * 3 * 4' }])
  })
})

describe('parseMarkdown', () => {
  test('parágrafos separados por linha em branco', () => {
    const blocks = parseMarkdown('um\n\ndois')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ t: 'p', spans: [{ t: 'text', text: 'um' }] })
  })

  test('quebra simples dentro do parágrafo vira br', () => {
    const blocks = parseMarkdown('um\ndois')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].spans).toEqual([
      { t: 'text', text: 'um' },
      { t: 'br' },
      { t: 'text', text: 'dois' },
    ])
  })

  test('bloco de código preserva conteúdo literal, sem inline', () => {
    const blocks = parseMarkdown('```ts\nconst a = **b**\n```')
    expect(blocks).toEqual([{ t: 'code', lang: 'ts', text: 'const a = **b**' }])
  })

  test('bloco de código sem fechamento consome até o fim', () => {
    const blocks = parseMarkdown('```\nx\ny')
    expect(blocks).toEqual([{ t: 'code', lang: '', text: 'x\ny' }])
  })

  test('título vira bloco h com nível', () => {
    expect(parseMarkdown('## Seção')).toEqual([
      { t: 'h', level: 2, spans: [{ t: 'text', text: 'Seção' }] },
    ])
  })

  test('lista com hífen agrupa itens consecutivos', () => {
    const blocks = parseMarkdown('- a\n- b\n\ntexto')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].t).toBe('ul')
    expect(blocks[0].items).toHaveLength(2)
  })

  test('lista numerada vira ol', () => {
    const blocks = parseMarkdown('1. a\n2. b')
    expect(blocks[0].t).toBe('ol')
    expect(blocks[0].items).toHaveLength(2)
  })
})

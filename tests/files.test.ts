import { describe, expect, test } from 'bun:test'
import { contentDisposition, copyTarget, findDirs, insideBase, isWithin, validName } from '../src/files'

describe('isWithin', () => {
  test('o próprio diretório e os descendentes estão dentro', () => {
    expect(isWithin('/home/u', '/home/u')).toBe(true)
    expect(isWithin('/home/u/a/b', '/home/u')).toBe(true)
  })

  test('prefixo de texto não é descendente', () => {
    expect(isWithin('/home/u2', '/home/u')).toBe(false)
    expect(isWithin('/home', '/home/u')).toBe(false)
  })
})

describe('insideBase', () => {
  test('aceita a home e os roots, recusa o resto', () => {
    const bases = ['/home/u', '/srv/proj']
    expect(insideBase('/home/u/x', bases)).toBe(true)
    expect(insideBase('/srv/proj', bases)).toBe(true)
    expect(insideBase('/etc', bases)).toBe(false)
    expect(insideBase('/', bases)).toBe(false)
  })

  test('caminho relativo nunca passa', () => {
    expect(insideBase('home/u', ['/home/u'])).toBe(false)
  })
})

describe('validName', () => {
  test('aceita nome comum, com espaço e acento', () => {
    expect(validName('projeto novo')).toBe(true)
    expect(validName('relatório-2026.pdf')).toBe(true)
  })

  test('recusa o que muda de diretório ou some da listagem', () => {
    for (const bad of ['', '.', '..', 'a/b', '/a', 'a\0b', '.oculto', ' ', 'a\nb']) {
      expect(validName(bad)).toBe(false)
    }
  })

  test('recusa mais de 255 bytes', () => {
    expect(validName('a'.repeat(255))).toBe(true)
    expect(validName('a'.repeat(256))).toBe(false)
    expect(validName('é'.repeat(128))).toBe(false)
  })
})

describe('copyTarget', () => {
  test('sem conflito, mantém o nome', () => {
    expect(copyTarget('app', () => false)).toBe('app')
  })

  test('com conflito, numera antes da extensão', () => {
    const taken = new Set(['app', 'app (cópia)', 'nota.txt'])
    expect(copyTarget('app', n => taken.has(n))).toBe('app (cópia 2)')
    expect(copyTarget('nota.txt', n => taken.has(n))).toBe('nota (cópia).txt')
  })

  test('extensão dupla comum não se parte no meio', () => {
    expect(copyTarget('dump.tar.gz', n => n === 'dump.tar.gz')).toBe('dump (cópia).tar.gz')
  })

  test('esgotar as tentativas devolve null em vez de sobrescrever', () => {
    expect(copyTarget('x', () => true)).toBeNull()
  })
})

describe('contentDisposition', () => {
  test('nome ascii simples', () => {
    expect(contentDisposition('a.txt')).toBe(`attachment; filename="a.txt"; filename*=UTF-8''a.txt`)
  })

  test('acento e aspas não quebram o cabeçalho', () => {
    const h = contentDisposition('relatório "final".pdf')
    expect(h).toContain(`filename="relat_rio _final_.pdf"`)
    expect(h).toContain(`filename*=UTF-8''relat%C3%B3rio%20%22final%22.pdf`)
  })
})

describe('findDirs', () => {
  const tree: Record<string, string[]> = {
    '/r': ['app', 'docs', 'node_modules', '.git', 'arquivo.txt'],
    '/r/app': ['src', 'Aplicação'],
    '/r/app/src': ['app-core'],
    '/r/app/src/app-core': [],
    '/r/app/Aplicação': [],
    '/r/docs': [],
    '/r/node_modules': ['app-lib'],
    '/r/.git': ['app-hook'],
  }
  const read = async (path: string) => {
    const kids = tree[path]
    if (!kids) return null
    return kids.map(name => ({ name, isDir: `${path}/${name}` in tree }))
  }

  test('acha por trecho do nome, sem caixa nem acento, rasos primeiro', async () => {
    const { results, truncated } = await findDirs('/r', 'APLICA', read)
    expect(results).toEqual([{ name: 'Aplicação', path: '/r/app/Aplicação', rel: 'app/Aplicação' }])
    expect(truncated).toBe(false)
    const app = await findDirs('/r', 'app', read)
    expect(app.results.map(r => r.rel)).toEqual(['app', 'app/src/app-core'])
  })

  test('não entra em pasta oculta nem em node_modules', async () => {
    const { results } = await findDirs('/r', 'app-', read)
    expect(results.map(r => r.rel)).toEqual(['app/src/app-core'])
  })

  test('respeita profundidade e limite de resultados', async () => {
    expect((await findDirs('/r', 'app', read, { maxDepth: 1 })).results.map(r => r.rel)).toEqual(['app'])
    const limited = await findDirs('/r', 'app', read, { max: 1 })
    expect(limited.results).toHaveLength(1)
    expect(limited.truncated).toBe(true)
  })

  test('prazo estourado devolve o que achou e marca truncado', async () => {
    let t = 0
    const res = await findDirs('/r', 'app', read, { deadline: 1, now: () => t++ })
    expect(res.truncated).toBe(true)
  })
})

import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { assetPath, EMBEDDED_FILES } from '../src/web-assets'

const WEB = join(import.meta.dir, '..', 'web')

/** Arquivo de `web/` que o hub não serve por rota própria. */
const NAO_SERVIDOS = new Set(['vendor/LICENSE', 'fonts/OFL.txt'])

function arquivosDeWeb(dir = WEB, prefixo = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = prefixo === '' ? entry.name : `${prefixo}/${entry.name}`
    return entry.isDirectory() ? arquivosDeWeb(join(dir, entry.name), rel) : [rel]
  })
}

describe('manifesto de assets embutidos', () => {
  test('todo arquivo de web/ está no manifesto — o que falta vira 404 só no binário', () => {
    const faltando = arquivosDeWeb()
      .filter(f => !NAO_SERVIDOS.has(f))
      .filter(f => !EMBEDDED_FILES.includes(f))
    expect(faltando).toEqual([])
  })

  test('o manifesto não aponta para arquivo que sumiu de web/', () => {
    const existentes = new Set(arquivosDeWeb())
    expect(EMBEDDED_FILES.filter(f => !existentes.has(f))).toEqual([])
  })
})

describe('assetPath', () => {
  test('sem override, devolve o caminho embutido', () => {
    expect(assetPath('index.html', '')).not.toBeNull()
  })

  test('com diretório, serve dali — é o escape para editar sem recompilar', () => {
    expect(assetPath('vendor/xterm.js', '/srv/web')).toBe('/srv/web/vendor/xterm.js')
  })

  test('arquivo fora do manifesto não inventa caminho', () => {
    expect(assetPath('nao-existe.js', '')).toBeNull()
  })
})

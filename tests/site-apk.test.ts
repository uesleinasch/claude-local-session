import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANDROID_APP_URL } from '../desktop/core.js'
import { escolherApk } from '../site/app/apk.js'

const REPO = join(import.meta.dir, '..')

function release(tag: string, extra: Record<string, unknown> = {}) {
  const versao = tag.replace(/^app-v/, '')
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: `local-session-${versao}.apk`,
        size: 66_811_431,
        browser_download_url: `https://github.com/x/y/releases/download/${tag}/local-session-${versao}.apk`,
      },
    ],
    ...extra,
  }
}

describe('escolherApk', () => {
  test('fica com o app mais novo, não com a primeira release da lista', () => {
    const r = escolherApk([release('app-v1.10.0'), release('app-v1.2.0'), release('app-v1.9.3')])
    expect(r?.versao).toBe('1.10.0')
    expect(r?.url).toEndWith('/app-v1.10.0/local-session-1.10.0.apk')
    expect(r?.tamanho).toBe(66_811_431)
  })

  test('ignora as releases do plugin, que ocupam o topo da lista', () => {
    const plugin = { tag_name: 'v0.15.4', draft: false, prerelease: false, assets: [] }
    expect(escolherApk([plugin, release('app-v1.2.0')])?.versao).toBe('1.2.0')
  })

  test('não oferece rc, pre-release nem rascunho a quem só quer instalar', () => {
    const r = escolherApk([
      release('app-v1.3.0-rc.1'),
      release('app-v1.3.0', { prerelease: true }),
      release('app-v1.4.0', { draft: true }),
      release('app-v1.2.0'),
    ])
    expect(r?.versao).toBe('1.2.0')
  })

  test('release do app sem .apk não vira link quebrado', () => {
    expect(escolherApk([release('app-v1.3.0', { assets: [] }), release('app-v1.2.0')])?.versao).toBe(
      '1.2.0',
    )
  })

  test('resposta que não é lista (limite da API, erro) dá null', () => {
    expect(escolherApk({ message: 'API rate limit exceeded' })).toBeNull()
    expect(escolherApk([])).toBeNull()
  })
})

describe('o endereço do app é um só', () => {
  test('é a página do app no GitHub Pages do projeto', () => {
    expect(ANDROID_APP_URL).toBe('https://uesleinasch.github.io/claude-local-session/app/')
  })

  test('README e site apontam para o mesmo endereço que a janela mostra no QR', () => {
    for (const arquivo of ['README.md', 'site/index.html']) {
      expect(readFileSync(join(REPO, arquivo), 'utf8'), arquivo).toContain(ANDROID_APP_URL)
    }
  })

  test('a página existe no site e usa a escolha testada', () => {
    const pagina = readFileSync(join(REPO, 'site', 'app', 'index.html'), 'utf8')
    expect(pagina).toContain('./apk.js')
    expect(pagina).toContain('escolherApk')
  })
})

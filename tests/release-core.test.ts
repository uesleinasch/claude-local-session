import { describe, expect, test } from 'bun:test'
import { conferirTag, jaPublicada, nomeDoApk, tagDaVersao, versaoDoPubspec } from '../src/release-core'

describe('versaoDoPubspec', () => {
  test('lê a versão ignorando o build number', () => {
    expect(versaoDoPubspec('name: local_session\nversion: 1.2.3+7\n')).toBe('1.2.3')
  })

  test('versão sem build number também serve', () => {
    expect(versaoDoPubspec('version: 0.1.0\n')).toBe('0.1.0')
  })

  /** `version:` dentro de outra chave não é a versão do app. */
  test('só a chave no topo conta', () => {
    expect(versaoDoPubspec('dependencies:\n  algo:\n    version: 9.9.9\n')).toBeNull()
  })

  test('pubspec sem versão devolve null em vez de inventar', () => {
    expect(versaoDoPubspec('name: local_session\n')).toBeNull()
    expect(versaoDoPubspec('version:\n')).toBeNull()
  })

  test('versão que não é semver é recusada', () => {
    expect(versaoDoPubspec('version: ultima\n')).toBeNull()
    expect(versaoDoPubspec('version: 1.2\n')).toBeNull()
  })
})

describe('tagDaVersao', () => {
  /** O prefixo separa as tags do app das do plugin, que seguem outra contagem. */
  test('a tag do app é prefixada', () => {
    expect(tagDaVersao('1.2.3')).toBe('app-v1.2.3')
  })
})

describe('jaPublicada', () => {
  test('tag existente é reconhecida', () => {
    expect(jaPublicada('app-v1.0.0', ['app-v0.9.0', 'app-v1.0.0'])).toBe(true)
  })

  test('tag nova passa', () => {
    expect(jaPublicada('app-v1.1.0', ['app-v1.0.0'])).toBe(false)
  })

  /** Tag do plugin com número parecido não pode bloquear o release do app. */
  test('tag de outra linha não confunde', () => {
    expect(jaPublicada('app-v1.0.0', ['v1.0.0', '1.0.0'])).toBe(false)
  })
})

describe('nomeDoApk', () => {
  test('o arquivo publicado leva a versão no nome', () => {
    expect(nomeDoApk('1.2.3')).toBe('local-session-1.2.3.apk')
  })
})

describe('conferirTag', () => {
  const versoes = { plugin: '0.13.1', pacote: '0.13.1', app: '1.1.1' }

  test('tag do plugin que bate com plugin.json e package.json', () => {
    expect(conferirTag('v0.13.1', versoes)).toEqual({ ok: true, alvo: 'plugin', versao: '0.13.1' })
  })

  test('tag do app que bate com o pubspec', () => {
    expect(conferirTag('app-v1.1.1', versoes)).toEqual({ ok: true, alvo: 'app', versao: '1.1.1' })
  })

  test('versão divergente reprova e diz qual arquivo', () => {
    const r = conferirTag('v0.13.2', versoes)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toContain('plugin.json')
    const pacote = conferirTag('v0.13.1', { ...versoes, pacote: '0.13.0' })
    expect(pacote.ok).toBe(false)
    if (!pacote.ok) expect(pacote.erro).toContain('package.json')
    const app = conferirTag('app-v1.2.0', versoes)
    expect(app.ok).toBe(false)
    if (!app.ok) expect(app.erro).toContain('pubspec.yaml')
  })

  test('tag fora do padrão reprova', () => {
    for (const t of ['0.13.1', 'v0.13', 'v0.13.1-rc1', 'app-1.1.1', 'refs/tags/v0.13.1', '']) {
      expect(conferirTag(t, versoes).ok).toBe(false)
    }
  })
})

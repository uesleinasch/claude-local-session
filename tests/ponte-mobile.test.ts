import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O app Android (`mobile/lib/ponte/chamada.dart`) chama estes nomes por
 * `evaluateJavascript`. Renomear de um lado só quebra o compartilhamento sem que
 * nada no build acuse — este teste é o que acusa.
 */
const APP_JS = readFileSync(join(import.meta.dir, '..', 'web', 'app.js'), 'utf8')

describe('ponte com o cliente Android', () => {
  test('a página expõe window.localSession', () => {
    expect(APP_JS).toContain('window.localSession')
  })

  test('expõe inserirNoComposer, por onde entra o texto compartilhado', () => {
    expect(APP_JS).toMatch(/inserirNoComposer\s*\(/)
  })

  test('expõe sessaoAtual, que diz para qual sessão a imagem sobe', () => {
    expect(APP_JS).toMatch(/sessaoAtual\s*\(/)
  })
})

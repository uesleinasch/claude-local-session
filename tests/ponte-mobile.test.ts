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

describe('ajustes do app pela página', () => {
  const SESSAO = readFileSync(join(import.meta.dir, '..', 'mobile', 'lib', 'tela', 'sessao.dart'), 'utf8')

  test('o botão da página chama o handler que o app registra', () => {
    expect(APP_JS).toContain("callHandler('abrirAjustes')")
    expect(SESSAO).toContain("handlerName: 'abrirAjustes'")
  })

  test('o app não desenha barra própria sobre a página — o cabeçalho é o da página', () => {
    expect(SESSAO).not.toContain('appBar:')
  })
})

describe('área segura dentro do app', () => {
  const SESSAO = readFileSync(join(import.meta.dir, '..', 'mobile', 'lib', 'tela', 'sessao.dart'), 'utf8')
  const WEB = join(import.meta.dir, '..', 'web')
  const TOKENS = readFileSync(join(WEB, 'tokens.css'), 'utf8')
  const STYLE = readFileSync(join(WEB, 'style.css'), 'utf8')

  test('o app marca a página antes de ela pintar, e a página zera os recuos nesse caso', () => {
    expect(SESSAO).toContain("document.documentElement.dataset.shell = 'app'")
    expect(SESSAO).toContain('UserScriptInjectionTime.AT_DOCUMENT_START')
    const bloco = TOKENS.match(/:root\[data-shell="app"\]\s*\{([^}]*)\}/)?.[1] ?? ''
    for (const lado of ['top', 'right', 'bottom']) expect(bloco).toMatch(new RegExp(`--ls-safe-${lado}:\\s*0px`))
  })

  test('style.css só usa os recuos pelo token — env() direto somaria ao SafeArea do app', () => {
    expect(STYLE).not.toContain('env(safe-area-inset')
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(import.meta.dir, '..', 'web')
const html = readFileSync(join(WEB, 'index.html'), 'utf8')
const cssRaw = readFileSync(join(WEB, 'style.css'), 'utf8')
/** Comentário carrega vírgula e chave, que confundiriam o parser ingênuo abaixo. */
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '')

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

function rules(): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }))
}

describe('nada pode empurrar a largura da página', () => {
  /**
   * Filho de flex/grid nasce com `min-width: auto` e se recusa a encolher abaixo
   * do próprio conteúdo — um bloco de código ou uma fila de chips vira scroll
   * horizontal na página inteira em vez de rolar dentro da própria caixa.
   */
  test('quem rola na horizontal declara min-width: 0, senão empurra o pai', () => {
    const semTrava = rules()
      .filter(r => /overflow-x\s*:\s*auto|overflow\s*:\s*auto/.test(r.body))
      .filter(r => !/min-width\s*:\s*0/.test(r.body))
      .filter(r => !/position\s*:\s*fixed/.test(r.body))
      .map(r => r.selector)

    expect(semTrava).toEqual([])
  })

  /**
   * Elemento fixo centralizado por translateX(-50%) cresce para os dois lados:
   * sem teto de largura, a ponta direita passa da viewport e o scroll horizontal
   * volta — agora sem nem aparecer no fluxo do documento.
   */
  test('avisos flutuantes têm teto de largura', () => {
    const semTeto = rules()
      .filter(r => /position\s*:\s*fixed/.test(r.body) && /translateX\(-50%\)/.test(r.body))
      .filter(r => !/max-width/.test(r.body))
      .map(r => r.selector)

    expect(semTeto).toEqual([])
  })

  /**
   * O nome da ferramenta chega cru do hook e uma tool MCP passa de 45 caracteres
   * (`mcp__plugin_context-mode_context-mode__ctx_execute`). Sem teto ela não
   * encolhe, empurra a caixa da atividade e a página inteira rola na horizontal.
   */
  test('os campos que mostram nome de ferramenta têm teto e truncam', () => {
    for (const selector of ['.act-tool', '.perm-tool', '.session-state']) {
      const regra = rules().find(r => r.selector.split(',').some(s => s.trim() === selector))
      expect(regra, `${selector} precisa existir`).toBeDefined()
      expect(regra!.body, `${selector} precisa de max-width`).toMatch(/max-width\s*:/)
      expect(regra!.body, `${selector} precisa truncar`).toMatch(/text-overflow\s*:\s*ellipsis/)
    }
  })

  test('as áreas do grid raiz podem encolher', () => {
    const alvos = ['#app > *', '#feed > *', '#composer > *', '#composer-row > *']
    for (const alvo of alvos) {
      const regra = rules().find(
        r => r.selector.split(',').some(s => s.trim() === alvo) && /min-width\s*:\s*0/.test(r.body),
      )
      expect(regra, `${alvo} precisa de min-width: 0`).toBeDefined()
    }
  })
})

describe('alvos de toque', () => {
  /** Fitts: no celular o dedo precisa de área; 44px é o mínimo confortável. */
  test('os controles pequenos crescem no modo sem hover', () => {
    const touchBlock = css.match(/@media \(hover: none\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    for (const selector of ['.quick-chip', '#stop', '.term-key', '.dir-spawn']) {
      expect(touchBlock).toContain(selector)
    }
  })

  /**
   * Botão que só existe como ícone não tem rótulo para o leitor de tela ler —
   * e no toque é justamente o alvo menor.
   */
  test('os botões só-ícone da barra declaram tamanho de toque', () => {
    for (const id of ['#back', '#more', '#attach', '#send']) {
      const regra = rules().find(r =>
        r.selector.split(',').some(s => s.trim() === id) && /width|height/.test(r.body),
      )
      expect(regra, `${id} precisa de área de toque declarada`).toBeDefined()
    }
  })
})

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

  test('nome de sessão longo corta com reticências, numa linha só', () => {
    const regra = rules().find(r => r.selector === '.session-name')
    expect(regra?.body).toMatch(/min-width:\s*0/)
    expect(regra?.body).toMatch(/overflow:\s*hidden/)
    expect(regra?.body).toMatch(/text-overflow:\s*ellipsis/)
  })

  test('balão do seu prompt usa secondary-container', () => {
    const regra = rules().find(r => r.selector === '.turn[data-kind="prompt"] .bubble')
    expect(regra?.body).toContain('var(--md-sys-color-secondary-container)')
  })

  test('prompt vindo do terminal tem balão próprio, sem a cor do seu', () => {
    const regra = rules().find(r => r.selector === '.turn[data-origin="terminal"] .bubble')
    expect(regra?.body).toContain('var(--md-sys-color-surface-container-high)')
  })

  test('campo do composer tem 16px — menos que isso o celular dá zoom ao focar', () => {
    const regra = rules().find(r => r.selector === '#input')
    expect(regra?.body).toMatch(/font-size:\s*var\(--md-sys-typescale-body-large-size\)/)
  })

  test('cards de permissão e pergunta usam surface-container-high e cantos medium', () => {
    for (const seletor of ['.perm', '.ask']) {
      const regra = rules().find(r => r.selector.split(',').some(s => s.trim() === seletor))
      expect(regra?.body, seletor).toContain('var(--md-sys-color-surface-container-high)')
      expect(regra?.body, seletor).toContain('var(--md-sys-shape-corner-medium)')
    }
  })

  test('opção de pergunta tem 56px de altura mínima', () => {
    const regra = rules().find(r => r.selector === '.ask-opt')
    expect(regra?.body).toMatch(/min-height:\s*56px/)
  })

  test('avisos flutuantes são snackbars: inverse-surface, fixos e com teto de largura', () => {
    for (const seletor of ['#clip-bar', '#toast']) {
      const regra = rules().find(r => r.selector === seletor)
      expect(regra?.body, seletor).toContain('var(--md-sys-color-inverse-surface)')
      expect(regra?.body, seletor).toMatch(/position:\s*fixed/)
      expect(regra?.body, seletor).toMatch(/max-width\s*:/)
    }
  })

  test('sem conexão vira faixa de erro no topo', () => {
    const regra = rules().find(r => r.selector === '#offline')
    expect(regra?.body).toContain('var(--md-sys-color-error-container)')
  })

  test('abrir pasta tem cabeçalho próprio: some aba e ícone, aparece o voltar', () => {
    const some = rules().find(r => r.selector.split(',').some(x => x.trim() === '#app[data-pane="browse"] #tabs'))
    expect(some?.body).toMatch(/display:\s*none/)
    const volta = rules().find(r =>
      r.selector.split(',').some(x => x.trim() === '#app[data-view="sessions"][data-pane="browse"] #back'),
    )
    expect(volta?.body).toMatch(/display:\s*grid/)
  })

  test('há bloco prefers-reduced-motion que zera transições', () => {
    const tokens = readFileSync(join(WEB, 'tokens.css'), 'utf8')
    expect(tokens).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*transition-duration:\s*0/,
    )
  })

  test('o teste enxerga o html e o css de verdade', () => {
    expect(idsWithHiddenAttribute().length).toBeGreaterThan(0)
    expect(idsWhoseRuleSetsDisplay().size).toBeGreaterThan(0)
  })
})

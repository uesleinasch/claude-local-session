import { describe, expect, test } from 'bun:test'
import {
  parseStatus,
  probeTailscale,
  resolveState,
  setupSteps,
  tailscaleLines,
} from '../src/tailscale'

/** Recorte do `tailscale status --json` real (1.98.10) — só os campos que importam. */
function statusJson(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Version: '1.98.10-t0ee734d30-g6b4108809',
    BackendState: 'Running',
    Self: {
      ID: 'nsZViDgKaH11CNTRL',
      DNSName: 'jacpontnx23.tail95d3bd.ts.net.',
      TailscaleIPs: ['100.113.47.75', 'fd7a:115c:a1e0::a537:2f4c'],
    },
    ...over,
  }
}

describe('parseStatus', () => {
  test('conectado usa o nome MagicDNS e apara o ponto final do FQDN', () => {
    expect(parseStatus(statusJson())).toEqual({
      kind: 'running',
      host: 'jacpontnx23.tail95d3bd.ts.net',
    })
  })

  test('sem MagicDNS cai no IPv4', () => {
    const raw = statusJson({ Self: { TailscaleIPs: ['100.113.47.75', 'fd7a:115c::1'] } })
    expect(parseStatus(raw)).toEqual({ kind: 'running', host: '100.113.47.75' })
  })

  /** URL com IPv6 exigiria colchetes e não é endereço que alguém digita no celular. */
  test('conectado só por IPv6 devolve null, para o chamador usar o fallback', () => {
    const raw = statusJson({ Self: { TailscaleIPs: ['fd7a:115c::1'] } })
    expect(parseStatus(raw)).toBeNull()
  })

  test('nome MagicDNS vazio não vira host', () => {
    const raw = statusJson({ Self: { DNSName: '', TailscaleIPs: ['100.64.1.2'] } })
    expect(parseStatus(raw)).toEqual({ kind: 'running', host: '100.64.1.2' })
  })

  test('instalado e nunca autenticado pede login', () => {
    expect(parseStatus(statusJson({ BackendState: 'NeedsLogin' }))).toEqual({ kind: 'needs-login' })
  })

  test('autenticado e desligado reporta desligado', () => {
    expect(parseStatus(statusJson({ BackendState: 'Stopped' }))).toEqual({ kind: 'stopped' })
  })

  /** Transitório: em segundos vira Running, e o fallback por interface já acha o IP. */
  test('estado transitório devolve null', () => {
    expect(parseStatus(statusJson({ BackendState: 'Starting' }))).toBeNull()
  })

  test('o que não é objeto com BackendState devolve null', () => {
    expect(parseStatus(null)).toBeNull()
    expect(parseStatus('Running')).toBeNull()
    expect(parseStatus({})).toBeNull()
    expect(parseStatus({ BackendState: 42 })).toBeNull()
  })
})

describe('setupSteps', () => {
  test('sem tailscale, os passos cobrem instalar, autenticar e o celular', () => {
    const steps = setupSteps({ kind: 'absent' }).join('\n')
    expect(steps).toContain('https://tailscale.com/install.sh')
    expect(steps).toContain('tailscale up')
    expect(steps).toMatch(/celular/i)
  })

  test('instalado sem autenticação, o passo é autenticar', () => {
    expect(setupSteps({ kind: 'needs-login' }).join('\n')).toContain('tailscale up')
  })

  test('desligado, o passo é religar', () => {
    expect(setupSteps({ kind: 'stopped' }).join('\n')).toContain('tailscale up')
  })

  test('conectado não tem passo a dar', () => {
    expect(setupSteps({ kind: 'running', host: 'x.ts.net' })).toEqual([])
  })
})

describe('tailscaleLines', () => {
  test('conectado entrega a URL com host e token', () => {
    const lines = tailscaleLines({ kind: 'running', host: 'jacpontnx23.tail95d3bd.ts.net' }, 7777, 'abc')
    expect(lines.join('\n')).toContain('http://jacpontnx23.tail95d3bd.ts.net:7777/?t=abc')
  })

  /** O token é a chave da máquina: não pode aparecer num bloco que não tem endereço. */
  test('sem tailscale, o bloco ensina os passos e não inventa URL nem vaza token', () => {
    const text = tailscaleLines({ kind: 'absent' }, 7777, 'abc').join('\n')
    expect(text).toContain('https://tailscale.com/install.sh')
    expect(text).not.toContain('abc')
    expect(text).not.toContain('http://:')
  })

  test('desligado explica o estado em vez de sumir da saída', () => {
    const text = tailscaleLines({ kind: 'stopped' }, 7777, 'abc').join('\n')
    expect(text).toMatch(/deslig/i)
    expect(text).toContain('tailscale up')
  })
})

describe('resolveState', () => {
  test('o que o CLI disse manda', () => {
    expect(resolveState({ kind: 'stopped' }, '100.113.47.75')).toEqual({ kind: 'stopped' })
    expect(resolveState({ kind: 'absent' }, null)).toEqual({ kind: 'absent' })
  })

  /** CLI mudo mas existe IP na faixa CGNAT: está conectado, só não deu para confirmar pelo CLI. */
  test('sem resposta do CLI, o IP da interface vira o host', () => {
    expect(resolveState(null, '100.113.47.75')).toEqual({
      kind: 'running',
      host: '100.113.47.75',
    })
  })

  test('sem resposta e sem IP, não inventa estado', () => {
    expect(resolveState(null, null)).toBeNull()
  })

  /**
   * Binário fora do PATH deste processo não é Tailscale ausente: o IP na faixa
   * CGNAT prova que a tailnet está de pé. Ensinar a instalar aqui perderia a URL
   * que a detecção por interface já sabia dar.
   */
  test('binário invisível mas interface com IP da tailnet é conexão viva', () => {
    expect(resolveState({ kind: 'absent' }, '100.113.47.75')).toEqual({
      kind: 'running',
      host: '100.113.47.75',
    })
  })
})

describe('probeTailscale', () => {
  test('binário ausente vira absent, que é o estado com instruções', async () => {
    expect(await probeTailscale(async () => ({ found: false, json: null }))).toEqual({
      kind: 'absent',
    })
  })

  /** Comando que pendurou ou falhou não é "sem tailscale" — é "não sei", e o fallback assume. */
  test('binário presente com comando falhando devolve null', async () => {
    expect(await probeTailscale(async () => ({ found: true, json: null }))).toBeNull()
  })

  test('saída ilegível devolve null em vez de estourar', async () => {
    expect(await probeTailscale(async () => ({ found: true, json: 'não é json' }))).toBeNull()
  })

  test('saída boa vira estado', async () => {
    const json = JSON.stringify(statusJson())
    expect(await probeTailscale(async () => ({ found: true, json }))).toEqual({
      kind: 'running',
      host: 'jacpontnx23.tail95d3bd.ts.net',
    })
  })
})

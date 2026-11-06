import { describe, expect, test } from 'bun:test'
import { montarCandidatos, montarDescoberta } from '../src/endpoints'

describe('montarCandidatos', () => {
  test('LAN e tailnet viram candidatos rotulados', () => {
    expect(
      montarCandidatos({ lan: '192.168.0.10', tailscale: 'estacao.tailnet.ts.net', hostname: null }),
    ).toEqual([
      { rotulo: 'lan', host: '192.168.0.10' },
      { rotulo: 'vpn', host: 'estacao.tailnet.ts.net' },
    ])
  })

  test('hostname vira <hostname>.local', () => {
    expect(montarCandidatos({ lan: null, tailscale: null, hostname: 'estacao' })).toEqual([
      { rotulo: 'lan', host: 'estacao.local' },
    ])
  })

  test('hostname já terminado em .local não ganha sufixo duplicado', () => {
    expect(montarCandidatos({ lan: null, tailscale: null, hostname: 'estacao.local' })).toEqual([
      { rotulo: 'lan', host: 'estacao.local' },
    ])
  })

  /** O celular nunca alcança o loopback da estação — candidato só gastaria timeout. */
  test('loopback e localhost ficam de fora', () => {
    expect(
      montarCandidatos({ lan: '127.0.0.1', tailscale: null, hostname: 'localhost' }),
    ).toEqual([])
  })

  test('o mesmo endereço nas duas pontas entra uma vez só', () => {
    expect(
      montarCandidatos({ lan: '100.101.102.103', tailscale: '100.101.102.103', hostname: null }),
    ).toEqual([{ rotulo: 'lan', host: '100.101.102.103' }])
  })

  test('sem endereço nenhum a lista é vazia', () => {
    expect(montarCandidatos({ lan: null, tailscale: null, hostname: null })).toEqual([])
  })
})

describe('montarDescoberta', () => {
  test('payload leva versão, porta e candidatos', () => {
    expect(
      montarDescoberta({
        versao: '0.12.1',
        porta: 7777,
        lan: '192.168.0.10',
        tailscale: null,
        hostname: null,
        ntfy: undefined,
      }),
    ).toEqual({
      versao: '0.12.1',
      porta: 7777,
      candidatos: [{ rotulo: 'lan', host: '192.168.0.10' }],
    })
  })

  test('com notifyUrl configurado o app recebe o tópico pronto', () => {
    const payload = montarDescoberta({
      versao: '0.12.1',
      porta: 7777,
      lan: null,
      tailscale: null,
      hostname: null,
      ntfy: 'https://ntfy.sh/meu-topico',
    })
    expect(payload.ntfy).toBe('https://ntfy.sh/meu-topico')
  })

  /** `ntfy: undefined` no JSON some; ausente é o sinal de "não configurado". */
  test('sem notifyUrl o campo ntfy não existe no JSON', () => {
    const payload = montarDescoberta({
      versao: '0.12.1',
      porta: 7777,
      lan: null,
      tailscale: null,
      hostname: null,
      ntfy: undefined,
    })
    expect(Object.hasOwn(payload, 'ntfy')).toBe(false)
  })
})

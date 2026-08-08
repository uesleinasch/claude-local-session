import { describe, expect, test } from 'bun:test'
// @ts-expect-error módulo JS do front, sem tipos — o texto do badge é puro e testável aqui.
import { sessionStatus } from '../web/session-status.js'

const NOW = 1_000_000

describe('sessionStatus', () => {
  test('pedido de permissão em aberto vence tudo — é o que exige você', () => {
    const s = { alive: true, busy: true, waiting: true, lastEventAt: NOW }
    expect(sessionStatus(s, NOW)).toMatchObject({ tone: 'waiting', label: 'aguardando você' })
  })

  test('turno em andamento aparece como trabalhando', () => {
    const s = { alive: true, busy: true, lastEventAt: NOW }
    expect(sessionStatus(s, NOW)).toMatchObject({ tone: 'busy', label: 'trabalhando' })
  })

  test('parada há menos de um minuto não vira contagem', () => {
    const s = { alive: true, lastEventAt: NOW - 30_000 }
    expect(sessionStatus(s, NOW).label).toBe('ociosa')
  })

  test('parada há minutos conta os minutos', () => {
    const s = { alive: true, lastEventAt: NOW - 5 * 60_000 }
    expect(sessionStatus(s, NOW).label).toBe('ociosa há 5 min')
  })

  test('parada há horas conta as horas, não 180 min', () => {
    const s = { alive: true, lastEventAt: NOW - 3 * 3_600_000 }
    expect(sessionStatus(s, NOW).label).toBe('ociosa há 3 h')
  })

  test('sessão sem evento nenhum não inventa tempo', () => {
    expect(sessionStatus({ alive: true }, NOW).label).toBe('ociosa')
  })

  test('sessão encerrada diz que encerrou, sem badge de espera', () => {
    const s = { alive: false, waiting: true, lastEventAt: NOW }
    expect(sessionStatus(s, NOW)).toMatchObject({ tone: 'dead', label: 'encerrada' })
  })

  test('relógio atrasado não produz tempo negativo', () => {
    const s = { alive: true, lastEventAt: NOW + 60_000 }
    expect(sessionStatus(s, NOW).label).toBe('ociosa')
  })
})

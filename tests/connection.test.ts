import { describe, expect, test } from 'bun:test'
// @ts-expect-error módulo JS do front, sem tipos — a política é pura e testável aqui.
import { MAX_BACKOFF_MS, nextBackoff, PING_MS, PONG_TIMEOUT_MS, wakeAction } from '../web/connection.js'

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

describe('wakeAction', () => {
  test('sem socket manda reconectar', () => {
    expect(wakeAction(null)).toBe('reconnect')
  })

  test('socket fechado manda reconectar', () => {
    expect(wakeAction(CLOSED)).toBe('reconnect')
  })

  test('socket fechando manda reconectar sem esperar o onclose', () => {
    expect(wakeAction(CLOSING)).toBe('reconnect')
  })

  test('socket ainda conectando espera, para não abrir um segundo', () => {
    expect(wakeAction(CONNECTING)).toBe('wait')
  })

  test('socket aberto só pinga, para provar que ainda vive', () => {
    expect(wakeAction(OPEN)).toBe('ping')
  })
})

describe('nextBackoff', () => {
  test('dobra a cada tentativa', () => {
    expect(nextBackoff(1000)).toBe(2000)
    expect(nextBackoff(2000)).toBe(4000)
  })

  test('para de crescer no teto', () => {
    expect(nextBackoff(MAX_BACKOFF_MS)).toBe(MAX_BACKOFF_MS)
    expect(nextBackoff(MAX_BACKOFF_MS * 2)).toBe(MAX_BACKOFF_MS)
  })
})

describe('PING_MS', () => {
  test('cabe com folga no idleTimeout de 120s do hub', () => {
    expect(PING_MS).toBeLessThan(120_000 / 2)
  })

  test('a espera pelo pong termina antes do ping seguinte, senão eles se empilham', () => {
    expect(PONG_TIMEOUT_MS).toBeLessThan(PING_MS)
  })
})

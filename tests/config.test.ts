import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, readConfig, readCookie, tokenMatches } from '../src/config'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ls-config-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LOCAL_SESSION_PORT
})

describe('loadConfig', () => {
  test('gera token longo na primeira chamada', () => {
    const cfg = loadConfig(dir)
    expect(cfg.token).toHaveLength(64)
    expect(cfg.port).toBe(7777)
  })

  test('grava o arquivo apenas para o dono', () => {
    loadConfig(dir)
    const mode = statSync(join(dir, 'config.json')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('relê o mesmo token em vez de gerar outro', () => {
    expect(loadConfig(dir).token).toBe(loadConfig(dir).token)
  })

  test('regenera quando o arquivo está corrompido', () => {
    writeFileSync(join(dir, 'config.json'), 'não é json')
    expect(loadConfig(dir).token).toHaveLength(64)
  })

  test('regeneração de arquivo corrompido restaura o modo 0600', () => {
    writeFileSync(join(dir, 'config.json'), 'não é json', { mode: 0o644 })
    loadConfig(dir)
    const mode = statSync(join(dir, 'config.json')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('LOCAL_SESSION_PORT sobrepõe a porta sem tocar no token', () => {
    const original = loadConfig(dir)
    process.env.LOCAL_SESSION_PORT = '9123'
    const overridden = loadConfig(dir)
    expect(overridden.port).toBe(9123)
    expect(overridden.token).toBe(original.token)
  })
})

describe('readConfig', () => {
  test('devolve null sem criar arquivo nenhum', () => {
    expect(readConfig(dir)).toBeNull()
    expect(() => statSync(join(dir, 'config.json'))).toThrow()
  })
})

describe('tokenMatches', () => {
  const token = 'a'.repeat(64)

  test('aceita o token exato', () => {
    expect(tokenMatches(token, token)).toBe(true)
  })

  test('rejeita prefixo correto de tamanho diferente', () => {
    expect(tokenMatches(token, 'a'.repeat(63))).toBe(false)
  })

  test('rejeita valor ausente ou de outro tipo', () => {
    expect(tokenMatches(token, null)).toBe(false)
    expect(tokenMatches(token, 42)).toBe(false)
    expect(tokenMatches(token, '')).toBe(false)
  })
})

describe('readCookie', () => {
  test('extrai o valor entre outros cookies', () => {
    expect(readCookie('a=1; ls_token=xyz; b=2', 'ls_token')).toBe('xyz')
  })

  test('não confunde com cookie de nome parecido', () => {
    expect(readCookie('outro_ls_token=xyz', 'ls_token')).toBeNull()
  })

  test('devolve null sem header', () => {
    expect(readCookie(null, 'ls_token')).toBeNull()
  })
})

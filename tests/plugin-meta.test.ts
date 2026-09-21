import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUILT_VERSION, installedVersion, pluginMismatch } from '../src/plugin-meta'

describe('pluginMismatch', () => {
  test('versões iguais não incomodam ninguém', () => {
    expect(pluginMismatch('0.11.0', '0.11.0')).toBeNull()
  })

  test('cópia velha no cache é o caso que precisa aparecer', () => {
    expect(pluginMismatch('0.11.0', '0.10.0')).toEqual({ built: '0.11.0', installed: '0.10.0' })
  })

  test('sem versão instalada, cala — rodar do fonte não é upgrade pela metade', () => {
    expect(pluginMismatch('0.11.0', null)).toBeNull()
    expect(pluginMismatch('0.11.0', '')).toBeNull()
  })
})

describe('BUILT_VERSION', () => {
  test('vem do plugin.json de verdade, no formato de versão', () => {
    expect(BUILT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('installedVersion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ls-meta-'))

  test('lê a versão da raiz informada', () => {
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
    writeFileSync(join(dir, '.claude-plugin/plugin.json'), '{"name":"x","version":"9.9.9"}')
    expect(installedVersion(dir)).toBe('9.9.9')
  })

  test('raiz sem plugin.json não vira aviso', () => {
    expect(installedVersion(join(dir, 'vazio'))).toBeNull()
  })

  test('json quebrado também não', () => {
    const quebrado = join(dir, 'quebrado')
    mkdirSync(join(quebrado, '.claude-plugin'), { recursive: true })
    writeFileSync(join(quebrado, '.claude-plugin/plugin.json'), '{nao é json')
    expect(installedVersion(quebrado)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

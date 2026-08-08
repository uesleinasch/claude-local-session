import { describe, expect, test } from 'bun:test'
import {
  clampCols,
  clampRows,
  isTermKey,
  shellQuote,
  TERM_COLS,
  TERM_KEYS,
  TERM_ROWS,
  terminalName,
} from '../src/terminal'

describe('terminalName', () => {
  test('é estável para o mesmo diretório', () => {
    expect(terminalName('/home/ana/api')).toBe(terminalName('/home/ana/api'))
  })

  test('separa pastas homônimas de projetos diferentes', () => {
    expect(terminalName('/home/ana/api/web')).not.toBe(terminalName('/home/ana/site/web'))
  })

  test('só produz caracteres que o tmux aceita como nome de sessão', () => {
    for (const dir of ['/home/ana/meu projeto', '/home/ana/a.b:c', '/home/ana/café', '/']) {
      expect(terminalName(dir)).toMatch(/^lst-[\w-]+-[0-9a-f]{8}$/)
    }
  })

  test('diretório raiz não gera nome com o meio vazio', () => {
    expect(terminalName('/')).toMatch(/^lst-dir-[0-9a-f]{8}$/)
  })
})

describe('teclas de controle', () => {
  test('aceita as da allowlist e recusa o resto', () => {
    for (const key of TERM_KEYS) expect(isTermKey(key)).toBe(true)
    for (const nao of ['', 'C-x', 'rm -rf /', 'Enter; ls', 42, null, ['Enter']]) {
      expect(isTermKey(nao)).toBe(false)
    }
  })

  test('nenhuma tecla carrega caractere que o shell interpretaria', () => {
    for (const key of TERM_KEYS) expect(key).toMatch(/^[A-Za-z-]+$/)
  })
})

describe('tamanho da janela', () => {
  test('prende dentro dos limites', () => {
    expect(clampCols(9)).toBe(TERM_COLS.min)
    expect(clampCols(10_000)).toBe(TERM_COLS.max)
    expect(clampRows(1)).toBe(TERM_ROWS.min)
    expect(clampRows(10_000)).toBe(TERM_ROWS.max)
  })

  test('valor ausente ou absurdo cai no padrão', () => {
    for (const bad of [undefined, null, NaN, Infinity, '80', {}]) {
      expect(clampCols(bad)).toBe(TERM_COLS.fallback)
      expect(clampRows(bad)).toBe(TERM_ROWS.fallback)
    }
  })

  test('fracionário vira inteiro', () => {
    expect(clampCols(80.7)).toBe(80)
    expect(clampRows(24.9)).toBe(24)
  })
})

describe('shellQuote', () => {
  test('fecha o caminho contra o shell que o pipe-pane abre', () => {
    expect(shellQuote('/home/ana/.claude/lst.pipe')).toBe(`'/home/ana/.claude/lst.pipe'`)
    expect(shellQuote("/tmp/a'; rm -rf ~; '")).toBe(`'/tmp/a'\\''; rm -rf ~; '\\'''`)
  })
})

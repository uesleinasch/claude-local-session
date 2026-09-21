import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STALE_FILES, SYNC_DIRS, SYNC_FILES, pidsOnPort, versionDirs } from '../src/update-core'

const SS_OUT = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      511          127.0.0.1:5173       0.0.0.0:*     users:(("node",pid=1234,fd=20))
LISTEN 0      512            0.0.0.0:7777       0.0.0.0:*     users:(("bun",pid=361686,fd=11))
LISTEN 0      4096              [::]:22            [::]:*     users:(("sshd",pid=900,fd=4))
`

describe('pidsOnPort', () => {
  test('acha o pid de quem escuta a porta', () => {
    expect(pidsOnPort(SS_OUT, 7777)).toEqual([361686])
  })

  test('ignora quem escuta outra porta', () => {
    expect(pidsOnPort(SS_OUT, 5173)).toEqual([1234])
  })

  test('porta com o número dentro de outra não conta', () => {
    const out = 'LISTEN 0 512 0.0.0.0:17777 0.0.0.0:* users:(("bun",pid=42,fd=11))\n'
    expect(pidsOnPort(out, 7777)).toEqual([])
  })

  test('pid no lugar de porta não vira alvo', () => {
    const out = 'LISTEN 0 512 0.0.0.0:8080 0.0.0.0:* users:(("bun",pid=7777,fd=11))\n'
    expect(pidsOnPort(out, 7777)).toEqual([])
  })

  test('mais de um processo na mesma porta devolve todos', () => {
    const out =
      'LISTEN 0 512 0.0.0.0:7777 0.0.0.0:* users:(("bun",pid=10,fd=11),("bun",pid=11,fd=12))\n'
    expect(pidsOnPort(out, 7777)).toEqual([10, 11])
  })

  test('ninguém escutando devolve lista vazia', () => {
    expect(pidsOnPort('', 7777)).toEqual([])
  })
})

describe('versionDirs', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-cache-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('lista os diretórios de versão em ordem', () => {
    for (const v of ['0.10.0', '0.2.0', '0.1.0']) mkdirSync(join(dir, v))
    expect(versionDirs(dir).map(p => p.split('/').at(-1))).toEqual(['0.1.0', '0.2.0', '0.10.0'])
  })

  test('arquivo solto no meio não é versão', () => {
    mkdirSync(join(dir, '0.1.0'))
    writeFileSync(join(dir, 'README.md'), 'x')
    expect(versionDirs(dir)).toHaveLength(1)
  })

  test('cache inexistente não explode', () => {
    expect(versionDirs(join(dir, 'nao-existe'))).toEqual([])
  })
})

describe('arquivos do plugin no cache', () => {
  test('o deploy leva a config de MCP junto do manifesto', () => {
    expect(SYNC_FILES).toContain(join('.claude-plugin', 'mcp.json'))
    expect(SYNC_FILES).toContain(join('.claude-plugin', 'plugin.json'))
  })

  // O .mcp.json da raiz virou MCP de projeto em toda sessão aberta dentro do
  // repo e morria com ENOENT no ${CLAUDE_PLUGIN_ROOT} literal. Deixá-lo para
  // trás no cache o ressuscita ao lado da config nova.
  test('o deploy apaga o .mcp.json da raiz que ficou no cache', () => {
    expect(STALE_FILES).toContain('.mcp.json')
  })

  test('nenhum arquivo é espelhado e apagado ao mesmo tempo', () => {
    for (const stale of STALE_FILES) expect(SYNC_FILES).not.toContain(stale)
  })
})

describe('ponto de entrada único', () => {
  test('o deploy espelha bin/ — é por onde hooks e mcp.json chamam o plugin', () => {
    expect(SYNC_DIRS).toContain('bin')
  })
})

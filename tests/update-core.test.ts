import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pidsOnPort, versionDirs } from '../src/update-core'

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

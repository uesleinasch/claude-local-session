import { describe, expect, test } from 'bun:test'
import {
  COMMANDS,
  hubSpawnArgs,
  isStandalone,
  parseCommand,
  pluginRoot,
  usage,
} from '../src/cli-core'

describe('parseCommand', () => {
  test('reconhece cada subcomando anunciado', () => {
    for (const cmd of COMMANDS) expect(parseCommand([cmd])).toBe(cmd)
  })

  test('ignora o que vem depois do comando', () => {
    expect(parseCommand(['setup', '--check'])).toBe('setup')
  })

  test('sem argumento nenhum não escolhe comando', () => {
    expect(parseCommand([])).toBeNull()
  })

  test('comando desconhecido não vira comando parecido', () => {
    expect(parseCommand(['hubs'])).toBeNull()
    expect(parseCommand(['--help'])).toBeNull()
  })
})

describe('usage', () => {
  test('lista todo comando que o parser aceita', () => {
    const text = usage()
    for (const cmd of COMMANDS) expect(text).toContain(cmd)
  })
})

describe('isStandalone', () => {
  test('o fs virtual do executável compilado denuncia o binário', () => {
    expect(isStandalone('/$bunfs/root/cli.ts')).toBe(true)
  })

  test('rodando do fonte, não', () => {
    expect(isStandalone('/home/u/repo/src/cli.ts')).toBe(false)
  })
})

describe('hubSpawnArgs', () => {
  test('no binário o subcomando basta — não há .ts em disco', () => {
    expect(hubSpawnArgs('/qualquer/coisa', true)).toEqual(['hub'])
  })

  test('do fonte, o caminho do hub.ts sob a raiz', () => {
    expect(hubSpawnArgs('/home/u/repo', false)).toEqual(['/home/u/repo/src/hub.ts'])
  })
})

describe('pluginRoot', () => {
  const base = { moduleDir: '/home/u/repo/src', execPath: '/home/u/.bun/bin/bun' }

  test('do fonte, é o pai de src/', () => {
    expect(pluginRoot({ ...base, standalone: false })).toBe('/home/u/repo')
  })

  test('no binário, é o pai do diretório do executável', () => {
    expect(
      pluginRoot({ ...base, standalone: true, execPath: '/opt/local-session/dist/local-session' }),
    ).toBe('/opt/local-session')
  })

  test('o env vence os dois — o pacote separa binário de metadados', () => {
    expect(
      pluginRoot({ ...base, standalone: true, execPath: '/usr/bin/local-session', env: '/usr/lib/local-session' }),
    ).toBe('/usr/lib/local-session')
  })

  test('env vazio não conta como escolha', () => {
    expect(pluginRoot({ ...base, standalone: false, env: '' })).toBe('/home/u/repo')
  })
})

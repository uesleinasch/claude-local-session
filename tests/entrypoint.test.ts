import { describe, expect, test } from 'bun:test'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { COMMANDS } from '../src/cli-core'

const REPO = join(import.meta.dir, '..')
const SHIM = join(REPO, 'bin', 'local-session')

const lerJson = (rel: string): unknown => JSON.parse(readFileSync(join(REPO, rel), 'utf8'))

describe('shim bin/local-session', () => {
  test('é executável — sem o bit, todo hook morre em silêncio', () => {
    expect(statSync(SHIM).mode & 0o111).toBeGreaterThan(0)
  })

  test('prefere o binário compilado e cai no fonte', () => {
    const sh = readFileSync(SHIM, 'utf8')
    expect(sh).toContain('dist/local-session')
    expect(sh).toContain('src/cli.ts')
  })
})

describe('manifestos apontam para o ponto de entrada único', () => {
  test('os quatro hooks chamam o shim com o subcomando hook', () => {
    const cfg = lerJson('hooks/hooks.json') as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    const comandos = Object.values(cfg.hooks)
      .flat()
      .flatMap(h => h.hooks.map(x => x.command))

    expect(comandos).toHaveLength(4)
    for (const cmd of comandos) {
      expect(cmd).toContain('bin/local-session')
      expect(cmd).toEndWith(' hook')
    }
  })

  test('o mcp.json sobe o server pelo subcomando mcp', () => {
    const cfg = lerJson('.claude-plugin/mcp.json') as {
      mcpServers: Record<string, { command: string; args: string[] }>
    }
    const server = cfg.mcpServers['local-session']
    expect(server?.args.join(' ')).toContain('bin/local-session')
    expect(server?.args.join(' ')).toEndWith(' mcp')
  })

  test('a variável do plugin fica numa string de shell, nunca no campo command', () => {
    const cfg = lerJson('.claude-plugin/mcp.json') as {
      mcpServers: Record<string, { command: string; args: string[] }>
    }
    // Só há prova de que `${CLAUDE_PLUGIN_ROOT}` é expandido dentro de uma linha
    // de comando (é o que os hooks fazem). No campo `command`, um harness que
    // não expanda deixaria o caminho literal e a sessão subiria sem MCP.
    expect(cfg.mcpServers['local-session']?.command).toBe('sh')
  })

  test('todo subcomando citado num manifesto existe no CLI', () => {
    const textos = [
      readFileSync(join(REPO, 'hooks', 'hooks.json'), 'utf8'),
      readFileSync(join(REPO, '.claude-plugin', 'mcp.json'), 'utf8'),
      readFileSync(join(REPO, 'commands', 'setup.md'), 'utf8'),
      readFileSync(join(REPO, 'commands', 'service.md'), 'utf8'),
    ].join('\n')

    const citados = [...textos.matchAll(/bin\/local-session"?\s+(\S+)/g)]
      .map(m => m[1]?.replace(/["',]/g, '') ?? '')
      .filter(s => s !== '' && !s.startsWith('-'))

    expect(citados.length).toBeGreaterThan(0)
    for (const cmd of citados) expect(COMMANDS).toContain(cmd as (typeof COMMANDS)[number])
  })
})

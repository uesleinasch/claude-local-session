import { describe, expect, test } from 'bun:test'
import type { Status } from '../src/status-core'
import {
  actionIds,
  aptInstallCommand,
  actionLabel,
  healthLabel,
  problemCount,
  resolveAction,
  resolveBinary,
  trayTooltip,
} from '../desktop/core.js'

describe('allowlist de ações', () => {
  test('id fora da lista não vira comando — o renderer nunca manda linha de comando', () => {
    expect(resolveAction('rm -rf /', '/usr/bin/local-session')).toBeNull()
    expect(resolveAction('', '/usr/bin/local-session')).toBeNull()
    expect(resolveAction('__proto__', '/usr/bin/local-session')).toBeNull()
  })

  test('toda ação anunciada resolve e tem rótulo para a UI', () => {
    for (const id of actionIds()) {
      expect(resolveAction(id, '/usr/bin/local-session'), id).not.toBeNull()
      expect(actionLabel(id), id).toBeTruthy()
    }
  })

  test('`self` vira o caminho do binário, que muda entre pacote e repo', () => {
    expect(resolveAction('setup', '/opt/x/local-session')).toEqual({
      bin: '/opt/x/local-session',
      args: ['setup'],
    })
  })

  test('o canal passa pelo pkexec: escrever em /etc exige privilégio', () => {
    const a = resolveAction('canal', '/usr/bin/local-session')
    expect(a?.bin).toBe('pkexec')
    expect(a?.args).toEqual(['/usr/bin/local-session', 'managed-settings', '--apply'])
  })

  test('nenhuma ação passa por shell — sempre binário mais argumentos', () => {
    for (const id of actionIds()) {
      const a = resolveAction(id, '/usr/bin/local-session')!
      expect(a.bin, id).not.toContain(' ')
      expect(['sh', 'bash', 'zsh'], id).not.toContain(a.bin)
    }
  })
})

describe('resolveBinary', () => {
  test('respeita a ordem dada — o do repo vence o do sistema', () => {
    const existe = (p: string) => p === '/repo/dist/local-session' || p === '/usr/bin/local-session'
    expect(resolveBinary(['/repo/dist/local-session', '/usr/bin/local-session'], existe)).toBe(
      '/repo/dist/local-session',
    )
  })

  test('cai para o próximo quando o primeiro não existe', () => {
    expect(resolveBinary(['/nao/existe', '/usr/bin/local-session'], p => p.startsWith('/usr'))).toBe(
      '/usr/bin/local-session',
    )
  })

  test('sem nenhum candidato válido, devolve null em vez de chutar', () => {
    expect(resolveBinary(['/a', '/b'], () => false)).toBeNull()
    expect(resolveBinary([null, undefined, ''], () => true)).toBeNull()
  })
})

describe('bandeja', () => {
  const BASE: Status = {
    version: { built: '0.12.0', installed: '0.12.0', mismatch: false },
    hub: { port: 7777, pid: 1, answering: true, managedByService: true },
    service: { installed: true, enabled: true, active: true, linger: true },
    links: { lan: null, tailscale: null },
    checks: [{ id: 'a', title: 't', health: 'ok', detail: 'd', section: 'geral' }],
    dependencies: [],
    health: 'ok',
  }
  const status = (over: Partial<Status> = {}): Status => ({ ...BASE, ...over })

  test('o tooltip diz versão e se o hub responde, sem precisar abrir a janela', () => {
    expect(trayTooltip(status())).toContain('0.12.0')
    expect(trayTooltip(status())).toContain('hub no ar (:7777)')
  })

  test('hub parado aparece como parado', () => {
    const s = status({ hub: { port: 7777, pid: null, answering: false, managedByService: false } })
    expect(trayTooltip(s)).toContain('hub parado')
  })

  test('sem status nenhum, diz que não houve resposta em vez de mentir', () => {
    expect(trayTooltip(null)).toContain('sem resposta')
    expect(problemCount(null)).toBe(0)
  })

  test('o contador conta só o que não está ok', () => {
    const s = status({
      checks: [
        { id: 'a', title: 't', health: 'ok', detail: 'd', section: 'geral' },
        { id: 'b', title: 't', health: 'warn', detail: 'd', section: 'geral' },
        { id: 'c', title: 't', health: 'fail', detail: 'd', section: 'geral' },
      ],
    })
    expect(problemCount(s)).toBe(2)
  })

  test('todo estado de saúde tem rótulo em português', () => {
    for (const h of ['ok', 'warn', 'fail']) expect(healthLabel(h)).not.toBe('desconhecido')
  })
})

describe('instalar dependências', () => {
  test('passa pelo pkexec: a senha é do diálogo do sistema, não da nossa janela', () => {
    const c = aptInstallCommand(['tmux'])
    expect(c?.bin).toBe('pkexec')
    expect(c?.args).toContain('apt-get')
  })

  test('sem terminal, o apt não pode ficar esperando resposta', () => {
    expect(aptInstallCommand(['tmux'])?.args).toContain('DEBIAN_FRONTEND=noninteractive')
  })

  test('nome de pacote é validado — a lista vem da UI e vira argv de root', () => {
    expect(aptInstallCommand(['tmux; rm -rf /'])).toBeNull()
    expect(aptInstallCommand(['--option=x'])).toBeNull()
    expect(aptInstallCommand(['/etc/passwd'])).toBeNull()
    expect(aptInstallCommand([])).toBeNull()
  })

  test('descarta o inválido e instala o válido em vez de recusar tudo', () => {
    expect(aptInstallCommand(['tmux', 'rm -rf /', 'git'])?.args.slice(-2)).toEqual(['tmux', 'git'])
  })

  test('aceita nomes reais do apt, com ponto, mais e hífen', () => {
    expect(aptInstallCommand(['libasound2t64', 'g++', 'libgtk-3-0'])?.args.slice(-3)).toEqual([
      'libasound2t64',
      'g++',
      'libgtk-3-0',
    ])
  })
})

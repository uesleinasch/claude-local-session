import { describe, expect, test } from 'bun:test'
import {
  buildChecks,
  buildDependencies,
  buildStatus,
  overallHealth,
  unitExecTarget,
  type StatusInput,
} from '../src/status-core'

const TUDO_OK: StatusInput = {
  builtVersion: '0.12.0',
  installedVersion: '0.12.0',
  pluginRegistered: true,
  hubPort: 7777,
  hubPid: 42,
  hubAnswering: true,
  serviceInstalled: true,
  serviceEnabled: true,
  serviceActive: true,
  unitStale: false,
  linger: true,
  managedOk: true,
  replyPermissionOk: true,
  aliasOk: true,
  lanUrl: 'http://192.168.1.2:7777/?t=x',
  tailscaleUrl: 'http://maquina.ts.net:7777/?t=x',
  dependencies: buildDependencies({
    hasClaude: true,
    hasTmux: true,
    hasGit: true,
    hasQrencode: true,
    hasPkexec: true,
    tailscale: 'running',
  }),
}

const SEM = (id: string) =>
  buildDependencies({
    hasClaude: id !== 'claude',
    hasTmux: id !== 'tmux',
    hasGit: id !== 'git',
    hasQrencode: id !== 'qrencode',
    hasPkexec: id !== 'pkexec',
    tailscale: id === 'tailscale' ? 'absent' : 'running',
  })

const check = (i: StatusInput, id: string) => buildChecks(i).find(c => c.id === id)

describe('overallHealth', () => {
  test('uma falha manda em tudo — não vira "quase bem"', () => {
    expect(
      overallHealth([
        { id: 'a', title: '', health: 'ok', detail: '', section: 'geral' },
        { id: 'b', title: '', health: 'fail', detail: '', section: 'geral' },
        { id: 'c', title: '', health: 'warn', detail: '', section: 'geral' },
      ]),
    ).toBe('fail')
  })

  test('sem falha, um aviso basta para não ser ok', () => {
    expect(
      overallHealth([
        { id: 'a', title: '', health: 'ok', detail: '', section: 'geral' },
        { id: 'b', title: '', health: 'warn', detail: '', section: 'geral' },
      ]),
    ).toBe('warn')
  })

  test('tudo ok é ok', () => {
    expect(overallHealth([{ id: 'a', title: '', health: 'ok', detail: '', section: 'geral' }])).toBe('ok')
  })
})

describe('as três camadas do canal', () => {
  test('canal desligado em /etc é falha, não aviso — o prompt some calado', () => {
    expect(check({ ...TUDO_OK, managedOk: false }, 'canal-managed')?.health).toBe('fail')
  })

  test('cada camada que falta vem com o comando que resolve', () => {
    const i = { ...TUDO_OK, managedOk: false, aliasOk: false, replyPermissionOk: false }
    for (const id of ['canal-managed', 'canal-alias', 'canal-permissao']) {
      expect(check(i, id)?.fix, id).toBeTruthy()
    }
  })

  test('camada satisfeita não sugere comando nenhum', () => {
    for (const id of ['canal-managed', 'canal-alias', 'canal-permissao']) {
      expect(check(TUDO_OK, id)?.fix, id).toBeUndefined()
    }
  })
})

describe('plugin e Claude Code', () => {
  test('plugin não registrado é falha: sem ele não há hook, MCP nem página', () => {
    expect(check({ ...TUDO_OK, pluginRegistered: false }, 'plugin')?.health).toBe('fail')
  })

  test('Claude Code ausente derruba a saúde mesmo com todo check passando', () => {
    const s = buildStatus({ ...TUDO_OK, dependencies: SEM('claude') })
    expect(s.health).toBe('fail')
  })
})

describe('serviço e linger', () => {
  test('unit ausente vira aviso com o comando que instala', () => {
    const c = check({ ...TUDO_OK, serviceInstalled: false, serviceEnabled: false }, 'servico')
    expect(c?.health).toBe('warn')
    expect(c?.fix).toBe('local-session service')
  })

  test('linger só é cobrado quando há serviço habilitado para sobreviver', () => {
    expect(check({ ...TUDO_OK, linger: false }, 'linger')?.health).toBe('warn')
    expect(check({ ...TUDO_OK, serviceEnabled: false, linger: false }, 'linger')).toBeUndefined()
  })
})

describe('unit órfã', () => {
  test('unit apontando para outro root vira aviso com o comando que reescreve', () => {
    const c = check({ ...TUDO_OK, unitStale: true }, 'unit-orfa')
    expect(c?.health).toBe('warn')
    expect(c?.fix).toBe('local-session service')
  })

  test('unit em dia não polui a lista', () => {
    expect(check(TUDO_OK, 'unit-orfa')).toBeUndefined()
  })
})

describe('buildStatus', () => {
  test('tudo em ordem dá saúde ok', () => {
    expect(buildStatus(TUDO_OK).health).toBe('ok')
  })

  test('hub respondendo fora do systemd não conta como gerenciado', () => {
    const s = buildStatus({ ...TUDO_OK, serviceActive: false })
    expect(s.hub.answering).toBe(true)
    expect(s.hub.managedByService).toBe(false)
  })

  test('versão divergente entra como aviso e no resumo', () => {
    const s = buildStatus({ ...TUDO_OK, installedVersion: '0.9.0' })
    expect(s.version.mismatch).toBe(true)
    expect(s.health).toBe('warn')
  })

  test('sem cópia instalada não inventa divergência', () => {
    expect(buildStatus({ ...TUDO_OK, installedVersion: null }).version.mismatch).toBe(false)
  })

  test('todo check tem título e detalhe — a UI não mostra linha vazia', () => {
    for (const c of buildStatus({ ...TUDO_OK, dependencies: SEM('claude'), managedOk: false }).checks) {
      expect(c.title.length, c.id).toBeGreaterThan(0)
      expect(c.detail.length, c.id).toBeGreaterThan(0)
    }
  })

  test('ids são únicos — a UI usa como chave', () => {
    const ids = buildStatus({ ...TUDO_OK, dependencies: SEM('claude'), installedVersion: '0.1.0' }).checks.map(
      c => c.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('unitExecTarget', () => {
  test('unit do fonte aponta para o hub.ts, que é o que pode sumir', () => {
    const unit = 'ExecStart=/home/u/.bun/bin/bun /home/u/cache/0.5.0/src/hub.ts\nRestart=on-failure'
    expect(unitExecTarget(unit)).toBe('/home/u/cache/0.5.0/src/hub.ts')
  })

  test('unit do binário aponta para o executável', () => {
    expect(unitExecTarget('ExecStart=/usr/bin/local-session hub')).toBe('/usr/bin/local-session')
  })

  test('unit sem ExecStart não vira alvo inventado', () => {
    expect(unitExecTarget('[Service]\nType=simple')).toBeNull()
  })
})

describe('dependências', () => {
  test('cada uma diz o que se perde sem ela, não só que falta', () => {
    for (const d of SEM('tmux')) expect(d.detail.length, d.id).toBeGreaterThan(10)
  })

  test('o que o apt resolve tem pacote; o que não, tem link', () => {
    for (const d of buildDependencies({
      hasClaude: false,
      hasTmux: false,
      hasGit: false,
      hasQrencode: false,
      hasPkexec: false,
      tailscale: 'absent',
    })) {
      expect(Boolean(d.aptPackage || d.url), d.id).toBe(true)
    }
  })

  test('tailscale não é instalável por aqui — repo de terceiros e login interativo', () => {
    const ts = SEM('tailscale').find(d => d.id === 'tailscale')
    expect(ts?.aptPackage).toBeUndefined()
    expect(ts?.url).toBeTruthy()
  })

  test('só o Claude Code é obrigatório: o resto degrada, não impede', () => {
    const obrigatorias = SEM('tmux').filter(d => d.required).map(d => d.id)
    expect(obrigatorias).toEqual(['claude'])
  })

  test('faltar o que não é obrigatório não vira falha geral', () => {
    expect(buildStatus({ ...TUDO_OK, dependencies: SEM('git') }).health).not.toBe('fail')
  })
})

describe('seções', () => {
  test('todo check pertence a uma seção da janela', () => {
    const validas = ['geral', 'acesso', 'dependencias', 'servico', 'canal']
    for (const c of buildStatus(TUDO_OK).checks) expect(validas, c.id).toContain(c.section)
  })

  test('as três camadas do canal ficam juntas', () => {
    const canal = buildStatus(TUDO_OK).checks.filter(c => c.section === 'canal')
    expect(canal.map(c => c.id).sort()).toEqual(['canal-alias', 'canal-managed', 'canal-permissao'])
  })
})

export type Health = 'ok' | 'warn' | 'fail'

/**
 * O que a unit executa, para checar se ainda existe no disco. Comparar o texto
 * da unit com o que o setup geraria daria falso positivo o tempo todo: rodando
 * do fonte a raiz é o repo, e a unit instalada aponta para o cache. O que
 * importa é se o alvo **sumiu** — unit apontando para um diretório de versão
 * apagado sobe no boot e ressuscita código velho.
 */
export function unitExecTarget(unit: string): string | null {
  const m = unit.match(/^ExecStart=(\S+)(?:[ \t]+(\S+))?/m)
  if (!m?.[1]) return null
  const arg = m[2]
  return arg !== undefined && arg.endsWith('.ts') ? arg : m[1]
}

export type Check = {
  id: string
  title: string
  health: Health
  detail: string
  /** Comando que resolve, quando existe um. */
  fix?: string
}

export type StatusInput = {
  builtVersion: string
  installedVersion: string | null
  pluginRegistered: boolean
  hubPort: number
  hubPid: number | null
  hubAnswering: boolean
  serviceInstalled: boolean
  serviceEnabled: boolean
  serviceActive: boolean
  /** Unit cujo alvo não existe mais no disco — resíduo de deploy. */
  unitStale: boolean
  linger: boolean
  managedOk: boolean
  replyPermissionOk: boolean
  aliasOk: boolean
  hasTmux: boolean
  hasClaude: boolean
  lanUrl: string | null
  tailscaleUrl: string | null
  tailscaleDetail: string | null
}

export type Status = {
  version: { built: string; installed: string | null; mismatch: boolean }
  hub: { port: number; pid: number | null; answering: boolean; managedByService: boolean }
  service: { installed: boolean; enabled: boolean; active: boolean; linger: boolean }
  links: { lan: string | null; tailscale: string | null }
  checks: Check[]
  health: Health
}

/** A pior de todas manda: uma falha não vira "quase tudo bem". */
export function overallHealth(checks: readonly Check[]): Health {
  if (checks.some(c => c.health === 'fail')) return 'fail'
  if (checks.some(c => c.health === 'warn')) return 'warn'
  return 'ok'
}

/**
 * As três camadas do canal falham **em silêncio** — o plugin instala, serve a
 * página e registra atividade, e o prompt é descartado antes de chegar ao
 * modelo. Por isso cada uma é um check próprio, com o comando que resolve.
 */
export function buildChecks(i: StatusInput): Check[] {
  const checks: Check[] = []

  checks.push({
    id: 'plugin',
    title: 'plugin registrado no Claude Code',
    health: i.pluginRegistered ? 'ok' : 'fail',
    detail: i.pluginRegistered
      ? 'o Claude Code enxerga o plugin'
      : 'sem isto não há hook, nem MCP, nem página',
    ...(i.pluginRegistered ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'canal-managed',
    title: 'canal habilitado em /etc',
    health: i.managedOk ? 'ok' : 'fail',
    detail: i.managedOk
      ? 'channelsEnabled e o plugin na allowlist'
      : 'o prompt da página é descartado antes de chegar ao modelo',
    ...(i.managedOk ? {} : { fix: 'sudo local-session managed-settings --apply' }),
  })

  checks.push({
    id: 'canal-alias',
    title: 'sessões novas abrem com --channels',
    health: i.aliasOk ? 'ok' : 'warn',
    detail: i.aliasOk
      ? 'a função de shell está no rc'
      : 'sem a flag por sessão, a sessão nasce sem canal',
    ...(i.aliasOk ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'canal-permissao',
    title: 'tool reply dispensada de confirmação',
    health: i.replyPermissionOk ? 'ok' : 'warn',
    detail: i.replyPermissionOk
      ? 'as respostas chegam à página sem passar por card'
      : 'cada resposta fica parada num card de permissão',
    ...(i.replyPermissionOk ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'hub',
    title: 'hub no ar',
    health: i.hubAnswering ? 'ok' : 'warn',
    detail: i.hubAnswering
      ? `respondendo na porta ${i.hubPort}${i.hubPid === null ? '' : ` (pid ${i.hubPid})`}`
      : 'a página não abre enquanto ele estiver parado',
    ...(i.hubAnswering ? {} : { fix: 'systemctl --user start local-session-hub' }),
  })

  // Sem serviço o hub só sobe na primeira sessão do Claude Code, e depois de um
  // reboot a página fica muda até alguém abrir um terminal.
  const serviceHealth: Health = !i.serviceInstalled ? 'warn' : i.serviceEnabled ? 'ok' : 'warn'
  checks.push({
    id: 'servico',
    title: 'hub sobe com o sistema',
    health: serviceHealth,
    detail: !i.serviceInstalled
      ? 'unit do systemd não instalada'
      : i.serviceEnabled
        ? `habilitado no boot${i.serviceActive ? ' e ativo agora' : ''}`
        : 'unit instalada, mas não habilitada',
    ...(serviceHealth === 'ok' ? {} : { fix: 'local-session service' }),
  })

  // Sem linger o serviço de usuário morre com o logout — que é exatamente o
  // caso do reboot sem ninguém logar na máquina.
  if (i.serviceEnabled) {
    checks.push({
      id: 'linger',
      title: 'serviço sobrevive ao logout',
      health: i.linger ? 'ok' : 'warn',
      detail: i.linger
        ? 'linger ligado'
        : 'sem linger, o hub só roda enquanto você estiver logado',
      ...(i.linger ? {} : { fix: `loginctl enable-linger $USER` }),
    })
  }

  checks.push({
    id: 'tmux',
    title: 'controles que dependem do tmux',
    health: i.hasTmux ? 'ok' : 'warn',
    detail: i.hasTmux
      ? 'interromper, responder pergunta, trocar modelo e abrir sessão'
      : 'sem tmux esses controles não aparecem na página',
    ...(i.hasTmux ? {} : { fix: 'sudo apt install tmux' }),
  })

  if (!i.hasClaude) {
    checks.push({
      id: 'claude',
      title: 'Claude Code instalado',
      health: 'fail',
      detail: 'o plugin existe para uma sessão do Claude Code — sem ele não há o que servir',
      fix: 'https://claude.com/claude-code',
    })
  }

  if (i.installedVersion !== null && i.installedVersion !== i.builtVersion) {
    checks.push({
      id: 'versao',
      title: 'plugin desatualizado',
      health: 'warn',
      detail: `o executável é ${i.builtVersion} e a cópia no cache é ${i.installedVersion}`,
      fix: 'local-session setup',
    })
  }

  // Unit apontando para outro root sobe no boot e ressuscita código velho —
  // sintoma clássico de "atualizei e continua o comportamento antigo".
  if (i.unitStale) {
    checks.push({
      id: 'unit-orfa',
      title: 'unit do systemd aponta para um caminho que sumiu',
      health: 'warn',
      detail: 'no próximo boot o serviço não sobe',
      fix: 'local-session service',
    })
  }

  if (i.tailscaleDetail !== null) {
    checks.push({
      id: 'tailscale',
      title: 'acesso de fora da rede local',
      health: i.tailscaleUrl === null ? 'warn' : 'ok',
      detail: i.tailscaleDetail,
    })
  }

  return checks
}

export function buildStatus(i: StatusInput): Status {
  const checks = buildChecks(i)
  return {
    version: {
      built: i.builtVersion,
      installed: i.installedVersion,
      mismatch: i.installedVersion !== null && i.installedVersion !== i.builtVersion,
    },
    hub: {
      port: i.hubPort,
      pid: i.hubPid,
      answering: i.hubAnswering,
      // Hub respondendo sem ser o do systemd é o respawnado por uma sessão:
      // funciona igual, mas não volta sozinho depois de um reboot.
      managedByService: i.serviceActive && i.hubAnswering,
    },
    service: {
      installed: i.serviceInstalled,
      enabled: i.serviceEnabled,
      active: i.serviceActive,
      linger: i.linger,
    },
    links: { lan: i.lanUrl, tailscale: i.tailscaleUrl },
    checks,
    health: overallHealth(checks),
  }
}

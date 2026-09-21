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

/** Seções da janela: agrupar é o que evita a lista corrida de 10 itens. */
export type Section = 'geral' | 'acesso' | 'dependencias' | 'servico' | 'canal'

export type Check = {
  id: string
  title: string
  health: Health
  detail: string
  section: Section
  /** Comando que resolve, quando existe um. */
  fix?: string
}

export type Dependency = {
  id: string
  title: string
  present: boolean
  detail: string
  /** Sem ele nada funciona; senão, funciona pela metade. */
  required: boolean
  /** Pacote que o apt instala. Ausente = instalação não é nossa para fazer. */
  aptPackage?: string
  /** Onde aprender a instalar, quando o apt não resolve. */
  url?: string
}

export type DependencyInput = {
  hasClaude: boolean
  hasTmux: boolean
  hasGit: boolean
  hasQrencode: boolean
  hasPkexec: boolean
  tailscale: 'running' | 'stopped' | 'needs-login' | 'absent'
}

/**
 * O que dá para instalar com um clique e o que não dá. `tailscale` fica de
 * fora de propósito (decidido em 2026-08-21): não está nos repos do
 * Ubuntu/Debian, e o passo que trava não é instalar, é o login interativo em
 * outro aparelho. Oferecer, não instalar.
 */
export function buildDependencies(i: DependencyInput): Dependency[] {
  return [
    {
      id: 'claude',
      title: 'Claude Code',
      present: i.hasClaude,
      required: true,
      detail: i.hasClaude
        ? 'é a razão de tudo isto existir'
        : 'sem uma sessão do Claude Code não há o que servir',
      url: 'https://claude.com/claude-code',
    },
    {
      id: 'tmux',
      title: 'tmux',
      present: i.hasTmux,
      required: false,
      aptPackage: 'tmux',
      detail: i.hasTmux
        ? 'interromper, responder pergunta, trocar modelo e abrir sessão'
        : 'sem ele esses controles somem da página, sem dizer por quê',
    },
    {
      id: 'git',
      title: 'git',
      present: i.hasGit,
      required: false,
      aptPackage: 'git',
      detail: i.hasGit ? 'o botão "mudanças" lê o repositório da sessão' : 'sem ele o botão "mudanças" não tem o que ler',
    },
    {
      id: 'qrencode',
      title: 'qrencode',
      present: i.hasQrencode,
      required: false,
      aptPackage: 'qrencode',
      detail: i.hasQrencode
        ? 'gera o QR code para abrir a página no celular'
        : 'sem ele sobra copiar o link e digitar no celular',
    },
    {
      id: 'pkexec',
      title: 'pkexec',
      present: i.hasPkexec,
      required: false,
      aptPackage: 'policykit-1',
      detail: i.hasPkexec
        ? 'pede a senha pelo diálogo do sistema quando algo exige root'
        : 'sem ele, instalar e habilitar o canal só pelo terminal',
    },
    {
      id: 'tailscale',
      title: 'Tailscale',
      present: i.tailscale === 'running',
      required: false,
      detail:
        i.tailscale === 'running'
          ? 'acesso de qualquer lugar, sem expor porta'
          : i.tailscale === 'stopped'
            ? 'instalado, mas desligado: `tailscale up`'
            : i.tailscale === 'needs-login'
              ? 'falta autenticar: `tailscale up`'
              : 'opcional — acessar de fora da rede local sem abrir porta',
      url: 'https://tailscale.com/download',
    },
  ]
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
  lanUrl: string | null
  tailscaleUrl: string | null
  dependencies: Dependency[]
}

export type Status = {
  version: { built: string; installed: string | null; mismatch: boolean }
  hub: { port: number; pid: number | null; answering: boolean; managedByService: boolean }
  service: { installed: boolean; enabled: boolean; active: boolean; linger: boolean }
  links: { lan: string | null; tailscale: string | null }
  checks: Check[]
  dependencies: Dependency[]
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
    section: 'geral',
    title: 'plugin registrado no Claude Code',
    health: i.pluginRegistered ? 'ok' : 'fail',
    detail: i.pluginRegistered
      ? 'o Claude Code enxerga o plugin'
      : 'sem isto não há hook, nem MCP, nem página',
    ...(i.pluginRegistered ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'canal-managed',
    section: 'canal',
    title: 'canal habilitado em /etc',
    health: i.managedOk ? 'ok' : 'fail',
    detail: i.managedOk
      ? 'channelsEnabled e o plugin na allowlist'
      : 'o prompt da página é descartado antes de chegar ao modelo',
    ...(i.managedOk ? {} : { fix: 'sudo local-session managed-settings --apply' }),
  })

  checks.push({
    id: 'canal-alias',
    section: 'canal',
    title: 'sessões novas abrem com --channels',
    health: i.aliasOk ? 'ok' : 'warn',
    detail: i.aliasOk
      ? 'a função de shell está no rc'
      : 'sem a flag por sessão, a sessão nasce sem canal',
    ...(i.aliasOk ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'canal-permissao',
    section: 'canal',
    title: 'tool reply dispensada de confirmação',
    health: i.replyPermissionOk ? 'ok' : 'warn',
    detail: i.replyPermissionOk
      ? 'as respostas chegam à página sem passar por card'
      : 'cada resposta fica parada num card de permissão',
    ...(i.replyPermissionOk ? {} : { fix: 'local-session setup' }),
  })

  checks.push({
    id: 'hub',
    section: 'servico',
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
    section: 'servico',
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
      section: 'servico',
      title: 'serviço sobrevive ao logout',
      health: i.linger ? 'ok' : 'warn',
      detail: i.linger
        ? 'linger ligado'
        : 'sem linger, o hub só roda enquanto você estiver logado',
      ...(i.linger ? {} : { fix: `loginctl enable-linger $USER` }),
    })
  }

  if (i.installedVersion !== null && i.installedVersion !== i.builtVersion) {
    checks.push({
      id: 'versao',
    section: 'geral',
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
    section: 'servico',
      title: 'unit do systemd aponta para um caminho que sumiu',
      health: 'warn',
      detail: 'no próximo boot o serviço não sobe',
      fix: 'local-session service',
    })
  }

  return checks
}

export function buildStatus(i: StatusInput): Status {
  const checks = buildChecks(i)
  // Dependência obrigatória ausente é falha mesmo que todo check passe: sem o
  // Claude Code o resto funciona e não serve para nada.
  const faltaEssencial = i.dependencies.some(d => d.required && !d.present)
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
    dependencies: i.dependencies,
    health: faltaEssencial ? 'fail' : overallHealth(checks),
  }
}

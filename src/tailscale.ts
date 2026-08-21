/**
 * Estado do Tailscale na máquina. A tool `link` precisa distinguir "não tem" de
 * "tem, mas está desligado": a detecção por faixa CGNAT (`tailscaleAddress`) só
 * sabe dizer se existe um IP 100.x, então nos dois casos o endereço da tailnet
 * apenas desaparecia da saída, sem dizer o que fazer para trazê-lo de volta.
 */
export type TailscaleState =
  | { kind: 'absent' }
  | { kind: 'needs-login' }
  | { kind: 'stopped' }
  | { kind: 'running'; host: string }

/** A tool `link` é interativa: um `tailscaled` pendurado não pode travá-la. */
const STATUS_TIMEOUT_MS = 500

function selfHost(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const self = raw as Record<string, unknown>
  // MagicDNS chega como FQDN raiz ("host.tailnet.ts.net."); o ponto final vira
  // parte da URL se não for aparado.
  const dns = typeof self.DNSName === 'string' ? self.DNSName.replace(/\.$/, '') : ''
  if (dns !== '') return dns
  const ips = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : []
  // Só IPv4: o IPv6 da tailnet exigiria colchetes na URL e ninguém digita isso.
  for (const ip of ips) if (typeof ip === 'string' && !ip.includes(':')) return ip
  return null
}

export function parseStatus(raw: unknown): TailscaleState | null {
  if (typeof raw !== 'object' || raw === null) return null
  switch ((raw as Record<string, unknown>).BackendState) {
    case 'Running': {
      const host = selfHost((raw as Record<string, unknown>).Self)
      return host === null ? null : { kind: 'running', host }
    }
    case 'Stopped':
      return { kind: 'stopped' }
    case 'NeedsLogin':
    case 'NeedsMachineAuth':
    case 'NoState':
      return { kind: 'needs-login' }
    // 'Starting' e o que vier de versão nova: null deixa o fallback por
    // interface responder, que num estado transitório já acha o IP.
    default:
      return null
  }
}

export function setupSteps(state: TailscaleState): string[] {
  switch (state.kind) {
    case 'absent':
      return [
        '  1. curl -fsSL https://tailscale.com/install.sh | sh',
        '  2. sudo tailscale up',
        '  3. instale o app Tailscale no celular e entre com a mesma conta',
      ]
    case 'needs-login':
      return ['  sudo tailscale up   (e entre com a mesma conta do celular)']
    case 'stopped':
      return ['  sudo tailscale up']
    case 'running':
      return []
  }
}

export function tailscaleLines(state: TailscaleState, port: number, token: string): string[] {
  if (state.kind === 'running') {
    return [
      '',
      'Tailscale (funciona de qualquer lugar, com o app logado no celular):',
      `http://${state.host}:${port}/?t=${token}`,
    ]
  }
  const headline: Record<Exclude<TailscaleState['kind'], 'running'>, string> = {
    absent: `Tailscale não está instalado — é o caminho para acessar de fora da LAN, sem expor a porta ${port} na internet:`,
    stopped: 'Tailscale está instalado mas desligado — religue e o endereço da tailnet volta a aparecer aqui:',
    'needs-login':
      'Tailscale está instalado mas sem autenticação — entre com a sua conta e o endereço da tailnet aparece aqui:',
  }
  return ['', headline[state.kind], ...setupSteps(state)]
}

/**
 * Junta o veredito do CLI com a detecção por interface. Um IP na faixa CGNAT é
 * prova de tailnet de pé e vale mais que a ausência do binário — o `tailscale`
 * pode estar fora do PATH deste processo (o mesmo tropeço que o `bun` dos hooks
 * já dá), e aí ensinar a instalar perderia o endereço que a interface entrega.
 * Quando o CLI responde qualquer outra coisa, ele é a fonte melhor: só ele sabe
 * separar "desligado" de "sem autenticação".
 */
export function resolveState(
  probed: TailscaleState | null,
  fallbackIp: string | null,
): TailscaleState | null {
  if (probed !== null && probed.kind !== 'absent') return probed
  if (fallbackIp !== null) return { kind: 'running', host: fallbackIp }
  return probed
}

export type StatusRunner = () => Promise<{ found: boolean; json: string | null }>

async function runStatus(): Promise<{ found: boolean; json: string | null }> {
  if (Bun.which('tailscale') === null) return { found: false, json: null }
  try {
    const proc = Bun.spawn(['tailscale', 'status', '--json'], { stdout: 'pipe', stderr: 'ignore' })
    const timer = setTimeout(() => proc.kill(), STATUS_TIMEOUT_MS)
    // Ler antes de esperar o exit: um stdout cheio travaria o processo que não
    // teve a saída consumida, e o timeout mataria uma execução sadia.
    const json = await new Response(proc.stdout).text()
    clearTimeout(timer)
    return { found: true, json: (await proc.exited) === 0 ? json : null }
  } catch {
    return { found: true, json: null }
  }
}

/**
 * `absent` só quando não há binário. Comando que falhou ou estourou o tempo é
 * `null` — "não sei", e quem chama recorre ao fallback por interface em vez de
 * ensinar a instalar o que já está instalado.
 */
export async function probeTailscale(run: StatusRunner = runStatus): Promise<TailscaleState | null> {
  const { found, json } = await run()
  if (!found) return { kind: 'absent' }
  if (json === null) return null
  try {
    return parseStatus(JSON.parse(json))
  } catch {
    return null
  }
}

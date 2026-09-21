export type Rotulo = 'lan' | 'vpn'

export type Candidato = { rotulo: Rotulo; host: string }

export type Enderecos = {
  lan: string | null
  tailscale: string | null
  hostname: string | null
}

export type Descoberta = {
  versao: string
  porta: number
  candidatos: Candidato[]
  ntfy?: string
}

export type EntradasDescoberta = Enderecos & {
  versao: string
  porta: number
  ntfy: string | undefined
}

const INUTEIS = new Set(['', '127.0.0.1', '::1', 'localhost'])

function util(host: string | null): host is string {
  return host !== null && !INUTEIS.has(host)
}

function comLocal(hostname: string): string {
  return hostname.endsWith('.local') ? hostname : `${hostname}.local`
}

export function montarCandidatos({ lan, tailscale, hostname }: Enderecos): Candidato[] {
  const brutos: Candidato[] = []
  if (util(lan)) brutos.push({ rotulo: 'lan', host: lan })
  if (util(hostname)) brutos.push({ rotulo: 'lan', host: comLocal(hostname) })
  if (util(tailscale)) brutos.push({ rotulo: 'vpn', host: tailscale })

  const vistos = new Set<string>()
  return brutos.filter(c => {
    if (vistos.has(c.host)) return false
    vistos.add(c.host)
    return true
  })
}

export function montarDescoberta({
  versao,
  porta,
  ntfy,
  ...enderecos
}: EntradasDescoberta): Descoberta {
  const base: Descoberta = { versao, porta, candidatos: montarCandidatos(enderecos) }
  // Campo ausente é o sinal de "sem ntfy configurado"; `ntfy: undefined` sumiria
  // no JSON mas apareceria em qualquer comparação estrutural do lado do app.
  return util(ntfy ?? null) ? { ...base, ntfy } : base
}

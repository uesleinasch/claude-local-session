import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PORT } from './protocol'

export type Config = {
  token: string
  port: number
  projects?: string[]
  /** Diretórios-pai: todo subdiretório vira projeto elegível para nova sessão. */
  projectsRoot?: string[]
  /** Tópico ntfy que recebe os avisos, ex.: https://ntfy.sh/meu-topico. */
  notifyUrl?: string
}

export function configDir(): string {
  return process.env.LOCAL_SESSION_DIR ?? join(homedir(), '.claude', 'local-session')
}

function isConfig(v: unknown): v is Config {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.token === 'string' && o.token.length >= 32 && Number.isInteger(o.port)
}

function withPortOverride(cfg: Config): Config {
  const raw = process.env.LOCAL_SESSION_PORT
  if (raw === undefined) return cfg
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 ? { ...cfg, port } : cfg
}

function withCleanNotifyUrl(cfg: Config): Config {
  if (typeof cfg.notifyUrl === 'string' && cfg.notifyUrl !== '') return cfg
  const { notifyUrl: _drop, ...rest } = cfg
  return rest
}

/** Lê sem criar — usado pelos hooks, que não devem materializar config nenhum. */
export function readConfig(dir = configDir()): Config | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    return isConfig(parsed) ? withCleanNotifyUrl(withPortOverride(parsed)) : null
  } catch {
    return null
  }
}

export function loadConfig(dir = configDir()): Config {
  const file = join(dir, 'config.json')
  const existing = readConfig(dir)
  if (existing) return existing

  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const fresh: Config = { token: randomBytes(32).toString('hex'), port: DEFAULT_PORT }
  const data = `${JSON.stringify(fresh, null, 2)}\n`

  try {
    // 'wx' é O_CREAT|O_EXCL: duas sessões subindo juntas não sobrescrevem uma à outra,
    // a perdedora relê o token da vencedora em vez de gerar um segundo.
    writeFileSync(file, data, { mode: 0o600, flag: 'wx' })
    return withPortOverride(fresh)
  } catch {}

  const rival = readConfig(dir)
  if (rival) return rival

  // Arquivo existente porém inválido: sobrescrever direto ignoraria o mode 0600
  // e deixaria um config pela metade visível a outra sessão — tmp + rename é atômico.
  const tmp = join(dir, `config.json.${process.pid}.tmp`)
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, file)
  return withPortOverride(fresh)
}

/**
 * Persiste os favoritos (chave `projects`) preservando o resto do arquivo.
 * Lê o JSON cru — nunca o Config já processado — para não gravar de volta
 * um port sobreposto por LOCAL_SESSION_PORT.
 */
export function saveProjects(projects: string[], dir = configDir()): boolean {
  const file = join(dir, 'config.json')
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const tmp = join(dir, `config.json.${process.pid}.tmp`)
    writeFileSync(tmp, `${JSON.stringify({ ...raw, projects }, null, 2)}\n`, { mode: 0o600 })
    renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

export function tokenMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

type Iface = { family: string; address: string; internal: boolean }

/** 100.64.0.0/10 (CGNAT) — a faixa que o Tailscale usa nas tailnets. */
function isCgnat(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return a === 100 && b !== undefined && b >= 64 && b <= 127
}

/**
 * IPv4 da tailnet, se houver. Identifica pela faixa CGNAT em vez do nome da
 * interface, que varia por plataforma (tailscale0 no Linux, utun no macOS).
 */
export function tailscaleAddress(
  nets: Record<string, Iface[] | undefined> = networkInterfaces(),
): string | null {
  for (const addrs of Object.values(nets)) {
    for (const iface of addrs ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isCgnat(iface.address)) {
        return iface.address
      }
    }
  }
  return null
}

/** IP da interface que a rota default usaria — evita as bridges do Docker. */
export function lanAddress(): Promise<string> {
  return new Promise(resolve => {
    const sock = createSocket('udp4')
    const done = (addr: string) => {
      try {
        sock.close()
      } catch {}
      resolve(addr)
    }
    sock.on('error', () => done('127.0.0.1'))
    try {
      // connect em UDP não envia pacote, só fixa a rota de saída.
      sock.connect(53, '1.1.1.1', () => done(sock.address().address))
    } catch {
      done('127.0.0.1')
    }
  })
}

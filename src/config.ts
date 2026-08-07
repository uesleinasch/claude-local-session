import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PORT } from './protocol'

export type Config = { token: string; port: number }

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

/** Lê sem criar — usado pelos hooks, que não devem materializar config nenhum. */
export function readConfig(dir = configDir()): Config | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    return isConfig(parsed) ? withPortOverride(parsed) : null
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

  writeFileSync(file, data, { mode: 0o600 })
  return withPortOverride(fresh)
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

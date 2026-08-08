import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Diretórios do plugin que o deploy espelha do repo para o cache. */
export const SYNC_DIRS = ['src', 'web', 'hooks', 'commands']
export const SYNC_FILES = [join('.claude-plugin', 'plugin.json')]

/**
 * Quem escuta a porta, lido do `ss -tlnp`. Casar só o endereço local evita
 * confundir um pid com a porta e `:17777` com `:7777`.
 */
export function pidsOnPort(ssOutput: string, port: number): number[] {
  const found: number[] = []
  for (const line of ssOutput.split('\n')) {
    const local = line.trim().split(/\s+/)[3]
    if (local === undefined || !local.endsWith(`:${port}`)) continue
    for (const m of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(m[1])
      if (Number.isInteger(pid) && !found.includes(pid)) found.push(pid)
    }
  }
  return found
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return a.localeCompare(b)
}

/**
 * Todas as versões no cache, não só a última: uma sessão antiga respawna o hub
 * do próprio root, então deixar um diretório para trás ressuscita código velho.
 */
export function versionDirs(pluginCacheRoot: string): string[] {
  try {
    return readdirSync(pluginCacheRoot, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort(compareVersions)
      .map(name => join(pluginCacheRoot, name))
  } catch {
    return []
  }
}

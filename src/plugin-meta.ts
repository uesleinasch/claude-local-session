import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import marketplaceJson from '../.claude-plugin/marketplace.json'
import pluginJson from '../.claude-plugin/plugin.json'
import type { PluginIdentity } from './setup-core'

/**
 * Versão de dentro do executável. O import de JSON é embutido por
 * `bun build --compile`, então isto continua valendo com o binário rodando
 * longe de qualquer arquivo do plugin.
 */
export const BUILT_VERSION: string = pluginJson.version

/**
 * Identidade sem tocar o disco: o `postinst` do pacote roda antes de existir
 * qualquer plugin instalado e mesmo assim precisa saber o que pôr na allowlist.
 */
export const BUILT_IDENTITY: PluginIdentity = {
  plugin: pluginJson.name,
  marketplace: marketplaceJson.name,
}

export type VersionMismatch = { built: string; installed: string }

/**
 * `apt upgrade` troca o binário, mas a árvore do plugin é **copiada** para
 * `~/.claude/plugins/cache` de cada usuário e continua velha. Enquanto só o
 * binário muda isso é inócuo; quando um manifesto muda (hook novo, subcomando
 * novo), o sintoma seria silencioso. Daí comparar e avisar na página.
 */
export function pluginMismatch(built: string, installed: string | null): VersionMismatch | null {
  if (installed === null || installed === '' || installed === built) return null
  return { built, installed }
}

export function installedVersion(root: string): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
    const version = (raw as { version?: unknown }).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

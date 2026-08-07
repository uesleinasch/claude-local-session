import { join } from 'node:path'

/** Nome do server dentro do .mcp.json — compõe o identificador da tool. */
export const SERVER_NAME = 'local-session'
export const MANAGED_SETTINGS_PATH = '/etc/claude-code/managed-settings.json'

const ALIAS_BEGIN = '# >>> local-session >>>'
const ALIAS_END = '# <<< local-session <<<'

export type PluginIdentity = { plugin: string; marketplace: string }

export type ManagedSettings = {
  channelsEnabled?: boolean
  allowedChannelPlugins?: PluginIdentity[]
  [key: string]: unknown
}

export type Merge<T> = { next: T; changed: boolean }

/** `.../plugins/cache/<marketplace>/<plugin>/<versão>` → identidade. */
export function detectPluginIdentity(pluginRoot: string): PluginIdentity | null {
  const parts = pluginRoot.split('/').filter(p => p !== '')
  const at = parts.lastIndexOf('cache')
  if (at === -1) return null
  const marketplace = parts[at + 1]
  const plugin = parts[at + 2]
  if (!marketplace || !plugin) return null
  return { plugin, marketplace }
}

export function aliasCommand(id: PluginIdentity): string {
  return `alias claude='claude --channels plugin:${id.plugin}@${id.marketplace}'`
}

export function replyToolName(id: PluginIdentity): string {
  return `mcp__plugin_${id.plugin}_${SERVER_NAME}__reply`
}

export function rcPathFor(shell: string, home: string): string {
  if (shell.includes('zsh')) return join(home, '.zshrc')
  if (shell.includes('bash')) return join(home, '.bashrc')
  return join(home, '.profile')
}

/**
 * Só acrescenta. Entradas de allowlist alheias — inclusive as que uma política de
 * organização venha a adicionar depois — são preservadas; remover é ação humana.
 */
export function mergeManagedSettings(
  current: ManagedSettings | null,
  entry: PluginIdentity,
): Merge<ManagedSettings> {
  const base = current ?? {}
  const list = Array.isArray(base.allowedChannelPlugins) ? base.allowedChannelPlugins : []
  const listed = list.some(e => e.plugin === entry.plugin && e.marketplace === entry.marketplace)

  return {
    next: {
      ...base,
      channelsEnabled: true,
      allowedChannelPlugins: listed ? list : [...list, entry],
    },
    changed: base.channelsEnabled !== true || !listed,
  }
}

export function mergeUserPermissions(
  current: Record<string, unknown> | null,
  tool: string,
): Merge<Record<string, unknown>> {
  const base = current ?? {}
  const perms =
    typeof base.permissions === 'object' && base.permissions !== null
      ? (base.permissions as Record<string, unknown>)
      : {}
  const allow = Array.isArray(perms.allow) ? (perms.allow as unknown[]) : []

  if (allow.includes(tool)) return { next: base, changed: false }
  return {
    next: { ...base, permissions: { ...perms, allow: [...allow, tool] } },
    changed: true,
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function ensureAliasBlock(rc: string, aliasLine: string): Merge<string> {
  const block = `${ALIAS_BEGIN}\n${aliasLine}\n${ALIAS_END}`
  const existing = new RegExp(`${escapeRegExp(ALIAS_BEGIN)}[\\s\\S]*?${escapeRegExp(ALIAS_END)}`)

  if (existing.test(rc)) {
    const next = rc.replace(existing, block)
    return { next, changed: next !== rc }
  }

  const separator = rc === '' || rc.endsWith('\n') ? '' : '\n'
  return { next: `${rc}${separator}\n${block}\n`, changed: true }
}

#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { isStandalone, pluginRoot } from '../src/cli-core'
import { lanAddress, readConfig, tailscaleAddress } from '../src/config'
import { BUILT_IDENTITY, BUILT_VERSION, installedVersion } from '../src/plugin-meta'
import { DEFAULT_PORT } from '../src/protocol'
import {
  aliasCommand,
  ensureAliasBlock,
  MANAGED_SETTINGS_PATH,
  mergeManagedSettings,
  mergeUserPermissions,
  rcPathFor,
  replyToolName,
  UNIT_NAME,
  type ManagedSettings,
} from '../src/setup-core'
import {
  buildDependencies,
  buildStatus,
  unitExecTarget,
  type Health,
  type Status,
} from '../src/status-core'
import { probeTailscale, resolveState } from '../src/tailscale'
import { pidsOnPort } from '../src/update-core'

const HOME = homedir()

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function answering(port: number, token: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/?t=${token}`, {
      signal: AbortSignal.timeout(1000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function collect(): Promise<Status> {
  const root = pluginRoot({
    standalone: isStandalone(Bun.main),
    moduleDir: join(import.meta.dir, '..', 'src'),
    execPath: process.execPath,
    env: process.env.LOCAL_SESSION_ROOT,
  })

  const cfg = readConfig()
  const port = cfg?.port ?? DEFAULT_PORT
  const token = cfg?.token ?? ''

  // "changed" do merge é a resposta que interessa: false significa que o
  // arquivo já está como o setup deixaria.
  const managed = readJson<ManagedSettings>(MANAGED_SETTINGS_PATH)
  const settingsPath = join(HOME, '.claude/settings.json')
  const perms = readJson<Record<string, unknown>>(settingsPath)
  const rcPath = rcPathFor(process.env.SHELL ?? '', HOME)
  const rc = existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : ''

  const unitPath = join(HOME, '.config/systemd/user', UNIT_NAME)
  const unitInstalled =
    existsSync(unitPath) || existsSync(join('/usr/lib/systemd/user', UNIT_NAME))
  const unitCurrent = existsSync(unitPath) ? readFileSync(unitPath, 'utf8') : ''
  const unitTarget = unitCurrent === '' ? null : unitExecTarget(unitCurrent)

  const hubAnswering = token === '' ? false : await answering(port, token)
  const ss = run('ss', ['-tlnp'])
  const pid = ss === null ? null : (pidsOnPort(ss, port)[0] ?? null)

  const tailscale = resolveState(await probeTailscale(), tailscaleAddress())
  const lan = await lanAddress()

  const url = (host: string) => (token === '' ? null : `http://${host}:${port}/?t=${token}`)

  return buildStatus({
    builtVersion: BUILT_VERSION,
    installedVersion: installedVersion(root),
    pluginRegistered: existsSync(
      join(HOME, '.claude/plugins/cache', BUILT_IDENTITY.marketplace, BUILT_IDENTITY.plugin),
    ),
    hubPort: port,
    hubPid: pid,
    hubAnswering,
    serviceInstalled: unitInstalled,
    serviceEnabled: run('systemctl', ['--user', 'is-enabled', UNIT_NAME]) === 'enabled',
    serviceActive: run('systemctl', ['--user', 'is-active', UNIT_NAME]) === 'active',
    linger:
      run('loginctl', ['show-user', userInfo().username, '--property=Linger'])?.includes(
        'Linger=yes',
      ) ?? false,
    managedOk: !mergeManagedSettings(managed, BUILT_IDENTITY).changed,
    replyPermissionOk: !mergeUserPermissions(perms, replyToolName(BUILT_IDENTITY)).changed,
    aliasOk: !ensureAliasBlock(rc, aliasCommand(BUILT_IDENTITY)).changed,
    unitStale: unitTarget !== null && !existsSync(unitTarget),
    lanUrl: url(lan),
    tailscaleUrl: tailscale?.kind === 'running' ? url(tailscale.host) : null,
    dependencies: buildDependencies({
      hasClaude: Bun.which('claude') !== null,
      hasTmux: Bun.which('tmux') !== null,
      hasGit: Bun.which('git') !== null,
      hasQrencode: Bun.which('qrencode') !== null,
      hasPkexec: Bun.which('pkexec') !== null,
      tailscale: tailscale?.kind ?? 'absent',
    }),
  })
}

const MARK: Record<Health, string> = {
  ok: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m▸\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
}

export function printStatus(status: Status, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(status, null, 2))
    return
  }

  console.log(`\nlocal-session ${status.version.built}\n`)
  for (const c of status.checks) {
    console.log(`  ${MARK[c.health]} ${c.title} — ${c.detail}`)
    if (c.fix) console.log(`      ${c.fix}`)
  }
  const faltando = status.dependencies.filter(d => !d.present)
  if (faltando.length > 0) {
    console.log('')
    for (const d of faltando) {
      console.log(`  ${d.required ? MARK.fail : MARK.warn} ${d.title} — ${d.detail}`)
      if (d.aptPackage) console.log(`      sudo apt install ${d.aptPackage}`)
    }
  }

  if (status.links.lan) console.log(`\n  rede local: ${status.links.lan}`)
  if (status.links.tailscale) console.log(`  tailnet:    ${status.links.tailscale}`)
  console.log('')
}

if (import.meta.main) {
  const status = await collect()
  printStatus(status, process.argv.includes('--json'))
  process.exit(status.health === 'fail' ? 1 : 0)
}

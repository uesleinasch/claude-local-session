#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { readConfig } from '../src/config'
import {
  MANAGED_SETTINGS_PATH,
  aliasCommand,
  detectPluginIdentity,
  ensureAliasBlock,
  mergeManagedSettings,
  mergeUserPermissions,
  rcPathFor,
  replyToolName,
  type ManagedSettings,
  type PluginIdentity,
} from '../src/setup-core'

const ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dir, '..')
const APPLY = !process.argv.includes('--check')
const HOME = homedir()

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)
const miss = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

// Arquivo ausente é ponto de partida legítimo; arquivo presente que não parseia é
// conteúdo de terceiros que um merge "do zero" apagaria — nunca sobrescrever.
function corruptJson(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    JSON.parse(readFileSync(path, 'utf8'))
    return false
  } catch {
    return true
  }
}

function identity(): PluginIdentity {
  const fromPath = detectPluginIdentity(ROOT)
  if (fromPath) return fromPath
  const marketplace = readJson<{ name?: string }>(join(ROOT, '.claude-plugin/marketplace.json'))
  const plugin = readJson<{ name?: string }>(join(ROOT, '.claude-plugin/plugin.json'))
  if (!marketplace?.name || !plugin?.name) {
    console.error('não consegui identificar o plugin — rode a partir da raiz do plugin instalado')
    process.exit(1)
  }
  return { plugin: plugin.name, marketplace: marketplace.name }
}

function elevator(): string {
  const forced = process.env.LOCAL_SESSION_ELEVATOR
  if (forced === 'sudo' || forced === 'pkexec') return forced
  // Sem TTY (dentro do Claude Code) o sudo não consegue ler a senha; o pkexec
  // abre o diálogo gráfico do desktop.
  return process.stdin.isTTY ? 'sudo' : 'pkexec'
}

function writeElevated(target: string, content: string): void {
  const tmp = join(mkdtempSync(join(tmpdir(), 'ls-setup-')), 'payload.json')
  writeFileSync(tmp, content, { mode: 0o644 })
  const cmd = elevator()
  console.log(`\n  precisa de privilégio para escrever ${target} (via ${cmd})\n`)
  // Um comando só: cada invocação de pkexec abre um diálogo de senha próprio.
  execFileSync(
    cmd,
    ['/bin/sh', '-c', `mkdir -p '${join(target, '..')}' && cp '${tmp}' '${target}' && chmod 0644 '${target}'`],
    { stdio: 'inherit' },
  )
}

const id = identity()
console.log(`\nlocal-session setup — plugin:${id.plugin}@${id.marketplace}\n`)

// 1. canal habilitado e plugin na allowlist (exige root)
const managed = readJson<ManagedSettings>(MANAGED_SETTINGS_PATH)
const merged = mergeManagedSettings(managed, id)
const managedJson = `${JSON.stringify(merged.next, null, 2)}\n`

if (corruptJson(MANAGED_SETTINGS_PATH)) {
  miss(`${MANAGED_SETTINGS_PATH} existe mas não é JSON válido — corrija-o antes de rodar de novo`)
} else if (!merged.changed) {
  ok('canal habilitado e plugin na allowlist')
} else if (!APPLY) {
  miss(`${MANAGED_SETTINGS_PATH} precisa de channelsEnabled + allowedChannelPlugins`)
} else {
  console.log(`  conteúdo que será gravado em ${MANAGED_SETTINGS_PATH}:\n`)
  console.log(managedJson.replace(/^/gm, '    '))
  try {
    writeElevated(MANAGED_SETTINGS_PATH, managedJson)
    did('canal habilitado e plugin adicionado à allowlist')
  } catch {
    miss('não consegui escrever o managed-settings (senha cancelada ou pkexec indisponível)')
  }
}

// 2. permissão da tool reply (sem root)
const settingsPath = join(HOME, '.claude/settings.json')
const tool = replyToolName(id)
const perms = mergeUserPermissions(readJson<Record<string, unknown>>(settingsPath), tool)

if (corruptJson(settingsPath)) {
  miss(`${settingsPath} existe mas não é JSON válido — corrija-o antes de rodar de novo`)
} else if (!perms.changed) {
  ok('tool reply já dispensada de confirmação')
} else if (!APPLY) {
  miss(`falta ${tool} em permissions.allow`)
} else {
  writeFileSync(settingsPath, `${JSON.stringify(perms.next, null, 2)}\n`)
  did('tool reply dispensada de confirmação')
}

// 3. alias que ativa o canal sem exigir memória
const rcPath = rcPathFor(process.env.SHELL ?? '', HOME)
const rc = existsSync(rcPath) ? readFileSync(rcPath, 'utf8') : ''
const alias = ensureAliasBlock(rc, aliasCommand(id))

if (!alias.changed) {
  ok(`alias já configurado em ${rcPath}`)
} else if (!APPLY) {
  miss(`falta o alias em ${rcPath}`)
} else {
  writeFileSync(rcPath, alias.next)
  did(`alias gravado em ${rcPath}`)
}

// 4. diagnóstico do hub
const cfg = readConfig()
if (!cfg) {
  ok('hub ainda não iniciado (sobe sozinho na primeira sessão)')
} else {
  try {
    const res = await fetch(`http://127.0.0.1:${cfg.port}/?t=${cfg.token}`, {
      signal: AbortSignal.timeout(1000),
    })
    if (res.ok) ok(`hub respondendo na porta ${cfg.port}`)
    else miss(`hub respondeu ${res.status} na porta ${cfg.port}`)
  } catch {
    ok(`hub parado (sobe sozinho na próxima sessão, porta ${cfg.port})`)
  }
}

console.log(
  APPLY
    ? '\nabra uma aba nova do terminal (ou `source` o rc) e rode `claude` — o canal já vem ativo.\n'
    : '\nrode sem --check para aplicar.\n',
)

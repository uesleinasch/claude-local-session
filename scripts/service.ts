#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { UNIT_NAME, systemdUnit } from '../src/setup-core'

export type ServiceMode = 'apply' | 'check' | 'disable'

const HOME = homedir()
const UNIT_DIR = join(HOME, '.config', 'systemd', 'user')
const UNIT_PATH = join(UNIT_DIR, UNIT_NAME)

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)
const miss = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

function systemctl(...args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('systemctl', ['--user', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() }
  }
}

/** Idempotente: só mexe no que estiver diferente do desejado. */
export function runService(mode: ServiceMode, root: string, verbose = true): void {
  if (verbose) console.log(`\nlocal-session — serviço de usuário (${UNIT_NAME})\n`)

  if (!existsSync('/run/systemd/system')) {
    ok('sem systemd nesta máquina — o hub sobe com a primeira sessão, como antes')
    return
  }

  if (mode === 'disable') {
    systemctl('disable', '--now', UNIT_NAME)
    did('serviço parado e desabilitado')
    console.log(`\n  a unit segue em ${UNIT_PATH}; apague à mão se quiser sumir com ela.\n`)
    return
  }

  const wanted = systemdUnit(process.execPath, root)
  const current = existsSync(UNIT_PATH) ? readFileSync(UNIT_PATH, 'utf8') : ''

  if (current === wanted) {
    ok('hub instalado como serviço, de pé desde o boot')
  } else if (mode === 'check') {
    miss(current === '' ? 'hub ainda não é serviço do systemd' : 'unit aponta para outro root')
  } else {
    mkdirSync(UNIT_DIR, { recursive: true })
    writeFileSync(UNIT_PATH, wanted)
    systemctl('daemon-reload')
    did(`unit gravada em ${UNIT_PATH}`)
  }

  const enabled = systemctl('is-enabled', UNIT_NAME)
  if (enabled.ok && enabled.out === 'enabled') {
    ok('serviço habilitado no boot')
  } else if (mode === 'check') {
    miss('serviço não habilitado')
  } else {
    const done = systemctl('enable', '--now', UNIT_NAME)
    if (done.ok) did('serviço habilitado e iniciado')
    else miss(`systemctl enable falhou: ${done.out}`)
  }

  if (mode === 'apply' && current !== wanted) {
    const restarted = systemctl('restart', UNIT_NAME)
    if (restarted.ok) did('serviço iniciado com o código atual')
    else miss(`systemctl restart falhou: ${restarted.out}`)
  }

  // Sem linger o serviço do usuário só existe enquanto há sessão de login aberta —
  // que é justamente o que falta depois de um reboot sem ninguém logar na máquina.
  const user = userInfo().username
  let lingering = false
  try {
    lingering = execFileSync('loginctl', ['show-user', user, '--property=Linger'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).includes('Linger=yes')
  } catch {}

  if (lingering) {
    ok('linger ligado — o serviço sobe no boot mesmo sem login')
  } else if (mode === 'check') {
    miss('linger desligado — o serviço só roda enquanto você estiver logado')
  } else {
    try {
      execFileSync('loginctl', ['enable-linger', user], { stdio: 'ignore' })
      did('linger ligado')
    } catch {
      miss(`linger exige privilégio — rode depois: sudo loginctl enable-linger ${user}`)
    }
  }

  if (!verbose) return
  const active = systemctl('is-active', UNIT_NAME)
  console.log(`\n  estado: ${active.out || 'desconhecido'}`)
  console.log(`  logs:   journalctl --user -u ${UNIT_NAME} -f\n`)
}

if (import.meta.main) {
  const mode: ServiceMode = process.argv.includes('--disable')
    ? 'disable'
    : process.argv.includes('--check')
      ? 'check'
      : 'apply'
  runService(mode, process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dir, '..'))
}

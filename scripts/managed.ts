#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BUILT_IDENTITY } from '../src/plugin-meta'
import {
  MANAGED_SETTINGS_PATH,
  mergeManagedSettings,
  removeManagedEntry,
  type ManagedSettings,
} from '../src/setup-core'

export type ManagedMode = 'apply' | 'remove' | 'check'

export function managedMode(argv: readonly string[]): ManagedMode {
  if (argv.includes('--remove')) return 'remove'
  if (argv.includes('--apply')) return 'apply'
  return 'check'
}

/**
 * Chamado pelo `postinst`/`postrm` do pacote, onde já se é root: escreve direto
 * e falha com mensagem, em vez de tentar elevar — não há TTY para o sudo nem
 * sessão gráfica para o pkexec nesse contexto.
 */
export function runManaged(mode: ManagedMode, path = MANAGED_SETTINGS_PATH): number {
  let current: ManagedSettings | null = null
  if (existsSync(path)) {
    try {
      current = JSON.parse(readFileSync(path, 'utf8')) as ManagedSettings
    } catch {
      // Arquivo de terceiros que não parseia: um merge "do zero" apagaria o que
      // há nele. Recusar é mais seguro que reescrever.
      process.stderr.write(`local-session: ${path} existe mas não é JSON válido — não vou mexer\n`)
      return 1
    }
  }

  const { next, changed } =
    mode === 'remove'
      ? removeManagedEntry(current, BUILT_IDENTITY)
      : mergeManagedSettings(current, BUILT_IDENTITY)

  if (!changed) {
    process.stdout.write(`local-session: ${path} já está como deveria\n`)
    return 0
  }

  if (mode === 'check') {
    process.stdout.write(`local-session: ${path} precisa de ajuste — rode com --apply\n`)
    return 1
  }

  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o644 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`local-session: não consegui escrever ${path}: ${msg}\n`)
    return 1
  }

  process.stdout.write(
    `local-session: ${mode === 'remove' ? 'entrada removida de' : 'canal habilitado em'} ${path}\n`,
  )
  return 0
}

if (import.meta.main) process.exit(runManaged(managedMode(process.argv.slice(2))))

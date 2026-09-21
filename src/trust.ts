import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// O diálogo abre com o cursor em "No, exit"; "Yes, I trust this folder" é a
// opção seguinte. Texto e ordem são da TUI do Claude Code, não deste repo:
// se mudarem lá, `isTrustPrompt` para de casar e nenhuma tecla é enviada —
// preferível a mandar Enter às cegas num pane que já virou prompt.
export const TRUST_KEYS = ['Down', 'Enter']

export function trustAccepted(claudeJson: unknown, dir: string): boolean {
  if (typeof claudeJson !== 'object' || claudeJson === null) return false
  const projects = (claudeJson as Record<string, unknown>).projects
  if (typeof projects !== 'object' || projects === null) return false
  const key = dir.length > 1 && dir.endsWith('/') ? dir.slice(0, -1) : dir
  const entry = (projects as Record<string, unknown>)[key]
  if (typeof entry !== 'object' || entry === null) return false
  return (entry as Record<string, unknown>).hasTrustDialogAccepted === true
}

export function isTrustPrompt(screen: string): boolean {
  return screen.includes('I trust this folder')
}

export function loadClaudeJson(home = homedir()): unknown {
  try {
    return JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'))
  } catch {
    return null
  }
}

export function dirIsTrusted(dir: string, load: () => unknown = loadClaudeJson): boolean {
  return trustAccepted(load(), dir)
}

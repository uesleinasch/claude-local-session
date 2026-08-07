import { relative } from 'node:path'
import type { ActivityPost } from './protocol'

const MAX_DETAIL = 80

function truncate(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function describe(tool: string, input: Record<string, unknown>, cwd: string): string {
  switch (tool) {
    case 'Bash':
      return truncate(str(input.command))
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = str(input.file_path)
      if (path === '') return ''
      const rel = cwd === '' ? path : relative(cwd, path)
      return truncate(rel.startsWith('..') || rel === '' ? path : rel)
    }
    case 'Grep':
    case 'Glob':
      return truncate(str(input.pattern))
    case 'Task':
    case 'Agent':
      return truncate(str(input.description))
    case 'Skill':
      return truncate(str(input.skill))
    case 'WebFetch':
      return truncate(str(input.url))
    default:
      return ''
  }
}

export function toActivityPost(raw: unknown): ActivityPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  const sessionId = str(p.session_id)
  if (sessionId === '') return null

  const tool = str(p.tool_name)
  const cwd = str(p.cwd)
  const input =
    typeof p.tool_input === 'object' && p.tool_input !== null
      ? (p.tool_input as Record<string, unknown>)
      : {}

  switch (str(p.hook_event_name)) {
    case 'PreToolUse':
      return { sessionId, tool, detail: describe(tool, input, cwd), status: 'start' }
    case 'PostToolUse':
      return { sessionId, tool, detail: describe(tool, input, cwd), status: 'end' }
    case 'Stop':
    case 'SessionEnd':
      return { sessionId, tool: '', detail: '', status: 'idle' }
    default:
      return null
  }
}

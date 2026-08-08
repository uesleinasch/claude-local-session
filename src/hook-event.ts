import { relative } from 'node:path'
import { parseQuestionSpecs, type ActivityPost, type QuestionPayload } from './protocol'

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
    case 'AskUserQuestion': {
      const first = Array.isArray(input.questions) ? input.questions[0] : undefined
      return truncate(str((first as Record<string, unknown> | undefined)?.question))
    }
    case 'Skill':
      return truncate(str(input.skill))
    case 'WebFetch':
      return truncate(str(input.url))
    default:
      return ''
  }
}

const PREVIEW_LINES = 40
const PREVIEW_CHARS = 1_500

function head(s: string, prefix = ''): string {
  const lines = s.split('\n').slice(0, PREVIEW_LINES)
  const text = lines.map(l => `${prefix}${l}`).join('\n')
  const clipped = text.slice(0, PREVIEW_CHARS)
  return clipped.length < text.length || s.split('\n').length > PREVIEW_LINES ? `${clipped}\n…` : clipped
}

/**
 * Conteúdo integral (limitado) da operação que está pedindo permissão — o
 * `detail` de 80 chars serve para a régua de atividade; aprovar exige ver mais.
 */
function previewFor(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Bash':
      return str(input.command).slice(0, PREVIEW_CHARS * 2)
    case 'Edit': {
      const oldStr = str(input.old_string)
      const newStr = str(input.new_string)
      if (oldStr === '' && newStr === '') return ''
      const all = input.replace_all === true ? ' (todas as ocorrências)' : ''
      return `${str(input.file_path)}${all}\n${head(oldStr, '- ')}\n${head(newStr, '+ ')}`
    }
    case 'Write': {
      const content = str(input.content)
      if (content === '') return ''
      return `${str(input.file_path)}\n${head(content, '+ ')}`
    }
    default:
      return ''
  }
}

function questionStart(p: Record<string, unknown>, input: Record<string, unknown>): QuestionPayload | undefined {
  const questionId = str(p.tool_use_id)
  if (questionId === '') return undefined
  const questions = parseQuestionSpecs(input.questions)
  return questions === null ? undefined : { questionId, questions }
}

function questionEnd(p: Record<string, unknown>): QuestionPayload | undefined {
  const questionId = str(p.tool_use_id)
  if (questionId === '') return undefined
  const response =
    typeof p.tool_response === 'object' && p.tool_response !== null
      ? (p.tool_response as Record<string, unknown>)
      : {}
  const answers: Record<string, string> = {}
  if (typeof response.answers === 'object' && response.answers !== null) {
    for (const [k, v] of Object.entries(response.answers)) {
      if (typeof v === 'string') answers[k] = v
    }
  }
  return { questionId, answers }
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
    case 'PreToolUse': {
      const post: ActivityPost = {
        sessionId,
        tool,
        detail: describe(tool, input, cwd),
        status: 'start',
      }
      const preview = previewFor(tool, input)
      if (preview !== '') post.preview = preview
      if (tool === 'AskUserQuestion') {
        const question = questionStart(p, input)
        if (question) post.question = question
      }
      return post
    }
    case 'PostToolUse': {
      const post: ActivityPost = { sessionId, tool, detail: describe(tool, input, cwd), status: 'end' }
      if (tool === 'AskUserQuestion') {
        const question = questionEnd(p)
        if (question) post.question = question
      }
      return post
    }
    case 'Stop':
    case 'SessionEnd':
      return { sessionId, tool: '', detail: '', status: 'idle' }
    default:
      return null
  }
}

import { describe, expect, test } from 'bun:test'
import { toActivityPost } from '../src/hook-event'

const base = { session_id: 'sess-1', cwd: '/home/u/proj' }

describe('toActivityPost', () => {
  test('PreToolUse com Bash resume o comando', () => {
    expect(
      toActivityPost({
        ...base,
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      }),
    ).toEqual({ sessionId: 'sess-1', tool: 'Bash', detail: 'npm test', status: 'start' })
  })

  test('PostToolUse vira status end', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    })
    expect(post?.status).toBe('end')
  })

  test('caminho de arquivo aparece relativo ao cwd', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/home/u/proj/src/auth.ts' },
    })
    expect(post?.detail).toBe('src/auth.ts')
  })

  test('caminho fora do cwd fica absoluto', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/etc/hosts' },
    })
    expect(post?.detail).toBe('/etc/hosts')
  })

  test('comando longo é truncado com reticências', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'x'.repeat(200) },
    })
    expect(post?.detail).toHaveLength(80)
    expect(post?.detail.endsWith('…')).toBe(true)
  })

  test('quebras de linha viram espaço único', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git add .\n\ngit commit' },
    })
    expect(post?.detail).toBe('git add . git commit')
  })

  test('ferramenta sem resumo conhecido fica sem detalhe', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'TodoWrite',
      tool_input: { todos: [] },
    })
    expect(post).toEqual({ sessionId: 'sess-1', tool: 'TodoWrite', detail: '', status: 'start' })
  })

  test('Stop e SessionEnd viram ocioso sem ferramenta', () => {
    for (const hook_event_name of ['Stop', 'SessionEnd']) {
      expect(toActivityPost({ ...base, hook_event_name })).toEqual({
        sessionId: 'sess-1',
        tool: '',
        detail: '',
        status: 'idle',
      })
    }
  })

  test('descarta payload sem session_id', () => {
    expect(toActivityPost({ hook_event_name: 'Stop' })).toBeNull()
  })

  test('descarta hook que não interessa', () => {
    expect(toActivityPost({ ...base, hook_event_name: 'PreCompact' })).toBeNull()
  })

  test('descarta entrada que não é objeto', () => {
    expect(toActivityPost('Stop')).toBeNull()
    expect(toActivityPost(null)).toBeNull()
  })
})

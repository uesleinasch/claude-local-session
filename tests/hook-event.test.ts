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
    ).toEqual({
      sessionId: 'sess-1',
      tool: 'Bash',
      detail: 'npm test',
      status: 'start',
      preview: 'npm test',
    })
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

describe('AskUserQuestion vira payload de pergunta', () => {
  const questions = [
    {
      question: 'Qual fruta você prefere?',
      header: 'Fruta',
      options: [
        { label: 'Maçã', description: 'fruta vermelha' },
        { label: 'Banana', description: 'fruta amarela' },
      ],
      multiSelect: false,
    },
  ]

  test('PreToolUse carrega questionId e perguntas', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'AskUserQuestion',
      tool_input: { questions },
      tool_use_id: 'toolu_123',
    })
    expect(post?.question).toEqual({ questionId: 'toolu_123', questions })
    expect(post?.status).toBe('start')
    expect(post?.detail).toBe('Qual fruta você prefere?')
  })

  test('PostToolUse carrega as respostas com o mesmo questionId', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'AskUserQuestion',
      tool_input: { questions },
      tool_use_id: 'toolu_123',
      tool_response: { questions, answers: { 'Qual fruta você prefere?': 'Banana' } },
    })
    expect(post?.question).toEqual({
      questionId: 'toolu_123',
      answers: { 'Qual fruta você prefere?': 'Banana' },
    })
    expect(post?.status).toBe('end')
  })

  test('sem tool_use_id não há payload de pergunta', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'AskUserQuestion',
      tool_input: { questions },
    })
    expect(post?.question).toBeUndefined()
  })

  test('outras tools não ganham payload de pergunta', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'toolu_9',
    })
    expect(post?.question).toBeUndefined()
  })
})

describe('preview para o card de permissão', () => {
  test('Bash leva o comando completo, além do detail truncado', () => {
    const command = `echo ${'x'.repeat(200)}`
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    })
    expect(post?.preview).toBe(command)
    expect(post?.detail.length).toBeLessThan(command.length)
  })

  test('Edit vira diff com arquivo, linhas antigas e novas', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/home/u/proj/src/auth.ts',
        old_string: 'const a = 1',
        new_string: 'const a = 2',
      },
    })
    expect(post?.preview).toBe('/home/u/proj/src/auth.ts\n- const a = 1\n+ const a = 2')
  })

  test('Write mostra o caminho e o conteúdo prefixado', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/x.txt', content: 'linha 1\nlinha 2' },
    })
    expect(post?.preview).toBe('/tmp/x.txt\n+ linha 1\n+ linha 2')
  })

  test('conteúdo gigante é limitado com marcador de corte', () => {
    const post = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/x.txt', content: 'y'.repeat(5_000) },
    })
    expect(post!.preview!.length).toBeLessThan(2_000)
    expect(post!.preview!.endsWith('…')).toBe(true)
  })

  test('PostToolUse e tools sem preview não carregam o campo', () => {
    const end = toActivityPost({
      ...base,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    })
    expect(end?.preview).toBeUndefined()

    const read = toActivityPost({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/etc/hosts' },
    })
    expect(read?.preview).toBeUndefined()
  })
})

import { describe, expect, test } from 'bun:test'
import { toContextPost } from '../src/context-report'

const payload = {
  session_id: 'sess-1',
  model: { id: 'claude-fable-5', display_name: 'Fable 5' },
  context_window: {
    total_input_tokens: 250_000,
    total_output_tokens: 9_000,
    context_window_size: 1_000_000,
    current_usage: 253_000,
    used_percentage: 25.3,
    remaining_percentage: 74.7,
  },
}

describe('toContextPost', () => {
  test('extrai sessão, modelo, percentual e tokens do payload do statusline', () => {
    expect(toContextPost(payload)).toEqual({
      sessionId: 'sess-1',
      model: { id: 'claude-fable-5', name: 'Fable 5' },
      pct: 25.3,
      usedTokens: 253_000,
      maxTokens: 1_000_000,
    })
  })

  test('sem used_percentage (sessão recém-aberta) ainda reporta o modelo', () => {
    const empty = {
      ...payload,
      context_window: { ...payload.context_window, current_usage: null, used_percentage: null },
    }
    expect(toContextPost(empty)).toEqual({
      sessionId: 'sess-1',
      model: { id: 'claude-fable-5', name: 'Fable 5' },
    })
  })

  test('sem session_id não há post', () => {
    expect(toContextPost({ context_window: payload.context_window })).toBeNull()
    expect(toContextPost('lixo')).toBeNull()
    expect(toContextPost(null)).toBeNull()
  })

  test('sem modelo nem contexto útil não há post', () => {
    expect(toContextPost({ session_id: 'x' })).toBeNull()
    expect(toContextPost({ session_id: 'x', model: {} })).toBeNull()
    expect(toContextPost({ session_id: 'x', context_window: {} })).toBeNull()
  })

  test('percentual é confinado a 0..100', () => {
    const over = {
      ...payload,
      context_window: { ...payload.context_window, used_percentage: 140 },
    }
    expect(toContextPost(over)?.pct).toBe(100)
    const under = {
      ...payload,
      context_window: { ...payload.context_window, used_percentage: -3 },
    }
    expect(toContextPost(under)?.pct).toBe(0)
  })

  test('tokens ausentes ficam de fora sem derrubar o post', () => {
    const lean = {
      session_id: 'sess-1',
      context_window: { used_percentage: 12 },
    }
    expect(toContextPost(lean)).toEqual({ sessionId: 'sess-1', pct: 12 })
  })
})

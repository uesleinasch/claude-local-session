import { describe, expect, test } from 'bun:test'
import { DEFAULT_QUICK_PROMPTS, MAX_QUICK_PROMPTS, parseQuickPrompts } from '../src/protocol'
import { isModelAlias, MODELS, parseActivityPost, parseContextPost } from '../src/protocol'

const spec = {
  question: 'Qual fruta você prefere?',
  header: 'Fruta',
  options: [
    { label: 'Maçã', description: 'fruta vermelha' },
    { label: 'Banana', description: 'fruta amarela' },
  ],
  multiSelect: false,
}

const base = { sessionId: 'sess-1', tool: 'AskUserQuestion', detail: '', status: 'start' }

describe('parseActivityPost com pergunta', () => {
  test('start preserva questionId e perguntas válidas', () => {
    const post = parseActivityPost({
      ...base,
      question: { questionId: 'toolu_1', questions: [spec] },
    })
    expect(post?.question).toEqual({ questionId: 'toolu_1', questions: [spec] })
  })

  test('end preserva as respostas', () => {
    const post = parseActivityPost({
      ...base,
      status: 'end',
      question: { questionId: 'toolu_1', answers: { 'Qual fruta você prefere?': 'Banana' } },
    })
    expect(post?.question).toEqual({
      questionId: 'toolu_1',
      answers: { 'Qual fruta você prefere?': 'Banana' },
    })
  })

  test('descrição ausente vira string vazia e multiSelect é coagido a boolean', () => {
    const post = parseActivityPost({
      ...base,
      question: {
        questionId: 'toolu_1',
        questions: [
          {
            question: 'Q?',
            header: 'H',
            options: [{ label: 'A' }, { label: 'B' }],
            multiSelect: 'sim',
          },
        ],
      },
    })
    expect(post?.question?.questions).toEqual([
      {
        question: 'Q?',
        header: 'H',
        options: [
          { label: 'A', description: '' },
          { label: 'B', description: '' },
        ],
        multiSelect: false,
      },
    ])
  })

  test('question malformada é descartada sem derrubar o post', () => {
    for (const question of [
      { questionId: 'toolu_1', questions: 'não é array' },
      { questionId: 'toolu_1', questions: [{ question: 'Q?', header: 'H', options: [] }] },
      { questionId: 'toolu_1', questions: [{ header: 'H', options: [{ label: 'A' }] }] },
      { questions: [spec] },
      'texto',
    ]) {
      const post = parseActivityPost({ ...base, question })
      expect(post).not.toBeNull()
      expect(post?.question).toBeUndefined()
    }
  })

  test('mais de 4 perguntas ou mais de 8 opções descartam o payload', () => {
    const many = parseActivityPost({
      ...base,
      question: { questionId: 't', questions: Array.from({ length: 5 }, () => spec) },
    })
    expect(many?.question).toBeUndefined()

    const wide = parseActivityPost({
      ...base,
      question: {
        questionId: 't',
        questions: [
          { ...spec, options: Array.from({ length: 9 }, (_, i) => ({ label: `o${i}` })) },
        ],
      },
    })
    expect(wide?.question).toBeUndefined()
  })

  test('textos gigantes são truncados', () => {
    const post = parseActivityPost({
      ...base,
      question: {
        questionId: 't',
        questions: [
          {
            question: 'q'.repeat(2_000),
            header: 'h'.repeat(200),
            options: [{ label: 'l'.repeat(2_000), description: 'd'.repeat(2_000) }, { label: 'B' }],
            multiSelect: true,
          },
        ],
      },
    })
    const q = post?.question?.questions?.[0]
    expect(q?.question.length).toBeLessThanOrEqual(500)
    expect(q?.header.length).toBeLessThanOrEqual(60)
    expect(q?.options[0]?.label.length).toBeLessThanOrEqual(200)
    expect(q?.options[0]?.description.length).toBeLessThanOrEqual(500)
  })

  test('answers com valores não-string são ignorados', () => {
    const post = parseActivityPost({
      ...base,
      status: 'end',
      question: { questionId: 't', answers: { boa: 'sim', ruim: 42, pior: null } },
    })
    expect(post?.question?.answers).toEqual({ boa: 'sim' })
  })

  test('parseContextPost valida e confina o percentual', () => {
    expect(parseContextPost({ sessionId: 's1', pct: 25.3, usedTokens: 253_000, maxTokens: 1_000_000 }))
      .toEqual({ sessionId: 's1', pct: 25.3, usedTokens: 253_000, maxTokens: 1_000_000 })
    expect(parseContextPost({ sessionId: 's1', pct: 12 })).toEqual({ sessionId: 's1', pct: 12 })
    expect(parseContextPost({ sessionId: 's1', pct: 250 })?.pct).toBe(100)
    expect(parseContextPost({ sessionId: 's1', pct: Number.NaN })).toBeNull()
    expect(parseContextPost({ sessionId: '', pct: 10 })).toBeNull()
    expect(parseContextPost({ pct: 10 })).toBeNull()
    expect(parseContextPost({ sessionId: 's1', pct: 10, usedTokens: 'x' })).toEqual({
      sessionId: 's1',
      pct: 10,
    })
    expect(parseContextPost(null)).toBeNull()
  })

  test('parseContextPost aceita post só com modelo (sem pct)', () => {
    expect(parseContextPost({ sessionId: 's1', model: { id: 'claude-opus-5', name: 'Opus 5' } }))
      .toEqual({ sessionId: 's1', model: { id: 'claude-opus-5', name: 'Opus 5' } })
    // sem pct nem modelo não há o que reportar
    expect(parseContextPost({ sessionId: 's1' })).toBeNull()
    // modelo malformado é descartado, mas o pct sobrevive
    expect(parseContextPost({ sessionId: 's1', pct: 5, model: { id: 5 } })).toEqual({
      sessionId: 's1',
      pct: 5,
    })
  })

  test('isModelAlias reconhece só os aliases suportados', () => {
    expect(MODELS.map(m => m.alias)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
    for (const m of MODELS) expect(isModelAlias(m.alias)).toBe(true)
    expect(isModelAlias('gpt')).toBe(false)
    expect(isModelAlias('')).toBe(false)
    expect(isModelAlias(42)).toBe(false)
  })

  test('post sem question continua funcionando como antes', () => {
    expect(parseActivityPost(base)).toEqual({
      sessionId: 'sess-1',
      tool: 'AskUserQuestion',
      detail: '',
      status: 'start',
    })
  })
})

describe('parseQuickPrompts', () => {
  test('aceita a lista configurada, aparada', () => {
    expect(parseQuickPrompts(['continuar', '  rodar os testes  '])).toEqual([
      'continuar',
      'rodar os testes',
    ])
  })

  test('descarta entrada vazia ou de outro tipo em vez de derrubar a lista', () => {
    expect(parseQuickPrompts(['ok', '', '   ', 42, null])).toEqual(['ok'])
  })

  test('lista vazia vira null — quem chama cai no padrão', () => {
    expect(parseQuickPrompts([])).toBeNull()
    expect(parseQuickPrompts('continuar')).toBeNull()
    expect(parseQuickPrompts(undefined)).toBeNull()
  })

  test('corta o excesso: a barra de chips não pode virar rolagem infinita', () => {
    const many = Array.from({ length: MAX_QUICK_PROMPTS + 5 }, (_, i) => `p${i}`)
    expect(parseQuickPrompts(many)).toHaveLength(MAX_QUICK_PROMPTS)
  })

  test('chip gigante é cortado, não some', () => {
    const [only] = parseQuickPrompts(['x'.repeat(500)])!
    expect(only!.length).toBeLessThanOrEqual(200)
  })

  test('os padrões não têm efeito colateral — um toque acidental não commita', () => {
    expect(DEFAULT_QUICK_PROMPTS.length).toBeGreaterThan(0)
    for (const p of DEFAULT_QUICK_PROMPTS) {
      expect(p).not.toMatch(/commit|push|deploy|rm |merge/i)
    }
  })
})

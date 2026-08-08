import { describe, expect, test } from 'bun:test'
import { parseActivityPost, parseContextPost } from '../src/protocol'

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

  test('post sem question continua funcionando como antes', () => {
    expect(parseActivityPost(base)).toEqual({
      sessionId: 'sess-1',
      tool: 'AskUserQuestion',
      detail: '',
      status: 'start',
    })
  })
})

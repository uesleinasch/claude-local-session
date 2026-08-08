import { describe, expect, test } from 'bun:test'
import type { QuestionSpec } from '../src/protocol'
import { keySequenceFor } from '../src/question-keys'

const opts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `opção ${i + 1}`, description: '' }))

const single = (n = 3): QuestionSpec => ({
  question: 'Qual?',
  header: 'H',
  options: opts(n),
  multiSelect: false,
})

const multi = (n = 3): QuestionSpec => ({
  question: 'Quais?',
  header: 'H',
  options: opts(n),
  multiSelect: true,
})

// Comportamento verificado empiricamente na TUI (v2.1.225) — ver scratchpad askq-findings:
// dígito seleciona (e avança de aba); em multiSelect dígito faz toggle e Tab avança;
// "Type something" fica na posição N+1; abas existem se >1 pergunta ou alguma multiSelect;
// com abas, a tela final de review submete com Enter.
describe('keySequenceFor', () => {
  test('pergunta única single-select: dígito submete direto, sem Enter final', () => {
    expect(keySequenceFor([single()], [{ chosen: [1] }])).toEqual([{ key: '2' }])
  })

  test('pergunta única single-select com Other: dígito N+1, texto e Enter', () => {
    expect(keySequenceFor([single(3)], [{ chosen: [], otherText: 'Chá gelado' }])).toEqual([
      { key: '4' },
      { text: 'Chá gelado' },
      { key: 'Enter' },
    ])
  })

  test('pergunta única multiSelect: toggles, Tab e Enter no review', () => {
    expect(keySequenceFor([multi(3)], [{ chosen: [0, 2] }])).toEqual([
      { key: '1' },
      { key: '3' },
      { key: 'Tab' },
      { key: 'Enter' },
    ])
  })

  test('multiSelect com Other: Down até o campo, texto, Tab e Enter', () => {
    expect(keySequenceFor([multi(2)], [{ chosen: [0], otherText: 'Azedo' }])).toEqual([
      { key: '1' },
      { key: 'Down' },
      { key: 'Down' },
      { text: 'Azedo' },
      { key: 'Tab' },
      { key: 'Enter' },
    ])
  })

  test('duas perguntas: single avança sozinha, multi usa Tab, Enter único no fim', () => {
    expect(
      keySequenceFor([single(2), multi(2)], [{ chosen: [0] }, { chosen: [1] }]),
    ).toEqual([{ key: '1' }, { key: '2' }, { key: 'Tab' }, { key: 'Enter' }])
  })

  test('duas single-select com Other na segunda', () => {
    expect(
      keySequenceFor(
        [single(2), single(2)],
        [{ chosen: [1] }, { chosen: [], otherText: 'outra coisa' }],
      ),
    ).toEqual([{ key: '2' }, { key: '3' }, { text: 'outra coisa' }, { key: 'Enter' }, { key: 'Enter' }])
  })

  test('texto do Other perde quebras de linha e controla tamanho', () => {
    const steps = keySequenceFor([single(2)], [{ chosen: [], otherText: 'a\nb\r\nc' }])
    expect(steps).toContainEqual({ text: 'a b c' })
    const long = keySequenceFor([single(2)], [{ chosen: [], otherText: 'x'.repeat(2_000) }])
    const textStep = long?.find(s => 'text' in s) as { text: string } | undefined
    expect(textStep?.text.length).toBeLessThanOrEqual(500)
  })

  test('respostas inválidas retornam null', () => {
    // quantidade de respostas != quantidade de perguntas
    expect(keySequenceFor([single()], [])).toBeNull()
    // índice fora do alcance
    expect(keySequenceFor([single(2)], [{ chosen: [2] }])).toBeNull()
    expect(keySequenceFor([single(2)], [{ chosen: [-1] }])).toBeNull()
    // single-select exige exatamente uma escolha OU Other
    expect(keySequenceFor([single()], [{ chosen: [] }])).toBeNull()
    expect(keySequenceFor([single()], [{ chosen: [0, 1] }])).toBeNull()
    expect(keySequenceFor([single()], [{ chosen: [0], otherText: 'x' }])).toBeNull()
    // multiSelect exige ao menos um toggle ou Other
    expect(keySequenceFor([multi()], [{ chosen: [] }])).toBeNull()
    // Other vazio (após sanitizar) não vale
    expect(keySequenceFor([single()], [{ chosen: [], otherText: '  \n ' }])).toBeNull()
    // índice duplicado
    expect(keySequenceFor([multi()], [{ chosen: [1, 1] }])).toBeNull()
  })

  test('multiSelect ordena toggles em ordem crescente', () => {
    expect(keySequenceFor([multi(3)], [{ chosen: [2, 0] }])).toEqual([
      { key: '1' },
      { key: '3' },
      { key: 'Tab' },
      { key: 'Enter' },
    ])
  })
})

import type { QuestionAnswer, QuestionSpec } from './protocol'

export type KeyStep = { key: string } | { text: string }

const MAX_OTHER_TEXT = 500

function sanitizeOther(text: string | undefined): string | null {
  if (text === undefined) return null
  const flat = text.replace(/\s+/g, ' ').trim().slice(0, MAX_OTHER_TEXT)
  return flat === '' ? null : flat
}

function validChosen(chosen: number[], optionCount: number): boolean {
  return (
    chosen.every(i => Number.isInteger(i) && i >= 0 && i < optionCount) &&
    new Set(chosen).size === chosen.length
  )
}

/**
 * Traduz respostas em teclas do diálogo AskUserQuestion, conforme verificado
 * na TUI: dígito seleciona (single) ou faz toggle (multiSelect); "Type
 * something" ocupa a posição N+1; abas existem se há >1 pergunta ou alguma
 * multiSelect, e terminam numa tela de review submetida com Enter.
 */
export function keySequenceFor(
  questions: QuestionSpec[],
  answers: QuestionAnswer[],
): KeyStep[] | null {
  if (questions.length === 0 || questions.length !== answers.length) return null
  const tabbed = questions.length > 1 || questions.some(q => q.multiSelect)
  const steps: KeyStep[] = []

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi] as QuestionSpec
    const a = answers[qi] as QuestionAnswer
    const chosen = Array.isArray(a.chosen) ? a.chosen : []
    const other = sanitizeOther(a.otherText)
    if (a.otherText !== undefined && other === null) return null
    if (!validChosen(chosen, q.options.length)) return null

    if (q.multiSelect) {
      if (chosen.length === 0 && other === null) return null
      for (const i of [...chosen].sort((x, y) => x - y)) steps.push({ key: String(i + 1) })
      if (other !== null) {
        for (let n = 0; n < q.options.length; n++) steps.push({ key: 'Down' })
        steps.push({ text: other })
      }
      steps.push({ key: 'Tab' })
    } else if (other !== null) {
      if (chosen.length !== 0) return null
      steps.push({ key: String(q.options.length + 1) }, { text: other }, { key: 'Enter' })
    } else {
      if (chosen.length !== 1) return null
      steps.push({ key: String((chosen[0] as number) + 1) })
    }
  }

  if (tabbed) steps.push({ key: 'Enter' })
  return steps
}

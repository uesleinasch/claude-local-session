export const MAX_CHANGES = 40_000

export type ChangeParts = { status: string; stat: string; diff: string }

/**
 * `git status --short` entra junto porque arquivo novo não aparece em `git diff`
 * — sem ele, "criei o arquivo X" se lê como "nada mudou".
 */
export function formatChanges(parts: ChangeParts): string {
  const status = parts.status.trim()
  const stat = parts.stat.trim()
  const diff = parts.diff.trim()

  if (status === '' && stat === '' && diff === '') return 'nada mudou desde o último commit'

  const blocks: string[] = []
  if (status !== '') blocks.push(`arquivos\n${status}`)
  if (stat !== '') blocks.push(`resumo\n${stat}`)
  if (diff !== '') {
    const clipped =
      diff.length > MAX_CHANGES
        ? `${diff.slice(0, MAX_CHANGES)}\n\n… diff cortado em ${MAX_CHANGES} caracteres`
        : diff
    blocks.push(clipped)
  }
  return blocks.join('\n\n')
}

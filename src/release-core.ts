/** Prefixo que separa as tags do app das do plugin, que seguem outra contagem. */
const PREFIXO = 'app-v'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/**
 * Versão do app, sem o build number depois do `+`. Só a chave na coluna zero
 * conta: `version:` indentado pertence a uma dependência.
 */
export function versaoDoPubspec(conteudo: string): string | null {
  for (const linha of conteudo.split('\n')) {
    if (!linha.startsWith('version:')) continue
    const bruto = linha.slice('version:'.length).trim().split('+')[0]?.trim() ?? ''
    return SEMVER.test(bruto) ? bruto : null
  }
  return null
}

export function tagDaVersao(versao: string): string {
  return `${PREFIXO}${versao}`
}

export function jaPublicada(tag: string, existentes: string[]): boolean {
  return existentes.includes(tag)
}

export function nomeDoApk(versao: string): string {
  return `local-session-${versao}.apk`
}

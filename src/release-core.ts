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

export type Versoes = { plugin: string; pacote: string; app: string }

export type Conferencia =
  | { ok: true; alvo: 'plugin' | 'app'; versao: string }
  | { ok: false; erro: string }

export function conferirTag(tag: string, versoes: Versoes): Conferencia {
  if (tag.startsWith(PREFIXO)) {
    const versao = tag.slice(PREFIXO.length)
    if (!SEMVER.test(versao)) return { ok: false, erro: `${tag} não é app-v<x.y.z>` }
    if (versao !== versoes.app) {
      return { ok: false, erro: `${tag} diverge de mobile/pubspec.yaml (${versoes.app})` }
    }
    return { ok: true, alvo: 'app', versao }
  }
  if (!tag.startsWith('v')) return { ok: false, erro: `${tag} não é v<x.y.z> nem app-v<x.y.z>` }
  const versao = tag.slice(1)
  if (!SEMVER.test(versao)) return { ok: false, erro: `${tag} não é v<x.y.z>` }
  if (versao !== versoes.plugin) {
    return { ok: false, erro: `${tag} diverge de .claude-plugin/plugin.json (${versoes.plugin})` }
  }
  if (versao !== versoes.pacote) {
    return { ok: false, erro: `${tag} diverge de package.json (${versoes.pacote})` }
  }
  return { ok: true, alvo: 'plugin', versao }
}

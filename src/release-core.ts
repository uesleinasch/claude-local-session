/** Prefixo que separa as tags do app das do plugin, que seguem outra contagem. */
const PREFIXO = 'app-v'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
const PRE_RELEASE = /^(\d+\.\d+\.\d+)-rc\.\d+$/

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
  | { ok: true; alvo: 'plugin' | 'app'; versao: string; prerelease: boolean }
  | { ok: false; erro: string }

/** `x.y.z` vira release; `x.y.z-rc.N` é a pre-release de Development da mesma versão. */
function separar(bruto: string): { versao: string; prerelease: boolean } | null {
  if (SEMVER.test(bruto)) return { versao: bruto, prerelease: false }
  const rc = bruto.match(PRE_RELEASE)
  return rc ? { versao: rc[1]!, prerelease: true } : null
}

export function conferirTag(tag: string, versoes: Versoes): Conferencia {
  if (tag.startsWith(PREFIXO)) {
    const partes = separar(tag.slice(PREFIXO.length))
    if (!partes) return { ok: false, erro: `${tag} não é app-v<x.y.z> nem app-v<x.y.z>-rc.<n>` }
    if (partes.versao !== versoes.app) {
      return { ok: false, erro: `${tag} diverge de mobile/pubspec.yaml (${versoes.app})` }
    }
    return { ok: true, alvo: 'app', ...partes }
  }
  if (!tag.startsWith('v')) return { ok: false, erro: `${tag} não é v<x.y.z> nem app-v<x.y.z>` }
  const partes = separar(tag.slice(1))
  if (!partes) return { ok: false, erro: `${tag} não é v<x.y.z> nem v<x.y.z>-rc.<n>` }
  if (partes.versao !== versoes.plugin) {
    return { ok: false, erro: `${tag} diverge de .claude-plugin/plugin.json (${versoes.plugin})` }
  }
  if (partes.versao !== versoes.pacote) {
    return { ok: false, erro: `${tag} diverge de package.json (${versoes.pacote})` }
  }
  return { ok: true, alvo: 'plugin', ...partes }
}

/** No CI a release do app sai sob a tag que disparou — a de pre-release inclusive. */
export function tagParaPublicar(versao: string, ref: string | undefined): string {
  const base = tagDaVersao(versao)
  if (ref === base || (ref?.startsWith(`${base}-`) && PRE_RELEASE.test(ref.slice(PREFIXO.length)))) {
    return ref
  }
  return base
}

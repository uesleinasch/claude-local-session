const TAG_DO_APP = /^app-v(\d+)\.(\d+)\.(\d+)$/

function numeros(tag) {
  const m = TAG_DO_APP.exec(tag)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function maisNovo(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/**
 * Recebe a resposta de `GET /repos/:dono/:repo/releases`. O APK sai fora do
 * Latest (o `/releases/latest` é do `.deb`), então não há endereço fixo para
 * ele no GitHub: a versão mais nova é escolhida aqui, pela tag.
 */
export function escolherApk(releases) {
  if (!Array.isArray(releases)) return null
  let melhor = null
  for (const r of releases) {
    if (!r || r.draft || r.prerelease) continue
    const v = numeros(r.tag_name)
    if (!v) continue
    const apk = (r.assets || []).find(a => typeof a.name === 'string' && a.name.endsWith('.apk'))
    if (!apk) continue
    if (melhor && !maisNovo(v, melhor.v)) continue
    melhor = { v, versao: v.join('.'), url: apk.browser_download_url, tamanho: apk.size }
  }
  if (!melhor) return null
  const { versao, url, tamanho } = melhor
  return { versao, url, tamanho }
}

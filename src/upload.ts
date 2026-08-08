export const MAX_UPLOAD_BYTES = 8_000_000

export type ImageKind = 'png' | 'jpg' | 'gif' | 'webp'

const starts = (b: Uint8Array, sig: number[], at = 0): boolean =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v)

const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/**
 * Confia nos bytes, nunca no nome nem no content-type: quem manda o arquivo é
 * um navegador do outro lado da rede, e a extensão é escolha de quem envia.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 8) return null
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (starts(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  if (starts(bytes, RIFF) && starts(bytes, WEBP, 8)) return 'webp'
  return null
}

/** Nome derivado, nunca o do arquivo original: o nome vem de fora. */
export function uploadName(sessionId: string, ext: string, ts: number): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '')
  return `${safe === '' ? 'sessao' : safe}-${ts}.${ext}`
}

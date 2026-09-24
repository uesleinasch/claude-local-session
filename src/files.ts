export const MAX_NAME_BYTES = 255
const MAX_COPY_TRIES = 99

export function isWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(base.endsWith('/') ? base : `${base}/`)
}

/** Recebe o caminho já passado por realpath: comparar texto não resolvido deixa um symlink sair da área. */
export function insideBase(realPath: string, bases: string[]): boolean {
  if (!realPath.startsWith('/')) return false
  return bases.some(base => isWithin(realPath, base))
}

export function validName(name: string): boolean {
  if (name.trim() === '' || name.startsWith('.')) return false
  if (/[/\0\r\n]/.test(name)) return false
  return new TextEncoder().encode(name).length <= MAX_NAME_BYTES
}

function splitExt(name: string): [string, string] {
  const m = /^(.+?)((?:\.tar)?\.[A-Za-z0-9]{1,8})$/.exec(name)
  return m ? [m[1]!, m[2]!] : [name, '']
}

export function copyTarget(name: string, taken: (name: string) => boolean): string | null {
  if (!taken(name)) return name
  const [stem, ext] = splitExt(name)
  for (let i = 1; i <= MAX_COPY_TRIES; i++) {
    const candidate = `${stem} (${i === 1 ? 'cópia' : `cópia ${i}`})${ext}`
    if (!taken(candidate)) return candidate
  }
  return null
}

export function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export type DirChild = { name: string; isDir: boolean }
export type DirReader = (path: string) => Promise<DirChild[] | null>
export type Found = { name: string; path: string; rel: string }

const SKIP_DIRS = new Set(['node_modules'])

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export async function findDirs(
  root: string,
  query: string,
  read: DirReader,
  { maxDepth = 6, max = 200, deadline = Infinity, now = Date.now } = {},
): Promise<{ results: Found[]; truncated: boolean }> {
  const needle = fold(query.trim())
  const results: Found[] = []
  if (needle === '') return { results, truncated: false }
  let level: { path: string; rel: string }[] = [{ path: root, rel: '' }]
  for (let depth = 1; depth <= maxDepth && level.length > 0; depth++) {
    const next: { path: string; rel: string }[] = []
    for (const dir of level) {
      if (now() >= deadline) return { results, truncated: true }
      const kids = await read(dir.path)
      if (kids === null) continue
      for (const kid of kids) {
        if (!kid.isDir || kid.name.startsWith('.') || SKIP_DIRS.has(kid.name)) continue
        const path = dir.path === '/' ? `/${kid.name}` : `${dir.path}/${kid.name}`
        const rel = dir.rel === '' ? kid.name : `${dir.rel}/${kid.name}`
        if (fold(kid.name).includes(needle)) {
          if (results.length >= max) return { results, truncated: true }
          results.push({ name: kid.name, path, rel })
        }
        next.push({ path, rel })
      }
    }
    level = next
  }
  return { results, truncated: false }
}

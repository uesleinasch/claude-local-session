const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const byName = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export const SORT_OPTIONS = [
  { value: 'name-asc', label: 'nome A→Z' },
  { value: 'name-desc', label: 'nome Z→A' },
  { value: 'mtime-desc', label: 'mais recentes' },
  { value: 'mtime-asc', label: 'mais antigos' },
  { value: 'size-desc', label: 'maiores' },
  { value: 'size-asc', label: 'menores' },
]

export function sortEntries(entries, key, desc) {
  const sign = desc ? -1 : 1
  return [...entries].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (key !== 'name' && typeof va === 'number' && typeof vb === 'number' && va !== vb) {
      return (va - vb) * sign
    }
    const n = byName.compare(a.name, b.name)
    return key === 'name' ? n * sign : n
  })
}

export function parseSort(value) {
  if (!SORT_OPTIONS.some(o => o.value === value)) return { key: 'name', desc: false }
  const [key, dir] = value.split('-')
  return { key, desc: dir === 'desc' }
}

const pad = n => String(n).padStart(2, '0')

export function relativeTime(ms, now) {
  if (typeof ms !== 'number') return ''
  const elapsed = now - ms
  if (elapsed < MINUTE) return 'agora'
  if (elapsed < HOUR) return `há ${Math.floor(elapsed / MINUTE)} min`
  if (elapsed < DAY) return `há ${Math.floor(elapsed / HOUR)} h`
  if (elapsed < 2 * DAY) return 'ontem'
  if (elapsed < 7 * DAY) return `há ${Math.floor(elapsed / DAY)} dias`
  const d = new Date(ms)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function crumbs(path, home) {
  const inHome = home && (path === home || path.startsWith(`${home}/`))
  const start = inHome ? { label: '~', path: home } : { label: '/', path: '/' }
  const rest = (inHome ? path.slice(home.length) : path).split('/').filter(Boolean)
  const out = [start]
  let acc = start.path === '/' ? '' : start.path
  for (const part of rest) {
    acc = `${acc}/${part}`
    out.push({ label: part, path: acc })
  }
  return out
}

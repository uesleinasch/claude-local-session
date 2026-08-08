/*
 * Markdown mínimo para as respostas do Claude: parágrafos, títulos, listas,
 * código (inline e bloco), negrito, itálico e links http(s).
 * O parse é puro (testável sem DOM); o render nunca toca em innerHTML.
 */

const INLINE = /(`+)(.+?)\1|\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+?)\]\(([^)\s]+?)\)/

export function parseInline(text) {
  const spans = []
  let rest = text
  while (rest !== '') {
    const m = INLINE.exec(rest)
    if (!m) {
      spans.push({ t: 'text', text: rest })
      break
    }
    if (m.index > 0) spans.push({ t: 'text', text: rest.slice(0, m.index) })
    if (m[2] !== undefined) spans.push({ t: 'code', text: m[2] })
    else if (m[3] !== undefined) spans.push({ t: 'strong', text: m[3] })
    else if (m[4] !== undefined) spans.push({ t: 'em', text: m[4] })
    else if (m[5] !== undefined) {
      // Só http(s) vira link — javascript:, data: e afins degradam para texto.
      if (/^https?:\/\//i.test(m[6])) spans.push({ t: 'link', text: m[5], href: m[6] })
      else spans.push({ t: 'text', text: m[5] })
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return spans
}

function inlineWithBreaks(lines) {
  const spans = []
  lines.forEach((line, i) => {
    if (i > 0) spans.push({ t: 'br' })
    spans.push(...parseInline(line))
  })
  return spans
}

export function parseMarkdown(text) {
  const blocks = []
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  let paragraph = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ t: 'p', spans: inlineWithBreaks(paragraph) })
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = /^```(\S*)\s*$/.exec(line)
    if (fence) {
      flush()
      const body = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
      blocks.push({ t: 'code', lang: fence[1] ?? '', text: body.join('\n') })
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ t: 'h', level: heading[1].length, spans: parseInline(heading[2]) })
      continue
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flush()
      const ordered = Boolean(numbered)
      const items = [parseInline((bullet ?? numbered)[1])]
      while (i + 1 < lines.length) {
        const next = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i + 1])
          : /^\s*[-*]\s+(.*)$/.exec(lines[i + 1])
        if (!next) break
        items.push(parseInline(next[1]))
        i++
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }

    if (line.trim() === '') {
      flush()
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

function renderSpans(target, spans) {
  for (const s of spans) {
    if (s.t === 'br') {
      target.append(document.createElement('br'))
      continue
    }
    if (s.t === 'text') {
      target.append(document.createTextNode(s.text))
      continue
    }
    if (s.t === 'link') {
      const a = document.createElement('a')
      a.href = s.href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = s.text
      target.append(a)
      continue
    }
    const tag = { code: 'code', strong: 'strong', em: 'em' }[s.t]
    const el = document.createElement(tag)
    el.textContent = s.text
    target.append(el)
  }
}

export function renderMarkdown(text) {
  const frag = document.createDocumentFragment()
  for (const block of parseMarkdown(text)) {
    if (block.t === 'code') {
      const pre = document.createElement('pre')
      pre.className = 'md-code'
      const code = document.createElement('code')
      code.textContent = block.text
      pre.append(code)
      frag.append(pre)
      continue
    }
    if (block.t === 'ul' || block.t === 'ol') {
      const list = document.createElement(block.t)
      for (const item of block.items) {
        const li = document.createElement('li')
        renderSpans(li, item)
        list.append(li)
      }
      frag.append(list)
      continue
    }
    const p = document.createElement('p')
    p.className = block.t === 'h' ? `md-h md-h${block.level}` : 'md-p'
    renderSpans(p, block.spans)
    frag.append(p)
  }
  return frag
}

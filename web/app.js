import { renderMarkdown } from './markdown.js'

const app = document.getElementById('app')
const bar = { title: document.getElementById('title'), state: document.getElementById('state') }
const list = document.getElementById('session-list')
const sessionsEmpty = document.getElementById('sessions-empty')
const feed = document.getElementById('feed')
const feedEmpty = document.getElementById('feed-empty')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send')
const stopBtn = document.getElementById('stop')
const autoBtn = document.getElementById('automode')
const ctxBox = document.getElementById('context')
const ctxFill = document.getElementById('context-fill')
const ctxPct = document.getElementById('context-pct')
const modelBtn = document.getElementById('model')
const modelName = document.getElementById('model-name')
const modelMenu = document.getElementById('model-menu')

// Espelha protocol.MODELS — display_name do statusline casa com esses nomes.
const MODELS = [
  { alias: 'fable', name: 'Fable 5' },
  { alias: 'opus', name: 'Opus 5' },
  { alias: 'sonnet', name: 'Sonnet 5' },
  { alias: 'haiku', name: 'Haiku 4.5' },
]
const offline = document.getElementById('offline')
const toastEl = document.getElementById('toast')
const spawnBox = document.getElementById('spawn')
const spawnList = document.getElementById('spawn-list')
const spawnEmpty = document.getElementById('spawn-empty')
const browsePathEl = document.getElementById('browse-path')
const browseList = document.getElementById('browse-list')

const token = new URLSearchParams(location.search).get('t')
const LAST_KEY = 'local-session.last'
const OUTBOX_KEY = 'local-session.outbox'
const MAX_EVENTS = 200

// O cookie definido pelo hub já autentica as próximas visitas — o token não
// precisa ficar exposto na barra de endereço nem no histórico do navegador.
if (token) {
  const url = new URL(location.href)
  url.searchParams.delete('t')
  history.replaceState(null, '', url)
}

let ws = null
let backoff = 1000
let sessions = []
let currentId = localStorage.getItem(LAST_KEY)
let events = []
let hubConfig = { projects: [], canSpawn: false, canInterrupt: false, home: '' }
let browse = null
let toastTimer = null

let outbox = []
try {
  const stored = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
  if (Array.isArray(stored)) outbox = stored
} catch {}

function saveOutbox() {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
}

/* Prompts escritos sem conexão esperam aqui e saem na reconexão. */
function flushOutbox() {
  if (!currentId) return
  const mine = outbox.filter(o => o.sessionId === currentId)
  let flushed = false
  for (const o of mine) {
    if (!send({ type: 'prompt', sessionId: o.sessionId, text: o.text })) break
    outbox.splice(outbox.indexOf(o), 1)
    flushed = true
  }
  if (flushed) {
    saveOutbox()
    renderFeed()
  }
}

function showToast(text) {
  toastEl.textContent = text
  toastEl.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastEl.hidden = true
  }, 4000)
}

/* ---------- transporte ---------- */

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const query = token ? `?t=${encodeURIComponent(token)}` : ''
  ws = new WebSocket(`${proto}://${location.host}/_ws${query}`)

  ws.onopen = () => {
    backoff = 1000
    offline.hidden = true
    if (currentId) {
      send({ type: 'subscribe', sessionId: currentId })
      flushOutbox()
    }
  }
  ws.onmessage = ev => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    handle(msg)
  }
  ws.onclose = () => {
    ws = null
    offline.hidden = false
    setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 15000)
  }
  ws.onerror = () => {}
}

function send(msg) {
  if (ws?.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify(msg))
  return true
}

function handle(msg) {
  if (msg.type === 'sessions') {
    sessions = Array.isArray(msg.sessions) ? msg.sessions : []
    // Sessão lembrada que o hub não conhece mais: volta para a lista em vez de
    // deixar o usuário preso num feed vazio e morto.
    if (currentId && !sessions.some(s => s.id === currentId)) {
      currentId = null
      localStorage.removeItem(LAST_KEY)
      events = []
      app.dataset.view = 'sessions'
    }
    // Uma sessão viva e nenhuma escolhida: entra direto, sem passo intermediário.
    if (!currentId && sessions.filter(s => s.alive).length === 1) {
      open(sessions.find(s => s.alive).id)
      return
    }
    renderSessions()
    renderBar()
    return
  }
  if (msg.type === 'history' && msg.sessionId === currentId) {
    events = Array.isArray(msg.events) ? msg.events : []
    renderFeed()
    return
  }
  if (msg.type === 'event' && msg.sessionId === currentId) {
    const e = msg.event
    // O hub reemite o card de permissão resolvido com o mesmo requestId —
    // substituir espelha o feed do servidor; empilhar duplicaria o card e
    // ressuscitaria os botões do antigo no próximo render.
    if (e.kind === 'permission') {
      const at = events.findIndex(x => x.kind === 'permission' && x.requestId === e.requestId)
      if (at !== -1) {
        events[at] = e
        renderFeed()
        return
      }
    }
    if (e.kind === 'question') {
      if (e.resolved !== undefined) questionDraft.delete(e.questionId)
      const at = events.findIndex(x => x.kind === 'question' && x.questionId === e.questionId)
      if (at !== -1) {
        events[at] = e
        renderFeed()
        return
      }
    }
    events.push(e)
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
    renderFeed()
    return
  }
  if (msg.type === 'config') {
    hubConfig = {
      projects: Array.isArray(msg.projects) ? msg.projects : [],
      canSpawn: msg.canSpawn === true,
      canInterrupt: msg.canInterrupt === true,
      home: typeof msg.home === 'string' ? msg.home : '',
    }
    if (hubConfig.canSpawn && !browse) send({ type: 'browse', path: '' })
    renderSpawn()
    renderBar()
    return
  }
  if (msg.type === 'dir') {
    browse = {
      path: msg.path,
      parent: msg.parent ?? null,
      dirs: Array.isArray(msg.dirs) ? msg.dirs : [],
    }
    renderSpawn()
    return
  }
  if (msg.type === 'toast') {
    showToast(String(msg.text ?? ''))
  }
}

/* ---------- navegação ---------- */

function open(id) {
  currentId = id
  localStorage.setItem(LAST_KEY, id)
  events = []
  app.dataset.view = 'feed'
  send({ type: 'subscribe', sessionId: id })
  flushOutbox()
  renderSessions()
  renderBar()
  renderFeed()
}

function showSessions() {
  app.dataset.view = 'sessions'
  renderBar()
}

document.getElementById('back').addEventListener('click', showSessions)

/* ---------- render ---------- */

function current() {
  return sessions.find(s => s.id === currentId) ?? null
}

function ctxLevel(pct) {
  return pct < 50 ? 'ok' : pct < 80 ? 'warn' : 'high'
}

function fmtTokens(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function renderContext(s) {
  const ctx = s?.context
  ctxBox.hidden = app.dataset.view !== 'feed' || !ctx
  if (ctxBox.hidden) return
  const pct = Math.round(ctx.pct)
  ctxFill.style.width = `${Math.min(100, Math.max(0, ctx.pct))}%`
  ctxBox.dataset.level = ctxLevel(pct)
  ctxPct.textContent =
    ctx.usedTokens !== undefined && ctx.maxTokens !== undefined
      ? `${pct}% · ${fmtTokens(ctx.usedTokens)}/${fmtTokens(ctx.maxTokens)}`
      : `${pct}%`
  ctxBox.title = `janela de contexto: ${ctxPct.textContent}`
}

function closeModelMenu() {
  modelMenu.hidden = true
  modelBtn.setAttribute('aria-expanded', 'false')
}

function renderModel(s) {
  const canPick = Boolean(s?.alive) && hubConfig.canInterrupt
  modelBtn.hidden = app.dataset.view !== 'feed' || !canPick
  if (modelBtn.hidden) {
    closeModelMenu()
    return
  }
  modelName.textContent = s.model?.name ?? 'modelo'
}

function buildModelMenu(s) {
  modelMenu.replaceChildren()
  const note = document.createElement('p')
  note.className = 'model-note'
  note.textContent = 'também vira o padrão de novas sessões'
  modelMenu.append(note)
  for (const m of MODELS) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'model-item'
    item.setAttribute('role', 'menuitem')
    item.dataset.on = String(s.model?.name === m.name)
    item.textContent = m.name
    item.addEventListener('click', () => {
      closeModelMenu()
      if (s.model?.name === m.name) return
      if (!send({ type: 'setmodel', sessionId: s.id, model: m.alias })) {
        showToast('sem conexão com o hub')
      } else {
        showToast(`trocando para ${m.name}…`)
      }
    })
    modelMenu.append(item)
  }
}

function renderBar() {
  const s = current()
  renderContext(s)
  renderModel(s)
  if (app.dataset.view === 'sessions' || !s) {
    bar.title.textContent = 'sessões'
    bar.state.dataset.alive = 'false'
    stopBtn.hidden = true
    autoBtn.hidden = true
    return
  }
  bar.title.textContent = s.label
  bar.state.dataset.alive = String(s.alive)
  bar.state.dataset.busy = String(s.busy === true)
  stopBtn.hidden = !(s.alive && s.busy === true && hubConfig.canInterrupt)
  autoBtn.hidden = !s.alive
  autoBtn.dataset.on = String(s.auto === true)
  autoBtn.setAttribute(
    'aria-label',
    s.auto === true
      ? 'Auto ligado — desligar aprovação automática de permissões'
      : 'Ligar aprovação automática de permissões desta sessão',
  )
}

function tilde(path) {
  const home = hubConfig.home
  if (home && path === home) return '~'
  if (home && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`
  return path
}

function confirmSpawn(dir) {
  if (!confirm(`Iniciar uma nova sessão do claude em ${tilde(dir)}?`)) return
  if (send({ type: 'spawn', dir })) showToast('iniciando sessão — ela aparece na lista em instantes')
  else showToast('sem conexão com o hub')
}

function starBtn(dir, isFav) {
  const star = document.createElement('button')
  star.type = 'button'
  star.className = 'dir-action dir-star'
  star.dataset.on = String(isFav)
  star.setAttribute(
    'aria-label',
    isFav ? `Remover ${tilde(dir)} dos favoritos` : `Marcar ${tilde(dir)} como favorito`,
  )
  star.textContent = isFav ? '★' : '☆'
  star.addEventListener('click', () => {
    if (!send({ type: 'favorite', path: dir, on: !isFav })) showToast('sem conexão com o hub')
  })
  return star
}

function renderSpawn() {
  spawnBox.hidden = !hubConfig.canSpawn
  spawnList.replaceChildren()
  browseList.replaceChildren()
  if (!hubConfig.canSpawn) return

  // Favoritos: um toque abre sessão, a estrela desfaz a marcação.
  spawnEmpty.hidden = hubConfig.projects.length > 0
  for (const dir of hubConfig.projects) {
    const li = document.createElement('li')
    li.className = 'dir-item'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'spawn-btn'

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = dir.split('/').filter(Boolean).pop() ?? dir

    const path = document.createElement('span')
    path.className = 'session-path'
    path.textContent = tilde(dir)

    btn.append(name, path)
    btn.addEventListener('click', () => confirmSpawn(dir))
    li.append(btn, starBtn(dir, true))
    spawnList.append(li)
  }

  // Navegador: nome navega, ★ favorita, + abre sessão ali.
  browsePathEl.textContent = browse ? tilde(browse.path) : '…'
  if (!browse) return

  if (browse.parent) {
    const li = document.createElement('li')
    li.className = 'dir-item'
    const up = document.createElement('button')
    up.type = 'button'
    up.className = 'dir-name'
    up.textContent = '‹ voltar'
    up.addEventListener('click', () => send({ type: 'browse', path: browse.parent }))
    li.append(up)
    browseList.append(li)
  }

  for (const d of browse.dirs) {
    const li = document.createElement('li')
    li.className = 'dir-item'

    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'dir-name'
    name.textContent = `${d.name}/`
    name.addEventListener('click', () => send({ type: 'browse', path: d.path }))

    const plus = document.createElement('button')
    plus.type = 'button'
    plus.className = 'dir-action dir-spawn'
    plus.setAttribute('aria-label', `Nova sessão em ${tilde(d.path)}`)
    plus.textContent = '+'
    plus.addEventListener('click', () => confirmSpawn(d.path))

    li.append(name, starBtn(d.path, hubConfig.projects.includes(d.path)), plus)
    browseList.append(li)
  }
}

function renderSessions() {
  list.replaceChildren()
  sessionsEmpty.hidden = sessions.length > 0

  for (const s of sessions) {
    const li = document.createElement('li')
    li.className = 'session-item'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'session'
    btn.dataset.alive = String(s.alive)
    btn.dataset.busy = String(s.busy === true)

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = s.label
    if (s.auto === true) {
      const badge = document.createElement('span')
      badge.className = 'session-auto'
      badge.textContent = 'auto'
      name.append(badge)
    }
    if (s.context) {
      const ctx = document.createElement('span')
      ctx.className = 'session-ctx'
      ctx.dataset.level = ctxLevel(Math.round(s.context.pct))
      ctx.textContent = `${Math.round(s.context.pct)}%`
      name.append(ctx)
    }

    const path = document.createElement('span')
    path.className = 'session-path'
    path.textContent = s.cwd

    btn.append(name, path)
    btn.addEventListener('click', () => open(s.id))

    const kill = document.createElement('button')
    kill.type = 'button'
    kill.className = 'session-kill'
    kill.setAttribute('aria-label', `Encerrar a sessão ${s.label}`)
    kill.textContent = '✕'
    kill.addEventListener('click', () => {
      const question = s.alive
        ? `Encerrar a sessão ${s.label}? O claude dela será finalizado.`
        : `Remover ${s.label} da lista? O histórico dela será apagado.`
      if (!confirm(question)) return
      if (!send({ type: 'kill', sessionId: s.id })) showToast('sem conexão com o hub')
    })

    li.append(btn, kill)
    list.append(li)
  }
}

/* Funde start/end da mesma ferramenta numa linha só e colapsa ociosos seguidos. */
function foldActivity(items, e) {
  if (e.status === 'idle') {
    if (items[items.length - 1]?.status !== 'idle') {
      items.push({ tool: '', detail: 'ocioso', status: 'idle' })
    }
    return items
  }
  if (e.status === 'end') {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].status === 'start' && items[i].tool === e.tool && items[i].detail === e.detail) {
        items[i].status = 'end'
        return items
      }
    }
  }
  items.push({ tool: e.tool, detail: e.detail, status: e.status })
  return items
}

function group(all) {
  const out = []
  for (const e of all) {
    if (e.kind === 'activity') {
      const last = out[out.length - 1]
      if (last?.type === 'acts') foldActivity(last.items, e)
      else out.push({ type: 'acts', items: foldActivity([], e) })
      continue
    }
    out.push({ type: e.kind, event: e })
  }
  return out
}

function turnNode(who, text, kind) {
  const wrap = document.createElement('div')
  wrap.className = 'turn'
  wrap.dataset.kind = kind

  const label = document.createElement('p')
  label.className = 'who'
  label.textContent = who

  // Respostas do Claude chegam em markdown; prompts ficam literais.
  const body = document.createElement(kind === 'reply' ? 'div' : 'p')
  body.className = 'text'
  if (kind === 'reply') body.append(renderMarkdown(text))
  else body.textContent = text

  wrap.append(label, body)
  return wrap
}

function actsNode(items) {
  const ul = document.createElement('ul')
  ul.className = 'acts'
  for (const item of items) {
    const li = document.createElement('li')
    li.className = 'act'
    li.dataset.status = item.status

    const tool = document.createElement('span')
    tool.className = 'act-tool'
    tool.textContent = item.tool

    const detail = document.createElement('span')
    detail.className = 'act-detail'
    detail.textContent = item.detail

    li.append(tool, detail)
    ul.append(li)
  }
  return ul
}

function permNode(e) {
  const box = document.createElement('div')
  box.className = 'perm'
  if (e.resolved) box.dataset.resolved = e.resolved

  const tool = document.createElement('p')
  tool.className = 'perm-tool'
  tool.textContent = e.toolName

  const desc = document.createElement('p')
  desc.className = 'perm-desc'
  desc.textContent = e.description

  box.append(tool, desc)

  // O preview do hook mostra a operação inteira (diff, conteúdo, comando);
  // o inputPreview do protocolo é o fallback resumido.
  if (e.preview) {
    const pre = document.createElement('pre')
    pre.className = 'perm-preview perm-preview-rich'
    for (const line of e.preview.split('\n')) {
      const span = document.createElement('span')
      if (line.startsWith('+ ')) span.className = 'diff-add'
      else if (line.startsWith('- ')) span.className = 'diff-del'
      span.textContent = `${line}\n`
      pre.append(span)
    }
    box.append(pre)
  } else if (e.inputPreview) {
    const pre = document.createElement('pre')
    pre.className = 'perm-preview'
    pre.textContent = e.inputPreview
    box.append(pre)
  }

  if (e.resolved) {
    const verdict = document.createElement('p')
    verdict.className = 'perm-verdict'
    const label = e.resolved === 'allow' ? '✓ permitido' : '✕ negado'
    verdict.textContent = e.auto === true ? `${label} (auto)` : label
    box.append(verdict)
    return box
  }

  const actions = document.createElement('div')
  actions.className = 'perm-actions'
  for (const [behavior, cls, text] of [
    ['allow', 'perm-allow', 'permitir'],
    ['deny', 'perm-deny', 'negar'],
  ]) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = cls
    btn.textContent = text
    btn.addEventListener('click', () => {
      const sent = send({
        type: 'permission_decision',
        sessionId: currentId,
        requestId: e.requestId,
        behavior,
      })
      if (sent) actions.querySelectorAll('button').forEach(b => (b.disabled = true))
    })
    actions.append(btn)
  }
  box.append(actions)
  return box
}

/* Rascunho das respostas por questionId — vive fora do DOM porque o
 * renderFeed reconstrói o feed inteiro a cada evento. */
const questionDraft = new Map()

function draftFor(e) {
  let draft = questionDraft.get(e.questionId)
  if (!draft) {
    draft = { sent: false, answers: e.questions.map(() => ({ chosen: new Set(), other: '' })) }
    questionDraft.set(e.questionId, draft)
  }
  return draft
}

function draftValid(questions, draft) {
  return questions.every((q, i) => {
    const a = draft.answers[i]
    const hasOther = a.other.trim() !== ''
    if (q.multiSelect) return a.chosen.size > 0 || hasOther
    return (a.chosen.size === 1) !== hasOther && a.chosen.size <= 1
  })
}

function askQuestionBlock(q, a, draft, canAnswer, rerender) {
  const block = document.createElement('div')
  block.className = 'ask-q'

  const header = document.createElement('p')
  header.className = 'ask-header'
  header.textContent = q.header

  const text = document.createElement('p')
  text.className = 'ask-question'
  text.textContent = q.question

  block.append(header, text)

  const options = document.createElement('div')
  options.className = 'ask-options'
  q.options.forEach((opt, oi) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ask-opt'
    btn.dataset.on = String(a.chosen.has(oi))
    btn.disabled = !canAnswer || draft.sent

    const label = document.createElement('span')
    label.className = 'ask-opt-label'
    label.textContent = opt.label
    btn.append(label)

    if (opt.description) {
      const desc = document.createElement('span')
      desc.className = 'ask-opt-desc'
      desc.textContent = opt.description
      btn.append(desc)
    }

    btn.addEventListener('click', () => {
      if (q.multiSelect) {
        a.chosen.has(oi) ? a.chosen.delete(oi) : a.chosen.add(oi)
      } else {
        const was = a.chosen.has(oi)
        a.chosen.clear()
        if (!was) a.chosen.add(oi)
        a.other = ''
      }
      rerender()
    })
    options.append(btn)
  })
  block.append(options)

  if (canAnswer) {
    const other = document.createElement('input')
    other.className = 'ask-other'
    other.type = 'text'
    other.placeholder = 'outra resposta…'
    other.value = a.other
    other.disabled = draft.sent
    other.addEventListener('input', () => {
      a.other = other.value
      if (!q.multiSelect && other.value.trim() !== '' && a.chosen.size > 0) {
        a.chosen.clear()
        rerender()
        other.focus()
        return
      }
      // botão "responder" acompanha a validade sem re-render (para não perder o foco)
      draft.onValidity?.()
    })
    block.append(other)
  }

  return block
}

function askNode(e) {
  const box = document.createElement('div')
  box.className = 'ask'
  if (e.resolved !== undefined) box.dataset.resolved = 'true'

  const tool = document.createElement('p')
  tool.className = 'ask-tool'
  tool.textContent = 'pergunta do claude'
  box.append(tool)

  if (e.resolved !== undefined) {
    const answered = Object.entries(e.resolved)
    for (const q of e.questions) {
      const header = document.createElement('p')
      header.className = 'ask-header'
      header.textContent = q.header
      const line = document.createElement('p')
      line.className = answered.length === 0 ? 'ask-verdict ask-verdict-cancel' : 'ask-verdict'
      line.textContent = answered.length === 0 ? 'cancelada' : `→ ${e.resolved[q.question] ?? '—'}`
      box.append(header, line)
    }
    return box
  }

  const s = current()
  const canAnswer = Boolean(s?.alive) && hubConfig.canInterrupt
  const draft = draftFor(e)

  for (let i = 0; i < e.questions.length; i++) {
    box.append(askQuestionBlock(e.questions[i], draft.answers[i], draft, canAnswer, renderFeed))
  }

  if (!canAnswer) {
    const note = document.createElement('p')
    note.className = 'ask-note'
    note.textContent = s?.alive
      ? 'esta sessão não roda dentro de tmux — responda pelo terminal'
      : 'sessão encerrada — pergunta sem resposta'
    box.append(note)
    return box
  }

  const actions = document.createElement('div')
  actions.className = 'ask-actions'
  const sendAnswer = document.createElement('button')
  sendAnswer.type = 'button'
  sendAnswer.className = 'ask-send'
  sendAnswer.textContent = draft.sent ? 'resposta enviada…' : 'responder'
  draft.onValidity = () => {
    sendAnswer.disabled = draft.sent || !draftValid(e.questions, draft)
  }
  draft.onValidity()
  sendAnswer.addEventListener('click', () => {
    const answers = draft.answers.map(a => {
      const chosen = [...a.chosen].sort((x, y) => x - y)
      const other = a.other.trim()
      return other === '' ? { chosen } : { chosen, otherText: other }
    })
    if (!send({ type: 'answer', sessionId: currentId, questionId: e.questionId, answers })) {
      showToast('sem conexão com o hub')
      return
    }
    draft.sent = true
    renderFeed()
  })
  actions.append(sendAnswer)
  box.append(actions)
  return box
}

function renderFeed() {
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80
  const pending = outbox.filter(o => o.sessionId === currentId)

  feed.replaceChildren()
  if (events.length === 0 && pending.length === 0) {
    feed.append(feedEmpty)
    feedEmpty.hidden = false
  }

  for (const g of group(events)) {
    if (g.type === 'acts') feed.append(actsNode(g.items))
    else if (g.type === 'prompt') feed.append(turnNode('você', g.event.text, 'prompt'))
    else if (g.type === 'reply') feed.append(turnNode('claude', g.event.text, 'reply'))
    else if (g.type === 'permission') feed.append(permNode(g.event))
    else if (g.type === 'question') feed.append(askNode(g.event))
  }

  for (const o of pending) {
    const node = turnNode('você · na fila', o.text, 'prompt')
    node.dataset.pending = 'true'
    feed.append(node)
  }

  const s = current()
  const alive = Boolean(s?.alive)
  input.disabled = !alive
  sendBtn.disabled = !alive
  input.placeholder = alive ? 'prompt para esta sessão…' : 'sessão encerrada'

  if (atBottom) feed.scrollTop = feed.scrollHeight
}

/* ---------- composer ---------- */

function submit() {
  const text = input.value.trim()
  if (text === '' || !currentId) return
  // Sem conexão o prompt não se perde: entra na outbox, aparece como "na fila"
  // e é entregue na reconexão.
  if (!send({ type: 'prompt', sessionId: currentId, text })) {
    outbox.push({ sessionId: currentId, text, ts: Date.now() })
    saveOutbox()
    renderFeed()
  }
  input.value = ''
  resize()
}

function resize() {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight}px`
}

input.addEventListener('input', resize)
input.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault()
    submit()
  }
})
sendBtn.addEventListener('click', submit)

autoBtn.addEventListener('click', () => {
  const s = current()
  if (!s) return
  const on = !(s.auto === true)
  if (
    on &&
    !confirm(
      `Ligar o auto para ${s.label}? TODOS os pedidos de permissão desta sessão serão aprovados sem confirmação — inclusive comandos destrutivos.`,
    )
  ) {
    return
  }
  // O hub confirma com toast e a lista de sessões volta com o estado novo.
  if (!send({ type: 'automode', sessionId: s.id, on })) showToast('sem conexão com o hub')
})

modelBtn.addEventListener('click', ev => {
  ev.stopPropagation()
  const s = current()
  if (!s) return
  if (modelMenu.hidden) {
    buildModelMenu(s)
    modelMenu.hidden = false
    modelBtn.setAttribute('aria-expanded', 'true')
  } else {
    closeModelMenu()
  }
})

document.addEventListener('click', ev => {
  if (!modelMenu.hidden && !modelMenu.contains(ev.target) && ev.target !== modelBtn) {
    closeModelMenu()
  }
})

stopBtn.addEventListener('click', () => {
  if (!currentId) return
  if (!confirm('Interromper o turno atual desta sessão?')) return
  // O hub confirma com toast próprio ("turno interrompido") ou reporta o erro.
  if (!send({ type: 'interrupt', sessionId: currentId })) showToast('sem conexão com o hub')
})

if (currentId) app.dataset.view = 'feed'
renderBar()
connect()

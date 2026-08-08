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
const offline = document.getElementById('offline')
const toastEl = document.getElementById('toast')
const spawnBox = document.getElementById('spawn')
const spawnList = document.getElementById('spawn-list')

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
let hubConfig = { projects: [], canSpawn: false, canInterrupt: false }
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
    }
    renderSpawn()
    renderBar()
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

function renderBar() {
  const s = current()
  if (app.dataset.view === 'sessions' || !s) {
    bar.title.textContent = 'sessões'
    bar.state.dataset.alive = 'false'
    stopBtn.hidden = true
    return
  }
  bar.title.textContent = s.label
  bar.state.dataset.alive = String(s.alive)
  stopBtn.hidden = !(s.alive && hubConfig.canInterrupt)
}

function renderSpawn() {
  const usable = hubConfig.canSpawn && hubConfig.projects.length > 0
  spawnBox.hidden = !usable
  spawnList.replaceChildren()
  if (!usable) return

  for (const dir of hubConfig.projects) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'spawn-btn'

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = dir.split('/').filter(Boolean).pop() ?? dir

    const path = document.createElement('span')
    path.className = 'session-path'
    path.textContent = dir

    btn.append(name, path)
    btn.addEventListener('click', () => {
      if (!confirm(`Iniciar uma nova sessão do claude em ${dir}?`)) return
      if (send({ type: 'spawn', dir })) showToast('iniciando sessão — ela aparece na lista em instantes')
      else showToast('sem conexão com o hub')
    })
    li.append(btn)
    spawnList.append(li)
  }
}

function renderSessions() {
  list.replaceChildren()
  sessionsEmpty.hidden = sessions.length > 0

  for (const s of sessions) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'session'
    btn.dataset.alive = String(s.alive)

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = s.label

    const path = document.createElement('span')
    path.className = 'session-path'
    path.textContent = s.cwd

    btn.append(name, path)
    btn.addEventListener('click', () => open(s.id))
    li.append(btn)
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
    verdict.textContent = e.resolved === 'allow' ? '✓ permitido' : '✕ negado'
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

stopBtn.addEventListener('click', () => {
  if (!currentId) return
  if (!confirm('Interromper o turno atual desta sessão?')) return
  if (send({ type: 'interrupt', sessionId: currentId })) showToast('interrupção enviada')
  else showToast('sem conexão com o hub')
})

if (currentId) app.dataset.view = 'feed'
renderBar()
connect()

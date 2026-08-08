import {
  INITIAL_BACKOFF_MS,
  nextBackoff,
  PING_MS,
  PONG_TIMEOUT_MS,
  wakeAction,
} from './connection.js'
import { renderMarkdown } from './markdown.js'
import { sessionStatus } from './session-status.js'
import { createTerminalPanel } from './terminal-panel.js'

const app = document.getElementById('app')
const titleEl = document.getElementById('title')
const stateEl = document.getElementById('state')
const list = document.getElementById('session-list')
const sessionsEmpty = document.getElementById('sessions-empty')
const feed = document.getElementById('feed')
const feedEmpty = document.getElementById('feed-empty')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send')
const stopBtn = document.getElementById('stop')
const moreBtn = document.getElementById('more')
const ctxBox = document.getElementById('context')
const ctxFill = document.getElementById('context-fill')
const quickBar = document.getElementById('quick')
const tabs = document.getElementById('tabs')
const tabActive = document.getElementById('tab-active')
const tabBrowse = document.getElementById('tab-browse')
const menu = document.getElementById('menu')
const menuMain = document.getElementById('menu-main')
const menuModels = document.getElementById('menu-models')
const sheet = document.getElementById('sheet')
const sheetTitle = document.getElementById('sheet-title')
const sheetBranch = document.getElementById('sheet-branch')
const sheetTotal = document.getElementById('sheet-total')
const sheetRatio = document.getElementById('sheet-ratio')
const sheetRatioAdd = document.getElementById('sheet-ratio-add')
const sheetRatioDel = document.getElementById('sheet-ratio-del')
const sheetBody = document.getElementById('sheet-body')
const sheetClose = document.getElementById('sheet-close')
const attachBtn = document.getElementById('attach')
const attachInput = document.getElementById('attach-input')
const attachState = document.getElementById('attach-state')

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
const browseEmpty = document.getElementById('browse-empty')
const dirSearch = document.getElementById('dir-search')

const token = new URLSearchParams(location.search).get('t')
const LAST_KEY = 'local-session.last'
const OUTBOX_KEY = 'local-session.outbox'
const MAX_EVENTS = 200
/** Acima disso a rajada nasce recolhida: o resumo diz o que houve numa linha. */
const ACTS_FOLD_AT = 3

// O cookie definido pelo hub já autentica as próximas visitas — o token não
// precisa ficar exposto na barra de endereço nem no histórico do navegador.
if (token) {
  const url = new URL(location.href)
  url.searchParams.delete('t')
  history.replaceState(null, '', url)
}

let ws = null
let backoff = INITIAL_BACKOFF_MS
let retryTimer = null
let pingTimer = null
let pongTimer = null
let sessions = []
let currentId = localStorage.getItem(LAST_KEY)
let events = []
let hubConfig = {
  projects: [],
  canSpawn: false,
  canInterrupt: false,
  canTerminal: false,
  quickPrompts: [],
  home: '',
}
let browse = null
let toastTimer = null
let dirFilter = ''

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
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const query = token ? `?t=${encodeURIComponent(token)}` : ''
  ws = new WebSocket(`${proto}://${location.host}/_ws${query}`)

  ws.onopen = () => {
    backoff = INITIAL_BACKOFF_MS
    offline.hidden = true
    startPing()
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
    stopPing()
    retryTimer = setTimeout(connect, backoff)
    backoff = nextBackoff(backoff)
  }
  ws.onerror = () => {}
}

// O hub derruba a conexão após 120s sem tráfego (idleTimeout); o ping é o que
// mantém a página em segundo plano viva enquanto o sistema ainda deixa.
function startPing() {
  stopPing()
  pingTimer = setInterval(ping, PING_MS)
}

function stopPing() {
  if (pingTimer !== null) {
    clearInterval(pingTimer)
    pingTimer = null
  }
  if (pongTimer !== null) {
    clearTimeout(pongTimer)
    pongTimer = null
  }
}

// Um socket suspenso pelo sistema volta como OPEN e nunca mais entrega nada:
// só a ausência do pong denuncia. Sem isto, a página parecia conectada e
// exigia refresh manual.
function ping() {
  if (!send({ type: 'ping' })) return
  if (pongTimer !== null) return
  pongTimer = setTimeout(() => {
    pongTimer = null
    reconnectNow()
  }, PONG_TIMEOUT_MS)
}

function reconnectNow() {
  stopPing()
  try {
    ws?.close()
  } catch {}
  ws = null
  offline.hidden = false
  backoff = INITIAL_BACKOFF_MS
  connect()
}

/**
 * Voltar ao foreground é o gatilho que faltava: o celular congela os timers da
 * aba em segundo plano, então o retry agendado pelo onclose pode nunca disparar
 * — e sem isto só um refresh manual reconectava.
 */
function wake() {
  const action = wakeAction(ws === null ? null : ws.readyState)
  if (action === 'wait') return
  if (action === 'ping') ping()
  else reconnectNow()
}

// "ociosa há N min" envelhece sozinha: sem evento novo, nada redesenharia a lista.
setInterval(() => {
  if (app.dataset.view === 'sessions') renderSessions()
}, 60_000)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wake()
})
window.addEventListener('pageshow', wake)
window.addEventListener('online', wake)

function send(msg) {
  if (ws?.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify(msg))
  return true
}

function handle(msg) {
  if (msg.type === 'changes') {
    if (msg.sessionId !== currentId) return
    openSheet(String(msg.text ?? ''), msg.ok === true, msg.branch)
    return
  }
  if (msg.type === 'term_data') {
    terminalPanel.onData(String(msg.data ?? ''))
    return
  }
  if (msg.type === 'term_ready') {
    terminalPanel.onReady(msg)
    return
  }
  if (msg.type === 'term_exit') {
    terminalPanel.onExit(String(msg.reason ?? 'terminal encerrado'))
    return
  }
  if (msg.type === 'pong') {
    if (pongTimer !== null) {
      clearTimeout(pongTimer)
      pongTimer = null
    }
    return
  }
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
      canTerminal: msg.canTerminal === true,
      quickPrompts: Array.isArray(msg.quickPrompts) ? msg.quickPrompts : [],
      home: typeof msg.home === 'string' ? msg.home : '',
    }
    if (hubConfig.canSpawn && !browse) send({ type: 'browse', path: '' })
    renderSpawn()
    renderQuick()
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
  closeMenu()
  send({ type: 'subscribe', sessionId: id })
  flushOutbox()
  renderSessions()
  renderBar()
  renderFeed()
}

function showSessions() {
  app.dataset.view = 'sessions'
  closeMenu()
  renderBar()
}

function showPane(pane) {
  app.dataset.pane = pane
  tabActive.setAttribute('aria-selected', String(pane === 'active'))
  tabBrowse.setAttribute('aria-selected', String(pane === 'browse'))
}

document.getElementById('back').addEventListener('click', showSessions)
tabActive.addEventListener('click', () => showPane('active'))
tabBrowse.addEventListener('click', () => showPane('browse'))

/* ---------- render ---------- */

function current() {
  return sessions.find(s => s.id === currentId) ?? null
}

function ctxLevel(pct) {
  return pct < 50 ? 'ok' : pct < 80 ? 'warn' : 'high'
}

function clock(ts) {
  if (typeof ts !== 'number') return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * `mcp__plugin_context-mode_context-mode__ctx_execute` tem 49 caracteres e o que
 * identifica está no fim: cortado pela esquerda ele vira ruído, e inteiro ele
 * empurra a largura da página.
 */
function toolLabel(tool) {
  return tool.startsWith('mcp__') ? tool.split('__').filter(Boolean).at(-1) : tool
}

function renderContext(s) {
  const ctx = s?.context
  ctxBox.hidden = app.dataset.view !== 'feed' || !ctx
  if (ctxBox.hidden) return
  ctxFill.style.width = `${Math.min(100, Math.max(0, ctx.pct))}%`
  ctxBox.dataset.level = ctxLevel(Math.round(ctx.pct))
}

/* ---------- menu de ações ---------- */

function closeMenu() {
  menu.hidden = true
  menuModels.hidden = true
  menuMain.hidden = false
  moreBtn.setAttribute('aria-expanded', 'false')
}

function menuItem({ icon, label, value, accent, danger, onClick }) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = danger ? 'menu-item menu-danger' : 'menu-item'
  btn.setAttribute('role', 'menuitem')
  if (accent) btn.dataset.accent = 'true'

  const ico = document.createElement('span')
  ico.className = 'menu-icon'
  ico.setAttribute('aria-hidden', 'true')
  ico.textContent = icon

  const text = document.createElement('span')
  text.className = 'menu-label'
  text.textContent = label

  btn.append(ico, text)
  if (value !== undefined) {
    const val = document.createElement('span')
    val.className = 'menu-value'
    val.textContent = value
    btn.append(val)
  }
  btn.addEventListener('click', onClick)
  return btn
}

function buildMenu(s) {
  menuMain.replaceChildren()
  menuModels.replaceChildren()
  menuMain.hidden = false
  menuModels.hidden = true

  if (s.alive && hubConfig.canInterrupt) {
    menuMain.append(
      menuItem({
        icon: '◈',
        label: 'modelo',
        value: s.model?.name ?? '—',
        accent: true,
        onClick: () => {
          menuMain.hidden = true
          menuModels.hidden = false
        },
      }),
    )
  }

  menuMain.append(
    menuItem({
      icon: '⑂',
      label: 'mudanças',
      onClick: () => {
        closeMenu()
        if (send({ type: 'changes', sessionId: s.id })) {
          openSheet('lendo o repositório…', true)
        } else {
          showToast('sem conexão com o hub')
        }
      },
    }),
  )

  if (hubConfig.canTerminal && s.cwd !== '') {
    menuMain.append(
      menuItem({
        icon: '▮',
        label: 'terminal',
        onClick: () => {
          closeMenu()
          if (ws?.readyState !== WebSocket.OPEN) {
            showToast('sem conexão com o hub')
            return
          }
          terminalPanel.open(s.cwd, s.label)
        },
      }),
    )
  }

  const sep = document.createElement('div')
  sep.className = 'menu-sep'
  menuMain.append(sep)

  if (s.alive) {
    const on = s.auto === true
    const auto = menuItem({
      icon: '⚡',
      label: 'auto mode',
      onClick: () => {
        closeMenu()
        if (
          !on &&
          !confirm(
            `Ligar o auto para ${s.label}? TODOS os pedidos de permissão desta sessão serão aprovados sem confirmação — inclusive comandos destrutivos.`,
          )
        ) {
          return
        }
        // O hub confirma com toast e a lista de sessões volta com o estado novo.
        if (!send({ type: 'automode', sessionId: s.id, on: !on })) {
          showToast('sem conexão com o hub')
        }
      },
    })
    auto.setAttribute('role', 'menuitemcheckbox')
    auto.setAttribute('aria-checked', String(on))
    const knob = document.createElement('span')
    knob.className = 'menu-switch'
    knob.setAttribute('aria-hidden', 'true')
    auto.append(knob)
    menuMain.append(auto)
  }

  menuMain.append(
    menuItem({
      icon: '✕',
      label: s.alive ? 'encerrar sessão' : 'remover da lista',
      danger: true,
      onClick: () => {
        closeMenu()
        if (!confirmKill(s)) return
        if (!send({ type: 'kill', sessionId: s.id })) showToast('sem conexão com o hub')
      },
    }),
  )

  const note = document.createElement('p')
  note.className = 'menu-note'
  note.textContent = 'também vira o padrão de novas sessões'
  menuModels.append(note)
  for (const m of MODELS) {
    const item = menuItem({
      icon: s.model?.name === m.name ? '✓' : '',
      label: m.name,
      accent: s.model?.name === m.name,
      onClick: () => {
        closeMenu()
        if (s.model?.name === m.name) return
        if (!send({ type: 'setmodel', sessionId: s.id, model: m.alias })) {
          showToast('sem conexão com o hub')
        } else {
          showToast(`trocando para ${m.name}…`)
        }
      },
    })
    item.classList.add('model-item')
    item.dataset.on = String(s.model?.name === m.name)
    menuModels.append(item)
  }
}

function confirmKill(s) {
  return confirm(
    s.alive
      ? `Encerrar a sessão ${s.label}? O claude dela será finalizado.`
      : `Remover ${s.label} da lista? O histórico dela será apagado.`,
  )
}

moreBtn.addEventListener('click', ev => {
  ev.stopPropagation()
  const s = current()
  if (!s) return
  if (menu.hidden) {
    buildMenu(s)
    // Ancorado na barra medida, não num número mágico: o topo cresce com a
    // safe area do aparelho.
    document.getElementById('menu-panel').style.top =
      `${document.getElementById('bar').getBoundingClientRect().bottom + 6}px`
    menu.hidden = false
    moreBtn.setAttribute('aria-expanded', 'true')
  } else {
    closeMenu()
  }
})

menu.addEventListener('click', ev => {
  if (ev.target === menu) closeMenu()
})

/* ---------- folha de mudanças ---------- */

/**
 * Reconstrói a estrutura por arquivo a partir do texto do hub (status --short +
 * --stat + diff). O texto cru é o fallback: formato inesperado vira nota, nunca
 * tela vazia.
 */
function parseChanges(text) {
  const files = new Map()
  const get = path => {
    let f = files.get(path)
    if (!f) {
      f = { path, mark: 'mod', add: 0, del: 0, hunks: [] }
      files.set(path, f)
    }
    return f
  }

  const statusBlock = text.match(/^arquivos\n([\s\S]*?)(?:\n\n|$)/m)?.[1]
  if (statusBlock) {
    for (const line of statusBlock.split('\n')) {
      const m = line.match(/^(..)\s+(.+)$/)
      if (!m) continue
      const code = m[1]
      // O caminho de um rename vem como "antigo -> novo"; interessa o destino.
      const path = m[2].split(' -> ').at(-1).trim()
      const f = get(path)
      if (code.includes('?')) f.mark = 'new'
      else if (code.includes('D')) f.mark = 'del'
      else if (code.includes('A')) f.mark = 'new'
    }
  }

  const statBlock = text.match(/^resumo\n([\s\S]*?)(?:\n\n|$)/m)?.[1]
  let total = null
  if (statBlock) {
    for (const line of statBlock.split('\n')) {
      const totals = line.match(/(\d+) insertions?\(\+\)|(\d+) deletions?\(-\)/g)
      if (line.includes('changed') && totals) {
        total = { add: 0, del: 0 }
        for (const t of totals) {
          const n = Number.parseInt(t, 10)
          if (t.includes('+')) total.add = n
          else total.del = n
        }
        continue
      }
      const m = line.match(/^\s*(.+?)\s+\|\s+\d+\s*([+-]*)\s*$/)
      if (!m) continue
      const f = get(m[1].trim())
      f.add = (m[2].match(/\+/g) ?? []).length
      f.del = (m[2].match(/-/g) ?? []).length
    }
  }

  // O --stat só dá a proporção de +/- (barra de no máximo ~80 colunas); as
  // contagens reais saem do próprio diff.
  for (const chunk of text.split(/^diff --git /m).slice(1)) {
    const path = chunk.match(/^a\/(.+?) b\//)?.[1]
    if (!path) continue
    const f = get(path)
    f.add = 0
    f.del = 0
    let hunk = null
    for (const line of chunk.split('\n')) {
      if (line.startsWith('@@')) {
        hunk = { head: line, lines: [] }
        f.hunks.push(hunk)
        continue
      }
      if (!hunk) continue
      if (line.startsWith('+')) {
        f.add += 1
        hunk.lines.push({ sign: 'add', text: line })
      } else if (line.startsWith('-')) {
        f.del += 1
        hunk.lines.push({ sign: 'del', text: line })
      } else if (line.startsWith('\\')) {
        continue
      } else {
        hunk.lines.push({ sign: 'ctx', text: line })
      }
    }
  }

  const out = [...files.values()]
  if (total === null && out.length > 0) {
    total = out.reduce((acc, f) => ({ add: acc.add + f.add, del: acc.del + f.del }), {
      add: 0,
      del: 0,
    })
  }
  return { files: out, total }
}

function fileRow(f, onToggle) {
  const row = document.createElement('button')
  row.type = 'button'
  row.className = 'file-row'

  const mark = document.createElement('span')
  mark.className = 'file-mark'
  mark.dataset.kind = f.mark
  mark.textContent = f.mark === 'new' ? '?' : f.mark === 'del' ? 'D' : 'M'

  const path = document.createElement('span')
  path.className = 'file-path'
  path.textContent = f.path

  const chev = document.createElement('span')
  chev.className = 'file-chev'
  chev.setAttribute('aria-hidden', 'true')
  chev.textContent = f.open ? '▾' : '▸'

  row.append(mark, path)
  if (f.add > 0) {
    const add = document.createElement('span')
    add.className = 'file-add'
    add.textContent = `+${f.add}`
    row.append(add)
  }
  if (f.del > 0) {
    const del = document.createElement('span')
    del.className = 'file-del'
    del.textContent = `−${f.del}`
    row.append(del)
  }
  row.append(chev)
  row.setAttribute('aria-expanded', String(f.open === true))
  row.addEventListener('click', () => onToggle(f))
  return row
}

function hunkNode(hunk) {
  const head = document.createElement('div')
  head.className = 'hunk-head'
  head.textContent = hunk.head

  const lines = document.createElement('div')
  lines.className = 'hunk-lines'
  for (const l of hunk.lines) {
    const row = document.createElement('div')
    row.className = 'diff-line'
    if (l.sign !== 'ctx') row.dataset.sign = l.sign
    row.textContent = l.text === '' ? ' ' : l.text
    lines.append(row)
  }
  return [head, lines]
}

let changesModel = null

function renderSheetBody() {
  sheetBody.replaceChildren()
  if (!changesModel) return

  if (changesModel.files.length === 0) {
    const note = document.createElement('p')
    note.className = 'sheet-note'
    note.textContent = changesModel.raw
    sheetBody.append(note)
    return
  }

  for (const f of changesModel.files) {
    sheetBody.append(
      fileRow(f, target => {
        target.open = !target.open
        renderSheetBody()
      }),
    )
    if (!f.open) continue
    const body = document.createElement('div')
    body.className = 'file-body'
    if (f.hunks.length === 0) {
      const note = document.createElement('div')
      note.className = 'hunk-head'
      note.textContent = f.mark === 'new' ? 'arquivo novo — sem diff contra HEAD' : 'sem diff'
      body.append(note)
    } else {
      for (const h of f.hunks) body.append(...hunkNode(h))
    }
    sheetBody.append(body)
  }
}

function openSheet(text, ok, branch) {
  const parsed = ok ? parseChanges(text) : { files: [], total: null }
  changesModel = { files: parsed.files, total: parsed.total, raw: text }
  // Um arquivo só: abrir de cara poupa um toque sem esconder os outros.
  if (changesModel.files.length === 1) changesModel.files[0].open = true

  sheetTitle.textContent = ok ? 'mudanças' : 'sem git'
  sheetBranch.textContent = branch ?? ''

  const total = changesModel.total
  sheetTotal.replaceChildren()
  if (total && (total.add > 0 || total.del > 0)) {
    const add = document.createElement('span')
    add.className = 'total-add'
    add.textContent = `+${total.add}`
    const del = document.createElement('span')
    del.className = 'total-del'
    del.textContent = `−${total.del}`
    sheetTotal.append(add, document.createTextNode(' '), del)
    sheetRatio.hidden = false
    sheetRatioAdd.style.flex = String(Math.max(total.add, 1))
    sheetRatioDel.style.flex = String(Math.max(total.del, 1))
  } else {
    sheetRatio.hidden = true
  }

  renderSheetBody()
  sheet.hidden = false
}

function closeSheet() {
  sheet.hidden = true
}

const terminalPanel = createTerminalPanel({
  send,
  toast: showToast,
  confirmKill: label => confirm(`encerrar o terminal de ${label}? o que estiver rodando morre junto.`),
})

// Um toque manda o prompt: é o ponto do atalho. Por isso os padrões do hub não
// têm efeito colateral — nada de commit/push por engano no bolso.
function renderQuick() {
  const s = current()
  const show = app.dataset.view === 'feed' && Boolean(s?.alive) && hubConfig.quickPrompts.length > 0
  quickBar.hidden = !show
  if (!show) return

  quickBar.replaceChildren()
  for (const text of hubConfig.quickPrompts) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'quick-chip'
    chip.textContent = text
    chip.addEventListener('click', () => sendPrompt(text))
    quickBar.append(chip)
  }
}

function renderBar() {
  const s = current()
  renderContext(s)
  renderQuick()
  tabs.hidden = !hubConfig.canSpawn
  tabBrowse.hidden = !hubConfig.canSpawn
  if (!hubConfig.canSpawn) showPane('active')

  if (app.dataset.view === 'sessions' || !s) {
    stateEl.dataset.alive = 'false'
    stopBtn.hidden = true
    moreBtn.hidden = true
    closeMenu()
    return
  }

  titleEl.textContent = s.label
  const status = sessionStatus(s, Date.now())
  const bits = [status.label]
  if (s.model?.name) bits.push(s.model.name)
  if (s.context) bits.push(`${Math.round(s.context.pct)}%`)
  stateEl.textContent = bits.join(' · ')
  stateEl.dataset.alive = String(s.alive)
  stateEl.dataset.busy = String(s.busy === true)
  stopBtn.hidden = !(s.alive && s.busy === true && hubConfig.canInterrupt)
  moreBtn.hidden = false
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

function toggleFavorite(dir, isFav) {
  if (!send({ type: 'favorite', path: dir, on: !isFav })) showToast('sem conexão com o hub')
}

function renderSpawn() {
  spawnBox.hidden = !hubConfig.canSpawn
  spawnList.replaceChildren()
  browseList.replaceChildren()
  if (!hubConfig.canSpawn) return

  const needle = dirFilter.trim().toLowerCase()
  const favs = hubConfig.projects.filter(
    d => needle === '' || d.toLowerCase().includes(needle),
  )
  spawnEmpty.hidden = favs.length > 0
  if (favs.length === 0 && needle !== '') {
    spawnEmpty.textContent = 'nenhum favorito com esse nome.'
  } else {
    spawnEmpty.textContent = 'nenhum favorito — marque uma pasta com ☆ abaixo.'
  }

  for (const dir of favs) {
    const li = document.createElement('li')
    li.className = 'fav-item'

    const mark = document.createElement('button')
    mark.type = 'button'
    mark.className = 'fav-mark'
    mark.setAttribute('aria-label', `Remover ${tilde(dir)} dos favoritos`)
    mark.textContent = '★'
    mark.addEventListener('click', () => toggleFavorite(dir, true))

    const id = document.createElement('div')
    id.className = 'fav-id'
    const name = document.createElement('span')
    name.className = 'fav-name'
    name.textContent = dir.split('/').filter(Boolean).pop() ?? dir
    const path = document.createElement('span')
    path.className = 'fav-path'
    path.textContent = tilde(dir)
    id.append(name, path)

    const openBtn = document.createElement('button')
    openBtn.type = 'button'
    openBtn.className = 'fav-open'
    openBtn.textContent = 'abrir'
    openBtn.addEventListener('click', () => confirmSpawn(dir))

    li.append(mark, id, openBtn)
    spawnList.append(li)
  }

  browsePathEl.textContent = browse ? tilde(browse.path) : '…'
  if (!browse) return

  if (browse.parent && needle === '') {
    const li = document.createElement('li')
    li.className = 'dir-item'
    const up = document.createElement('button')
    up.type = 'button'
    up.className = 'dir-name dir-up'
    const label = document.createElement('span')
    label.className = 'dir-label'
    label.textContent = 'voltar'
    up.append(label)
    up.addEventListener('click', () => send({ type: 'browse', path: browse.parent }))
    li.append(up)
    browseList.append(li)
  }

  const dirs = browse.dirs.filter(d => needle === '' || d.name.toLowerCase().includes(needle))
  browseEmpty.hidden = dirs.length > 0

  for (const d of dirs) {
    const li = document.createElement('li')
    li.className = 'dir-item'

    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'dir-name'
    const label = document.createElement('span')
    label.className = 'dir-label'
    label.textContent = d.name
    name.append(label)
    name.addEventListener('click', () => send({ type: 'browse', path: d.path }))

    const isFav = hubConfig.projects.includes(d.path)
    const star = document.createElement('button')
    star.type = 'button'
    star.className = 'dir-action dir-star'
    star.dataset.on = String(isFav)
    star.setAttribute(
      'aria-label',
      isFav ? `Remover ${tilde(d.path)} dos favoritos` : `Marcar ${tilde(d.path)} como favorito`,
    )
    star.textContent = isFav ? '★' : '☆'
    star.addEventListener('click', () => toggleFavorite(d.path, isFav))

    const plus = document.createElement('button')
    plus.type = 'button'
    plus.className = 'dir-action dir-spawn'
    plus.setAttribute('aria-label', `Nova sessão em ${tilde(d.path)}`)
    plus.textContent = '+'
    plus.addEventListener('click', () => confirmSpawn(d.path))

    li.append(name, star, plus)
    browseList.append(li)
  }
}

dirSearch.addEventListener('input', () => {
  dirFilter = dirSearch.value
  renderSpawn()
})

function decide(sessionId, requestId, behavior, buttons) {
  const sent = send({ type: 'permission_decision', sessionId, requestId, behavior })
  if (!sent) {
    showToast('sem conexão com o hub')
    return
  }
  for (const b of buttons) b.disabled = true
}

function permButtons(sessionId, requestId) {
  const wrap = document.createElement('div')
  wrap.className = 'perm-actions'
  const deny = document.createElement('button')
  deny.type = 'button'
  deny.className = 'perm-deny'
  deny.textContent = 'negar'
  const allow = document.createElement('button')
  allow.type = 'button'
  allow.className = 'perm-allow'
  allow.textContent = 'permitir'
  const both = [deny, allow]
  deny.addEventListener('click', ev => {
    ev.stopPropagation()
    decide(sessionId, requestId, 'deny', both)
  })
  allow.addEventListener('click', ev => {
    ev.stopPropagation()
    decide(sessionId, requestId, 'allow', both)
  })
  wrap.append(deny, allow)
  return wrap
}

function renderSessions() {
  list.replaceChildren()
  sessionsEmpty.hidden = sessions.length > 0
  const live = sessions.filter(s => s.alive).length
  tabActive.textContent = live > 0 ? `ativas · ${live}` : 'ativas'

  for (const s of sessions) {
    const status = sessionStatus(s, Date.now())
    const li = document.createElement('li')
    li.className = 'session-item'
    li.dataset.tone = status.tone

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'session'
    btn.addEventListener('click', () => open(s.id))

    const top = document.createElement('div')
    top.className = 'session-top'
    if (status.tone === 'waiting') {
      const badge = document.createElement('span')
      badge.className = 'session-badge'
      badge.textContent = status.label
      top.append(badge)
    } else {
      const dot = document.createElement('span')
      dot.className = 'session-dot'
      const state = document.createElement('span')
      state.className = 'session-state'
      state.textContent = status.label
      top.append(dot, state)
    }
    if (s.auto === true) {
      const auto = document.createElement('span')
      auto.className = 'session-auto'
      auto.textContent = 'auto'
      top.append(auto)
    }
    if (s.context) {
      const ctx = document.createElement('span')
      ctx.className = 'session-ctx'
      ctx.textContent = `${Math.round(s.context.pct)}%`
      top.append(ctx)
    }

    const id = document.createElement('div')
    id.className = 'session-id'
    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = s.label
    const path = document.createElement('span')
    path.className = 'session-path'
    path.textContent = tilde(s.cwd)
    id.append(name, path)

    btn.append(top, id)

    // O que a sessão pede fica legível na própria lista — decidir daqui não
    // exige abrir o feed.
    if (s.pending) {
      const ask = document.createElement('div')
      ask.className = 'session-ask'
      const tool = document.createElement('span')
      tool.className = 'session-ask-tool'
      tool.textContent = toolLabel(s.pending.toolName)
      const detail = document.createElement('span')
      detail.className = 'session-ask-detail'
      detail.textContent = s.pending.description
      ask.append(tool, detail)
      btn.append(ask)
    } else if (status.tone === 'busy' && s.context) {
      const meter = document.createElement('div')
      meter.className = 'session-meter'
      const track = document.createElement('div')
      track.className = 'session-track'
      track.dataset.level = ctxLevel(Math.round(s.context.pct))
      const fill = document.createElement('div')
      fill.className = 'session-fill'
      fill.style.width = `${Math.min(100, Math.max(0, s.context.pct))}%`
      track.append(fill)
      const label = document.createElement('span')
      label.className = 'session-meter-label'
      label.textContent = `${Math.round(s.context.pct)}% ctx`
      meter.append(track, label)
      btn.append(meter)
    }

    li.append(btn)
    if (s.pending) li.append(permButtons(s.id, s.pending.requestId))

    // Sessão viva se encerra pelo menu de dentro dela; da lista só se remove o
    // que já morreu.
    if (!s.alive) {
      const drop = document.createElement('button')
      drop.type = 'button'
      drop.className = 'session-drop'
      drop.setAttribute('aria-label', `Remover ${s.label} da lista`)
      drop.textContent = '✕'
      drop.addEventListener('click', ev => {
        ev.stopPropagation()
        if (!confirmKill(s)) return
        if (!send({ type: 'kill', sessionId: s.id })) showToast('sem conexão com o hub')
      })
      li.append(drop)
    }

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
      // O ts do primeiro evento identifica a rajada entre renders — é o que
      // mantém aberto o grupo que você abriu.
      else out.push({ type: 'acts', key: e.ts, items: foldActivity([], e) })
      continue
    }
    out.push({ type: e.kind, event: e })
  }
  return out
}

function turnNode(who, text, kind, ts) {
  const wrap = document.createElement('div')
  wrap.className = 'turn'
  wrap.dataset.kind = kind

  if (kind === 'prompt') {
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = text
    wrap.append(bubble)

    const meta = document.createElement('div')
    meta.className = 'turn-meta'
    const time = document.createElement('span')
    time.className = 'turn-time'
    time.textContent = who === 'você' ? clock(ts) : who
    // Reaproveitar o que você já escreveu é o histórico de prompts mais barato:
    // um toque devolve o texto ao composer, pronto para editar e reenviar.
    const again = document.createElement('button')
    again.type = 'button'
    again.className = 'turn-again'
    again.textContent = '↻ reenviar'
    again.addEventListener('click', () => {
      input.value = text
      resize()
      input.focus()
    })
    meta.append(time, again)
    wrap.append(meta)
    return wrap
  }

  const head = document.createElement('div')
  head.className = 'who'
  const avatar = document.createElement('span')
  avatar.className = 'avatar'
  avatar.setAttribute('aria-hidden', 'true')
  avatar.textContent = 'C'
  const label = document.createElement('span')
  label.className = 'who-name'
  label.textContent = who
  head.append(avatar, label)

  const body = document.createElement('div')
  body.className = 'text'
  body.append(renderMarkdown(text))

  wrap.append(head, body)
  return wrap
}

/* Quais rajadas o usuário abriu ou fechou na mão — o padrão depende do tamanho. */
const actsOpened = new Set()
const actsClosed = new Set()

function actsNode(key, items) {
  const box = document.createElement('details')
  box.className = 'acts'
  const many = items.length > ACTS_FOLD_AT
  box.open = actsOpened.has(key) || (!actsClosed.has(key) && !many)
  box.addEventListener('toggle', () => {
    if (box.open) {
      actsOpened.add(key)
      actsClosed.delete(key)
    } else {
      actsClosed.add(key)
      actsOpened.delete(key)
    }
  })

  const sum = document.createElement('summary')
  sum.className = 'acts-sum'
  const count = document.createElement('span')
  count.className = 'acts-count'
  count.textContent = items.length === 1 ? '1 ação' : `${items.length} ações`
  const tools = document.createElement('span')
  tools.className = 'acts-tools'
  const names = [...new Set(items.map(i => toolLabel(i.tool)).filter(Boolean))]
  tools.textContent = names.length > 0 ? `· ${names.join(', ')}` : ''
  sum.append(count, tools)

  const ul = document.createElement('ul')
  ul.className = 'acts-list'
  for (const item of items) {
    const li = document.createElement('li')
    li.className = 'act'
    li.dataset.status = item.status

    const mark = document.createElement('span')
    mark.className = 'act-mark'
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = item.status === 'end' ? '✓' : item.status === 'start' ? '…' : '·'

    const tool = document.createElement('span')
    tool.className = 'act-tool'
    tool.textContent = toolLabel(item.tool)
    if (tool.textContent !== item.tool) tool.title = item.tool

    const detail = document.createElement('span')
    detail.className = 'act-detail'
    detail.textContent = item.detail
    detail.title = item.detail

    li.append(mark, tool, detail)
    ul.append(li)
  }

  box.append(sum, ul)
  return box
}

function permNode(e) {
  const box = document.createElement('div')
  box.className = 'perm'
  if (e.resolved) box.dataset.resolved = e.resolved

  const inner = document.createElement('div')
  inner.className = 'perm-in'

  const head = document.createElement('div')
  head.className = 'perm-head'
  const tool = document.createElement('p')
  tool.className = 'perm-tool'
  tool.textContent = `permissão · ${toolLabel(e.toolName)}`
  tool.title = e.toolName
  const target = document.createElement('p')
  target.className = 'perm-target'
  target.textContent = e.description
  head.append(tool, target)
  inner.append(head)

  // O preview do hook mostra a operação inteira (diff, conteúdo, comando);
  // o inputPreview do protocolo é o fallback resumido.
  const preview = e.preview ?? e.inputPreview
  if (preview) {
    const pre = document.createElement('pre')
    pre.className = 'perm-preview'
    for (const line of preview.split('\n')) {
      const span = document.createElement('span')
      if (line.startsWith('+ ') || line.startsWith('+')) span.className = 'diff-add'
      else if (line.startsWith('- ') || line.startsWith('-')) span.className = 'diff-del'
      span.textContent = `${line}\n`
      pre.append(span)
    }
    inner.append(pre)
  }

  if (e.resolved) {
    const verdict = document.createElement('p')
    verdict.className = 'perm-verdict'
    const label = e.resolved === 'allow' ? '✓ permitido' : '✕ negado'
    verdict.textContent = e.auto === true ? `${label} (auto)` : label
    inner.append(verdict)
    box.append(inner)
    return box
  }

  inner.append(permButtons(currentId, e.requestId))
  box.append(inner)
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
  box.append(sendAnswer)
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
    if (g.type === 'acts') feed.append(actsNode(g.key, g.items))
    else if (g.type === 'prompt') feed.append(turnNode('você', g.event.text, 'prompt', g.event.ts))
    else if (g.type === 'reply') feed.append(turnNode('claude', g.event.text, 'reply', g.event.ts))
    else if (g.type === 'permission') feed.append(permNode(g.event))
    else if (g.type === 'question') feed.append(askNode(g.event))
  }

  for (const o of pending) {
    const node = turnNode('na fila', o.text, 'prompt', o.ts)
    node.dataset.pending = 'true'
    feed.append(node)
  }

  const s = current()
  const alive = Boolean(s?.alive)
  input.disabled = !alive
  sendBtn.disabled = !alive
  input.placeholder = alive ? 'mensagem' : 'sessão encerrada'

  if (atBottom) feed.scrollTop = feed.scrollHeight
}

/* ---------- composer ---------- */

let attached = null

function renderAttach() {
  attachState.hidden = attached === null
  if (attached) attachState.textContent = `📎 ${attached.split('/').at(-1)} — vai junto no envio`
}

function clearAttach() {
  attached = null
  attachInput.value = ''
  renderAttach()
}

// O canal transporta texto: a imagem sobe para o disco do hub e o prompt aponta
// para o arquivo, que o Claude abre com Read.
async function uploadImage(file) {
  if (!currentId) return
  showToast('enviando imagem…')
  try {
    const res = await fetch(`/_upload?session=${encodeURIComponent(currentId)}`, {
      method: 'POST',
      body: file,
    })
    if (!res.ok) {
      showToast(res.status === 400 ? 'arquivo não é uma imagem suportada' : 'falha no envio')
      return
    }
    const body = await res.json()
    attached = String(body.path ?? '')
    renderAttach()
    showToast('imagem anexada')
  } catch {
    showToast('falha no envio da imagem')
  }
}

function withAttachment(text) {
  if (attached === null) return text
  const note = `imagem anexada: ${attached}`
  return text === '' ? note : `${text}\n\n${note}`
}

function sendPrompt(text) {
  if (text === '' || !currentId) return
  // Sem conexão o prompt não se perde: entra na outbox, aparece como "na fila"
  // e é entregue na reconexão.
  if (!send({ type: 'prompt', sessionId: currentId, text })) {
    outbox.push({ sessionId: currentId, text, ts: Date.now() })
    saveOutbox()
    renderFeed()
  }
}

function submit() {
  const text = withAttachment(input.value.trim())
  if (text === '') return
  sendPrompt(text)
  input.value = ''
  clearAttach()
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

attachBtn.addEventListener('click', () => attachInput.click())
attachInput.addEventListener('change', () => {
  const file = attachInput.files?.[0]
  if (file) void uploadImage(file)
})
attachState.addEventListener('click', clearAttach)

sheetClose.addEventListener('click', closeSheet)
sheet.addEventListener('click', ev => {
  if (ev.target === sheet) closeSheet()
})

document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return
  if (!menu.hidden) closeMenu()
  else if (!sheet.hidden) closeSheet()
  else terminalPanel.close()
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

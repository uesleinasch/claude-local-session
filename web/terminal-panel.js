/*
 * Visor de um terminal tmux. Quem emula o terminal é o tmux do outro lado: aqui
 * o xterm.js só desenha o fluxo cru que chega e devolve teclas.
 */

/** Rótulo curto no botão, tecla no vocabulário do `tmux send-keys`. */
const CONTROL_KEYS = [
  { label: '^C', key: 'C-c', title: 'Interromper' },
  { label: 'esc', key: 'Escape', title: 'Escape' },
  { label: 'tab', key: 'Tab', title: 'Completar' },
  { label: '↑', key: 'Up', title: 'Comando anterior' },
  { label: '↓', key: 'Down', title: 'Próximo comando' },
  { label: '←', key: 'Left', title: 'Esquerda' },
  { label: '→', key: 'Right', title: 'Direita' },
  { label: '↵', key: 'Enter', title: 'Enter' },
  { label: '^D', key: 'C-d', title: 'Fim de entrada' },
  { label: '^L', key: 'C-l', title: 'Limpar a tela' },
  { label: '^U', key: 'C-u', title: 'Apagar a linha' },
  { label: '^Z', key: 'C-z', title: 'Suspender' },
]

const THEME = {
  background: '#0b0c0e',
  foreground: '#eceae7',
  cursor: '#ffb02e',
  selectionBackground: '#333a42',
}

/** O capture-pane devolve linhas separadas por \n; o xterm precisa do retorno. */
function asTerminalText(text) {
  return text.replace(/\r?\n/g, '\r\n')
}

export function createTerminalPanel({ send, toast, confirmKill }) {
  const panel = document.getElementById('term')
  const title = document.getElementById('term-title')
  const screen = document.getElementById('term-screen')
  const keysBar = document.getElementById('term-keys')
  const input = document.getElementById('term-input')
  const sendBtn = document.getElementById('term-send')
  const killBtn = document.getElementById('term-kill')
  const closeBtn = document.getElementById('term-close')

  let term = null
  let fit = null
  let dir = null
  let resizeTimer = null

  function available() {
    return typeof window.Terminal === 'function'
  }

  function measure() {
    if (fit === null || term === null) return { cols: 80, rows: 24 }
    try {
      fit.fit()
    } catch {}
    return { cols: term.cols, rows: term.rows }
  }

  function build() {
    if (term !== null) return
    term = new window.Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: getComputedStyle(document.body).fontFamily,
      fontSize: 13,
      scrollback: 5000,
      theme: THEME,
    })
    const FitAddon = window.FitAddon?.FitAddon
    if (FitAddon) {
      fit = new FitAddon()
      term.loadAddon(fit)
    }
    term.open(screen)
    // Teclado físico (quando houver) digita direto; no celular o campo de
    // baixo é quem manda, porque o teclado virtual atrapalha essa captura.
    term.onData(data => {
      if (dir !== null) send({ type: 'term_input', text: data, enter: false })
    })
  }

  function renderKeys() {
    if (keysBar.childElementCount > 0) return
    for (const { label, key, title: hint } of CONTROL_KEYS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'term-key'
      button.textContent = label
      button.title = hint
      button.setAttribute('aria-label', hint)
      button.addEventListener('click', () => send({ type: 'term_key', key }))
      keysBar.append(button)
    }
  }

  function submit() {
    const text = input.value
    if (text === '') {
      send({ type: 'term_key', key: 'Enter' })
      return
    }
    send({ type: 'term_input', text, enter: true })
    input.value = ''
  }

  function syncSize() {
    if (dir === null) return
    const size = measure()
    send({ type: 'term_resize', ...size })
  }

  function isOpen() {
    return !panel.hidden
  }

  function open(path, label) {
    if (!available()) {
      toast('não consegui carregar o terminal — recarregue a página')
      return
    }
    panel.hidden = false
    title.textContent = label
    build()
    renderKeys()
    dir = path
    term.reset()
    term.write('\x1b[90mabrindo…\x1b[0m\r\n')
    // Sem foco automático: no celular focar abriria o teclado por cima da tela
    // logo na abertura, escondendo justamente o que a pessoa veio ver.
    send({ type: 'term_open', dir: path, ...measure() })
  }

  function close() {
    if (!isOpen()) return
    panel.hidden = true
    if (dir !== null) send({ type: 'term_close' })
    dir = null
  }

  function onReady(msg) {
    if (term === null) return
    term.reset()
    if (typeof msg.seed === 'string' && msg.seed !== '') term.write(asTerminalText(msg.seed))
    // A primeira medição sai antes de a fonte assentar e erra as colunas por
    // pouco; refazer depois do primeiro quadro alinha a tela com o tmux.
    setTimeout(syncSize, 50)
  }

  function onData(text) {
    if (term !== null) term.write(text)
  }

  function onExit(reason) {
    if (term !== null) term.write(`\r\n\x1b[33m${reason}\x1b[0m\r\n`)
    dir = null
  }

  sendBtn.addEventListener('click', submit)
  input.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    submit()
  })
  closeBtn.addEventListener('click', close)
  killBtn.addEventListener('click', () => {
    if (dir === null) {
      close()
      return
    }
    if (!confirmKill(title.textContent)) return
    send({ type: 'term_kill' })
  })

  // O teclado virtual abrindo já muda a altura da viewport: sem o atraso, o
  // resize sairia com o tamanho de transição e a tela ficaria torta.
  const onViewportChange = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(syncSize, 150)
  }
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)

  return { open, close, isOpen, onReady, onData, onExit }
}

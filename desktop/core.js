'use strict'

/**
 * Toda a inteligência do app mora no binário `local-session`: a janela só
 * pergunta e mostra. Esta é a allowlist do que ela pode pedir — o renderer
 * manda um id daqui, nunca uma linha de comando. Sem isso, qualquer coisa
 * carregada na janela viraria execução arbitrária na máquina.
 */
const ACTIONS = {
  setup: { bin: 'self', args: ['setup'], label: 'configurar tudo' },
  service: { bin: 'self', args: ['service'], label: 'instalar o serviço' },
  'hub-start': {
    bin: 'systemctl',
    args: ['--user', 'start', 'local-session-hub'],
    label: 'ligar o hub',
  },
  'hub-stop': {
    bin: 'systemctl',
    args: ['--user', 'stop', 'local-session-hub'],
    label: 'desligar o hub',
  },
  'hub-restart': {
    bin: 'systemctl',
    args: ['--user', 'restart', 'local-session-hub'],
    label: 'reiniciar o hub',
  },
  'boot-on': {
    bin: 'systemctl',
    args: ['--user', 'enable', '--now', 'local-session-hub'],
    label: 'ligar no boot',
  },
  'boot-off': {
    bin: 'systemctl',
    args: ['--user', 'disable', 'local-session-hub'],
    label: 'não ligar no boot',
  },
  // Escrever em /etc exige privilégio, e não há TTY aqui para o sudo pedir
  // senha: o pkexec abre o diálogo do desktop.
  canal: { bin: 'pkexec', args: ['SELF', 'managed-settings', '--apply'], label: 'habilitar o canal' },
}

function actionIds() {
  return Object.keys(ACTIONS)
}

// `Object.hasOwn`, nunca `ACTIONS[id]` direto: `__proto__` e `constructor`
// devolvem objetos herdados que passariam pelo teste de existência e furariam
// a allowlist.
function knownAction(id) {
  return typeof id === 'string' && Object.hasOwn(ACTIONS, id) ? ACTIONS[id] : null
}

function actionLabel(id) {
  const action = knownAction(id)
  return action ? action.label : null
}

/**
 * Traduz o id numa linha de comando concreta. `self` e o marcador `SELF` viram
 * o caminho do binário — que muda entre pacote, repo e PATH.
 */
function resolveAction(id, selfPath) {
  const action = knownAction(id)
  if (!action) return null
  const bin = action.bin === 'self' ? selfPath : action.bin
  const args = action.args.map(a => (a === 'SELF' ? selfPath : a))
  return { bin, args }
}

/**
 * Mesma ordem do shim `bin/local-session`: o binário compilado do repo, o do
 * sistema e, por último, o fonte. Manter as duas em sincronia importa — é o que
 * faz o app funcionar tanto instalado quanto rodando do clone.
 */
function resolveBinary(candidates, isExecutable) {
  for (const c of candidates) if (c && isExecutable(c)) return c
  return null
}

const HEALTH_LABEL = {
  ok: 'tudo certo',
  warn: 'atenção',
  fail: 'não está funcionando',
}

function healthLabel(health) {
  return HEALTH_LABEL[health] ?? 'desconhecido'
}

/** Texto do ícone na bandeja: precisa dizer o essencial sem abrir a janela. */
function trayTooltip(status) {
  if (!status) return 'local-session — sem resposta'
  const hub = status.hub && status.hub.answering ? `hub no ar (:${status.hub.port})` : 'hub parado'
  return `local-session ${status.version.built} — ${hub}, ${healthLabel(status.health)}`
}

/** Quantos problemas a bandeja deve anunciar como contador. */
function problemCount(status) {
  if (!status || !Array.isArray(status.checks)) return 0
  return status.checks.filter(c => c.health !== 'ok').length
}

/**
 * O `.desktop` que o ambiente lê de `~/.config/autostart` no login. Fica na
 * home, e não em /etc/xdg/autostart: ligar a bandeja para todo usuário da
 * máquina seria decidir por quem não pediu. `--tray` faz o app subir só como
 * ícone, sem abrir janela na cara de quem acabou de logar.
 */
function autostartEntry(execPath) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=local-session',
    'Comment=Bandeja do local-session',
    `Exec=${execPath} --tray`,
    'Icon=local-session',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

module.exports = {
  autostartEntry,
  ACTIONS,
  actionIds,
  actionLabel,
  resolveAction,
  resolveBinary,
  healthLabel,
  trayTooltip,
  problemCount,
}

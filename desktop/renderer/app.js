'use strict'

const el = id => document.getElementById(id)
const bolha = el('bolha')
const resumoTexto = el('resumo-texto')
const versao = el('versao')
const lista = el('lista')
const links = el('links')
const saida = el('saida')
const autostart = el('autostart')

const RESUMO = {
  ok: 'tudo certo',
  warn: 'atenção em alguns pontos',
  fail: 'não está funcionando',
}

const MARCA = { ok: '✓', warn: '▸', fail: '✗' }

function mostrar(id, visivel) {
  el(id).hidden = !visivel
}

function render(status) {
  if (!status) {
    resumoTexto.textContent = 'sem resposta do executável'
    bolha.dataset.health = 'fail'
    return
  }

  versao.textContent = status.version.built
  bolha.dataset.health = status.health
  resumoTexto.textContent = RESUMO[status.health] || ''

  const hub = status.hub
  mostrar('hub-box', true)
  el('hub-detalhe').textContent = hub.answering
    ? `no ar na porta ${hub.port}${hub.pid ? ` (pid ${hub.pid})` : ''}` +
      (hub.managedByService ? ', pelo serviço do systemd' : ', fora do serviço do systemd')
    : 'parado — a página não abre enquanto ele não subir'

  links.replaceChildren()
  const temLink = Boolean(status.links.lan || status.links.tailscale)
  mostrar('acesso', temLink)
  for (const [rotulo, url] of [
    ['tailnet', status.links.tailscale],
    ['rede local', status.links.lan],
  ]) {
    if (!url) continue
    const li = document.createElement('li')
    const nome = document.createElement('span')
    nome.className = 'rotulo'
    nome.textContent = rotulo
    const abrir = document.createElement('button')
    abrir.type = 'button'
    abrir.textContent = 'abrir'
    abrir.addEventListener('click', () => window.ls.abrirLink(url))
    const copiar = document.createElement('button')
    copiar.type = 'button'
    copiar.className = 'discreto'
    copiar.textContent = 'copiar'
    copiar.addEventListener('click', () => window.ls.copiar(url))
    li.append(nome, abrir, copiar)
    links.append(li)
  }

  lista.replaceChildren()
  mostrar('checagens', status.checks.length > 0)
  for (const c of status.checks) {
    const li = document.createElement('li')
    li.dataset.health = c.health

    const marca = document.createElement('span')
    marca.className = 'marca'
    marca.textContent = MARCA[c.health] || '·'
    marca.setAttribute('aria-hidden', 'true')

    const corpo = document.createElement('div')
    const titulo = document.createElement('p')
    titulo.className = 'titulo'
    titulo.textContent = c.title
    const detalhe = document.createElement('p')
    detalhe.className = 'detalhe'
    detalhe.textContent = c.detail
    corpo.append(titulo, detalhe)

    if (c.fix) {
      const fix = document.createElement('code')
      fix.textContent = c.fix
      corpo.append(fix)
    }

    li.append(marca, corpo)
    lista.append(li)
  }
}

async function carregar() {
  const bin = await window.ls.bin()
  mostrar('sem-binario', !bin)
  mostrar('acoes', Boolean(bin))
  if (!bin) {
    resumoTexto.textContent = 'executável não encontrado'
    bolha.dataset.health = 'fail'
    return
  }
  autostart.checked = await window.ls.autostart()
  render(await window.ls.status())
}

// Trabalho que pede senha ou reinicia serviço leva segundos: sem desabilitar,
// dois cliques viram duas execuções concorrentes do mesmo comando.
let ocupado = false
async function executar(id, botao) {
  if (ocupado) return
  ocupado = true
  const antes = botao.textContent
  botao.textContent = 'trabalhando…'
  for (const b of document.querySelectorAll('button')) b.disabled = true

  const r = await window.ls.acao(id)
  saida.hidden = r.saida === ''
  saida.textContent = r.saida
  botao.textContent = antes
  for (const b of document.querySelectorAll('button')) b.disabled = false
  ocupado = false
  await carregar()
}

document.addEventListener('click', ev => {
  const botao = ev.target.closest('button[data-acao]')
  if (botao) executar(botao.dataset.acao, botao)
})

autostart.addEventListener('change', async () => {
  autostart.checked = await window.ls.autostart(autostart.checked)
})

el('recarregar').addEventListener('click', carregar)
window.ls.aoAtualizar(({ status }) => render(status))
carregar()

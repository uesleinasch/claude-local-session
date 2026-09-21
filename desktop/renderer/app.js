'use strict'

const el = id => document.getElementById(id)
const abas = [...document.querySelectorAll('[data-secao]')]
const paineis = [...document.querySelectorAll('[data-painel]')]

const RESUMO = {
  ok: { titulo: 'tudo funcionando', texto: 'nada precisa da sua atenção agora.' },
  warn: { titulo: 'funciona, com ressalvas', texto: 'o que está pendente não impede de usar.' },
  fail: { titulo: 'não está funcionando', texto: 'resolva o que está em vermelho para usar.' },
}

const MARCA = { ok: '✓', warn: '▸', fail: '✗' }

let estado = null
let linkEscolhido = 'tailscale'

function trocarSecao(secao) {
  for (const aba of abas) aba.setAttribute('aria-selected', String(aba.dataset.secao === secao))
  for (const p of paineis) p.hidden = p.dataset.painel !== secao
}

function itemCheck(c) {
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
  return li
}

function renderChecks(status) {
  for (const secao of ['geral', 'acesso', 'servico', 'canal']) {
    const alvo = el(`checks-${secao}`)
    if (!alvo) continue
    alvo.replaceChildren(...status.checks.filter(c => c.section === secao).map(itemCheck))
  }

  // O contador na aba é o que faz o problema ser encontrado sem procurar.
  for (const [secao, id] of [['dependencias', 'conta-dependencias'], ['canal', 'conta-canal']]) {
    const n =
      secao === 'dependencias'
        ? status.dependencies.filter(d => !d.present).length
        : status.checks.filter(c => c.section === secao && c.health !== 'ok').length
    const chip = el(id)
    chip.hidden = n === 0
    chip.textContent = String(n)
  }
}

/* Serial position: o que precisa de ação vai no topo da primeira seção. */
function renderPendencias(status) {
  const alvo = el('pendencias')
  alvo.replaceChildren()

  const problemas = status.checks.filter(c => c.health !== 'ok')
  const faltando = status.dependencies.filter(d => !d.present && d.required)
  if (problemas.length === 0 && faltando.length === 0) return

  for (const p of [...faltando.map(d => ({ titulo: d.title, detalhe: d.detail, ir: 'dependencias' })),
                   ...problemas.map(c => ({ titulo: c.title, detalhe: c.detail, ir: c.section }))]) {
    const linha = document.createElement('button')
    linha.type = 'button'
    linha.className = 'pendencia'
    linha.addEventListener('click', () => trocarSecao(p.ir))
    const t = document.createElement('span')
    t.className = 'titulo'
    t.textContent = p.titulo
    const d = document.createElement('span')
    d.className = 'detalhe'
    d.textContent = p.detalhe
    const seta = document.createElement('span')
    seta.className = 'seta'
    seta.textContent = '→'
    seta.setAttribute('aria-hidden', 'true')
    linha.append(t, d, seta)
    alvo.append(linha)
  }
}

function renderDeps(status) {
  const alvo = el('deps')
  alvo.replaceChildren()

  for (const d of status.dependencies) {
    const li = document.createElement('li')
    li.dataset.present = String(d.present)

    const marca = document.createElement('span')
    marca.className = 'marca'
    marca.textContent = d.present ? '✓' : d.required ? '✗' : '▸'
    marca.setAttribute('aria-hidden', 'true')

    const corpo = document.createElement('div')
    const titulo = document.createElement('p')
    titulo.className = 'titulo'
    titulo.textContent = d.title
    const detalhe = document.createElement('p')
    detalhe.className = 'detalhe'
    detalhe.textContent = d.detail
    corpo.append(titulo, detalhe)

    li.append(marca, corpo)

    if (!d.present && d.aptPackage) {
      const botao = document.createElement('button')
      botao.type = 'button'
      botao.className = 'primario'
      botao.dataset.instalar = d.aptPackage
      botao.textContent = 'instalar'
      li.append(botao)
    } else if (!d.present && d.url) {
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'discreto'
      link.dataset.externo = d.url
      link.textContent = 'como instalar'
      li.append(link)
    }

    alvo.append(li)
  }

  const instalaveis = status.dependencies.filter(d => !d.present && d.aptPackage)
  const caixa = el('instalar-tudo')
  caixa.hidden = instalaveis.length < 2
  if (!caixa.hidden) {
    const btn = el('btn-instalar-tudo')
    btn.textContent = `instalar ${instalaveis.length} pacotes`
    btn.dataset.instalar = instalaveis.map(d => d.aptPackage).join(',')
  }
}

async function renderAcesso(status) {
  const links = status.links
  const temTailnet = Boolean(links.tailscale)
  el('qr-escolha').hidden = !temTailnet || !links.lan
  if (!temTailnet) linkEscolhido = 'lan'

  for (const b of document.querySelectorAll('[data-link]')) {
    b.setAttribute('aria-pressed', String(b.dataset.link === linkEscolhido))
  }

  const alvo = links[linkEscolhido] || links.tailscale || links.lan || null
  el('qr-sem-link').hidden = Boolean(alvo)

  const lista = el('links')
  lista.replaceChildren()
  for (const [rotulo, url] of [
    ['tailnet', links.tailscale],
    ['rede local', links.lan],
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
    lista.append(li)
  }

  const img = el('qr')
  const ausente = el('qr-ausente')
  const temQrencode = status.dependencies.some(d => d.id === 'qrencode' && d.present)

  const falhou = el('qr-falhou')
  img.hidden = true
  ausente.hidden = true
  falhou.hidden = true
  if (!alvo) return

  if (!temQrencode) {
    ausente.hidden = false
    return
  }

  const dataUri = await window.ls.qr(alvo)
  if (dataUri) {
    img.src = dataUri
    img.hidden = false
  } else {
    // Com o qrencode instalado e ainda assim sem imagem, dizer "instale o
    // qrencode" seria mentir e mandar a pessoa para o lugar errado.
    falhou.hidden = false
  }

}

function render(status) {
  estado = status
  if (!status) {
    el('resumo-titulo').textContent = 'sem resposta do executável'
    el('bolha').dataset.health = 'fail'
    return
  }

  el('versao').textContent = status.version.built
  el('bolha').dataset.health = status.health
  el('resumo-titulo').textContent = RESUMO[status.health].titulo
  el('resumo-texto').textContent = RESUMO[status.health].texto

  const hub = status.hub
  el('hub-detalhe').textContent = hub.answering
    ? `no ar na porta ${hub.port}${hub.pid ? ` (pid ${hub.pid})` : ''}` +
      (hub.managedByService ? ', pelo serviço do systemd' : ', fora do serviço do systemd')
    : 'parado — a página não abre enquanto ele não subir'

  renderPendencias(status)
  renderChecks(status)
  renderDeps(status)
  void renderAcesso(status)
}

async function carregar() {
  const bin = await window.ls.bin()
  el('sem-binario').hidden = Boolean(bin)
  for (const p of paineis) if (!bin) p.hidden = true
  if (!bin) {
    el('bolha').dataset.health = 'fail'
    return
  }
  el('autostart').checked = await window.ls.autostart()
  render(await window.ls.status())
}

// Trabalho que pede senha ou reinicia serviço leva segundos: sem travar, dois
// cliques viram duas execuções concorrentes do mesmo comando.
let ocupado = false
async function comOcupado(botao, texto, tarefa) {
  if (ocupado) return
  ocupado = true
  const antes = botao.textContent
  botao.textContent = texto
  for (const b of document.querySelectorAll('button')) b.disabled = true

  const r = await tarefa()
  const saida = el('saida')
  saida.hidden = !r || !r.saida
  if (r && r.saida) saida.textContent = r.saida

  botao.textContent = antes
  for (const b of document.querySelectorAll('button')) b.disabled = false
  ocupado = false
  await carregar()
}

document.addEventListener('click', ev => {
  const aba = ev.target.closest('[data-secao]')
  if (aba) return trocarSecao(aba.dataset.secao)

  const link = ev.target.closest('[data-link]')
  if (link) {
    linkEscolhido = link.dataset.link
    if (estado) void renderAcesso(estado)
    return
  }

  const externo = ev.target.closest('[data-externo]')
  if (externo) return window.ls.copiar(externo.dataset.externo)

  const instalar = ev.target.closest('[data-instalar]')
  if (instalar) {
    const pacotes = instalar.dataset.instalar.split(',')
    return comOcupado(instalar, 'instalando…', () => window.ls.instalar(pacotes))
  }

  const acao = ev.target.closest('[data-acao]')
  if (acao) return comOcupado(acao, 'trabalhando…', () => window.ls.acao(acao.dataset.acao))
})

el('autostart').addEventListener('change', async ev => {
  ev.target.checked = await window.ls.autostart(ev.target.checked)
})

el('recarregar').addEventListener('click', carregar)
window.ls.aoAtualizar(({ status }) => render(status))
carregar()

'use strict'
const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, clipboard } = require('electron')
const { execFile } = require('node:child_process')
const { accessSync, constants, mkdirSync, rmSync, writeFileSync, existsSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')
const {
  resolveAction,
  resolveBinary,
  trayTooltip,
  problemCount,
  autostartEntry,
  aptInstallCommand,
} = require('./core.js')

const ICON = join(__dirname, 'icon.png')

function executavel(p) {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// Mesma ordem do shim bin/local-session. O app é casca: sem o binário ele não
// tem o que mostrar, e é melhor dizer isso do que exibir uma tela vazia.
function executavelNoPath(nome) {
  const dirs = (process.env.PATH || '').split(':').filter(Boolean)
  return dirs.some(d => executavel(join(d, nome)))
}

function acharBinario() {
  return resolveBinary(
    [
      process.env.LOCAL_SESSION_BIN,
      join(__dirname, '..', 'dist', 'local-session'),
      '/usr/bin/local-session',
      '/usr/local/bin/local-session',
    ],
    executavel,
  )
}

const BIN = acharBinario()

function rodar(bin, args, timeout = 60_000) {
  return new Promise(resolve => {
    execFile(bin, args, { timeout, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ ok: !err, saida: `${stdout || ''}${stderr || ''}`.trim() })
    })
  })
}

async function lerStatus() {
  if (!BIN) return null
  const { ok, saida } = await rodar(BIN, ['status', '--json'], 15_000)
  // `status` sai com 1 quando há falha — é diagnóstico, não erro de execução,
  // e o JSON vem do mesmo jeito.
  try {
    return JSON.parse(saida)
  } catch {
    return ok ? null : null
  }
}

let janela = null
let tray = null
let ultimoStatus = null

function abrirJanela() {
  if (janela) {
    if (janela.isMinimized()) janela.restore()
    janela.show()
    janela.focus()
    return
  }

  janela = new BrowserWindow({
    width: 760,
    height: 700,
    minWidth: 420,
    minHeight: 480,
    title: 'local-session',
    icon: ICON,
    backgroundColor: '#0e0f11',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      // A janela não executa nada por conta própria: tudo passa pela allowlist
      // do preload, no processo principal.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  janela.loadFile(join(__dirname, 'renderer', 'index.html'))
  janela.on('closed', () => {
    janela = null
  })
}

function atualizarTray() {
  if (!tray) return
  tray.setToolTip(trayTooltip(ultimoStatus))
  const problemas = problemCount(ultimoStatus)
  const noAr = ultimoStatus && ultimoStatus.hub && ultimoStatus.hub.answering

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: problemas === 0 ? 'tudo certo' : `${problemas} ponto(s) de atenção`,
        enabled: false,
      },
      { type: 'separator' },
      { label: 'abrir configuração', click: abrirJanela },
      {
        label: 'abrir a página no navegador',
        enabled: Boolean(ultimoStatus && ultimoStatus.links && ultimoStatus.links.lan),
        click: () => {
          const l = ultimoStatus.links.tailscale || ultimoStatus.links.lan
          if (l) shell.openExternal(l)
        },
      },
      {
        label: 'copiar o link com token',
        enabled: Boolean(ultimoStatus && ultimoStatus.links && ultimoStatus.links.lan),
        click: () => {
          const l = ultimoStatus.links.tailscale || ultimoStatus.links.lan
          if (l) clipboard.writeText(l)
        },
      },
      { type: 'separator' },
      {
        label: noAr ? 'reiniciar o hub' : 'ligar o hub',
        click: async () => {
          await executarAcao(noAr ? 'hub-restart' : 'hub-start')
          await recarregar()
        },
      },
      { type: 'separator' },
      { label: 'sair', click: () => app.quit() },
    ]),
  )
}

async function recarregar() {
  ultimoStatus = await lerStatus()
  atualizarTray()
  if (janela) janela.webContents.send('status', { status: ultimoStatus, bin: BIN })
  return ultimoStatus
}

async function executarAcao(id) {
  const acao = resolveAction(id, BIN)
  if (!acao) return { ok: false, saida: 'ação desconhecida' }
  return rodar(acao.bin, acao.args)
}

ipcMain.handle('status', () => recarregar())
ipcMain.handle('bin', () => BIN)
ipcMain.handle('acao', async (_ev, id) => {
  const r = await executarAcao(id)
  await recarregar()
  return r
})
ipcMain.handle('abrir-link', (_ev, url) => {
  // Só o que o próprio hub montou: o renderer não escolhe endereço.
  if (linksConhecidos().includes(url)) shell.openExternal(url)
})
const AUTOSTART = join(homedir(), '.config', 'autostart', 'local-session-ui.desktop')

ipcMain.handle('autostart', (_ev, ligar) => {
  try {
    if (ligar === undefined) return existsSync(AUTOSTART)
    if (ligar) {
      mkdirSync(join(homedir(), '.config', 'autostart'), { recursive: true })
      // process.execPath é o próprio Electron empacotado — o mesmo caminho que
      // o lançador do menu usa.
      writeFileSync(AUTOSTART, autostartEntry(process.execPath))
    } else {
      rmSync(AUTOSTART, { force: true })
    }
    return existsSync(AUTOSTART)
  } catch {
    return existsSync(AUTOSTART)
  }
})

function linksConhecidos() {
  return [ultimoStatus?.links?.lan, ultimoStatus?.links?.tailscale].filter(Boolean)
}

ipcMain.handle('instalar', async (_ev, pacotes) => {
  const cmd = aptInstallCommand(Array.isArray(pacotes) ? pacotes : [])
  if (!cmd) return { ok: false, saida: 'nenhum pacote válido para instalar' }
  const r = await rodar(cmd.bin, cmd.args, 300_000)
  await recarregar()
  return r
})

/**
 * PNG em data: URI, não SVG por innerHTML — o CSP já libera `img-src data:` e
 * nada de marcação vinda de fora entra no DOM. Só as URLs que o próprio hub
 * montou viram QR: o renderer não escolhe o que codificar.
 */
ipcMain.handle('qr', async (_ev, url) => {
  if (!linksConhecidos().includes(url)) return null
  if (!executavelNoPath('qrencode')) return null
  return new Promise(resolve => {
    execFile(
      'qrencode',
      ['-o', '-', '-t', 'PNG', '-s', '6', '-m', '2', '--', url],
      { encoding: 'buffer', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || stdout.length === 0) return resolve(null)
        resolve(`data:image/png;base64,${stdout.toString('base64')}`)
      },
    )
  })
})

ipcMain.handle('copiar', (_ev, texto) => {
  if (typeof texto === 'string') clipboard.writeText(texto)
})

// Segunda invocação traz a janela da primeira em vez de abrir outro ícone.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', abrirJanela)

  app.whenReady().then(async () => {
    const img = nativeImage.createFromPath(ICON)
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
    tray.on('click', abrirJanela)

    await recarregar()
    if (!process.argv.includes('--tray')) abrirJanela()

    // O estado muda por fora (o hub cai, alguém roda o setup no terminal):
    // sem isto a bandeja mentiria até alguém clicar.
    setInterval(recarregar, 30_000)
  })

  // Fechar a janela deixa o ícone na bandeja — é o ponto de um app de bandeja.
  app.on('window-all-closed', () => {})
}

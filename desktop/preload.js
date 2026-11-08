'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// A ponte expõe verbos, nunca um executor: o renderer manda um id de ação que
// o processo principal valida contra a allowlist de core.js. Se um dia a
// janela carregar conteúdo de fora, o pior que ela consegue é pedir uma das
// ações já previstas.
contextBridge.exposeInMainWorld('ls', {
  status: () => ipcRenderer.invoke('status'),
  bin: () => ipcRenderer.invoke('bin'),
  appAndroid: () => ipcRenderer.invoke('app-android'),
  acao: id => ipcRenderer.invoke('acao', id),
  abrirLink: url => ipcRenderer.invoke('abrir-link', url),
  copiar: texto => ipcRenderer.invoke('copiar', texto),
  autostart: ligar => ipcRenderer.invoke('autostart', ligar),
  instalar: pacotes => ipcRenderer.invoke('instalar', pacotes),
  qr: url => ipcRenderer.invoke('qr', url),
  aoAtualizar: cb => ipcRenderer.on('status', (_ev, payload) => cb(payload)),
})

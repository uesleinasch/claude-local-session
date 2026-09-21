import { join } from 'node:path'

export const PACKAGE_NAME = 'local-session'
export const BIN_PATH = join('usr', 'bin', PACKAGE_NAME)
export const SHARE_DIR = join('usr', 'share', PACKAGE_NAME)
export const UNIT_PATH = join('usr', 'lib', 'systemd', 'user', 'local-session-hub.service')

/**
 * O que vai para `/usr/share` e, por tabela, vira cópia em
 * `~/.claude/plugins/cache` de cada usuário — `claude plugin install` a partir
 * de um caminho **copia** a árvore. Por isso nem `src/` nem `web/` entram: os
 * dois vivem dentro do binário, e uma segunda cópia deles seria outra fonte de
 * verdade além de peso por usuário.
 */
export const SHARE_DIRS = ['commands', 'bin', '.claude-plugin'] as const

/**
 * De `hooks/` vai só o manifesto: os `.ts` ao lado dele importam `../src`, que
 * não existe no pacote, e desde o executável único quem o `hooks.json` chama é
 * o shim. Levá-los seria entregar código morto que não roda se alguém tentar.
 */
export const SHARE_FILES = [join('hooks', 'hooks.json')] as const

/** A interface: runtime do Electron e o app, fora do PATH. */
export const UI_DIR = join('usr', 'lib', 'local-session-ui')
export const UI_BIN = join('usr', 'bin', 'local-session-ui')
export const UI_EXEC = 'local-session-ui'
export const DESKTOP_ENTRY = join('usr', 'share', 'applications', 'local-session.desktop')
export const ICON_PATH = join(
  'usr',
  'share',
  'icons',
  'hicolor',
  '256x256',
  'apps',
  'local-session.png',
)

/**
 * O Electron não está em nenhum repositório do Debian/Ubuntu (verificado em
 * 2026-09-21), então viaja dentro do pacote — não dá para declarar `Depends`.
 * As bibliotecas que ele carrega, sim: sem elas o app falha ao abrir numa
 * máquina limpa, e o erro é um símbolo faltando, não uma mensagem útil.
 */
const ELECTRON_DEPS = [
  'libgtk-3-0 | libgtk-3-0t64',
  'libnotify4',
  'libnss3',
  'libxss1',
  'libxtst6',
  'libatspi2.0-0 | libatspi2.0-0t64',
  'libsecret-1-0',
  'libasound2 | libasound2t64',
  'xdg-utils',
]

export type Control = {
  version: string
  architecture: string
  maintainer: string
  description: string
}

export function controlFile(c: Control): string {
  return [
    `Package: ${PACKAGE_NAME}`,
    `Version: ${c.version}`,
    `Architecture: ${c.architecture}`,
    `Maintainer: ${c.maintainer}`,
    // tmux é o que hoje se descobre com Bun.which em runtime, e cuja ausência
    // só apaga botões da página sem dizer por quê.
    `Depends: ${['tmux', ...ELECTRON_DEPS].join(', ')}`,
    'Recommends: git',
    'Section: utils',
    'Priority: optional',
    'Homepage: https://github.com/uesleinasch/claude-local-session',
    `Description: ${c.description}`,
    ' Expõe cada sessão do Claude Code numa página web da rede local.',
    ' Traz junto a interface de configuração: procure "local-session" no menu.',
    ' O plugin ainda precisa ser registrado por usuário: rode `local-session setup`.',
    '',
  ].join('\n')
}

/**
 * O merge do managed-settings preserva allowlist alheia e recusa arquivo
 * corrompido; reescrever isso em shell perderia o cuidado. Por isso o script
 * chama o próprio binário, que já é root aqui.
 */
export function postinstScript(): string {
  return [
    '#!/bin/sh',
    'set -e',
    '',
    'if [ "$1" = "configure" ]; then',
    `  /${BIN_PATH} managed-settings --apply || true`,
    '  systemctl daemon-reload >/dev/null 2>&1 || true',
    '',
    '  echo ""',
    '  echo "local-session instalado. falta um passo, por usuário:"',
    '  echo ""',
    '  echo "    local-session setup"',
    '  echo ""',
    '  echo "ele registra o plugin no Claude Code, escreve o alias do canal e liga o serviço."',
    '  echo ""',
    'fi',
    '',
  ].join('\n')
}

export function postrmScript(): string {
  return [
    '#!/bin/sh',
    'set -e',
    '',
    // Só no purge: um upgrade passa por `remove` e tirar a entrada ali deixaria
    // a máquina sem canal entre a remoção e a instalação da versão nova.
    'if [ "$1" = "purge" ] && [ -x /' + BIN_PATH + ' ]; then',
    `  /${BIN_PATH} managed-settings --remove || true`,
    'fi',
    '',
    'systemctl daemon-reload >/dev/null 2>&1 || true',
    '',
  ].join('\n')
}

/** `dpkg-deb` recusa nome fora de `<pacote>_<versão>_<arquitetura>.deb`. */
export function debFileName(version: string, architecture: string): string {
  return `${PACKAGE_NAME}_${version}_${architecture}.deb`
}

/** `bun build --compile` produz binário por plataforma; o pacote diz qual é. */
export function debArchitecture(nodeArch: string): string | null {
  if (nodeArch === 'x64') return 'amd64'
  if (nodeArch === 'arm64') return 'arm64'
  return null
}

/**
 * O `.desktop` é o que faz o app aparecer no menu e no lançador. `StartupWMClass`
 * casa a janela com o ícone: sem ele o Electron aparece como entrada genérica
 * na barra de tarefas.
 */
export function desktopEntry(): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=local-session',
    'Comment=Configuração e diagnóstico das sessões do Claude Code na rede local',
    `Exec=/${UI_BIN} %U`,
    'Icon=local-session',
    'Terminal=false',
    // Uma categoria principal só: com duas, o app aparece duas vezes no menu
    // (o desktop-file-validate avisa).
    'Categories=Development;',
    'Keywords=claude;sessão;hub;rede local;',
    'StartupWMClass=local-session',
    '',
  ].join('\n')
}

/**
 * O Electron descobre o app por `resources/app` **ao lado do executável**, e o
 * nome do processo vira o do binário — daí renomeá-lo em vez de chamar o
 * `electron` original com um caminho.
 */
export function uiLauncher(): string {
  return ['#!/bin/sh', `exec /${UI_DIR}/${UI_EXEC} "$@"`, ''].join('\n')
}

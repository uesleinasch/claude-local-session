#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BIN_PATH,
  controlFile,
  debArchitecture,
  debFileName,
  DESKTOP_ENTRY,
  desktopEntry,
  ICON_PATH,
  postinstScript,
  postrmScript,
  SHARE_DIR,
  SHARE_DIRS,
  SHARE_FILES,
  UI_BIN,
  UI_DIR,
  UI_EXEC,
  uiLauncher,
  UNIT_PATH,
} from '../src/package-core'
import { systemdUnit } from '../src/setup-core'

const REPO = join(import.meta.dir, '..')
const OUT_DIR = join(REPO, 'dist')
const BINARIO = join(OUT_DIR, 'local-session')

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)
const miss = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

console.log('\nlocal-session package — .deb\n')

if (!Bun.which('dpkg-deb')) {
  miss('dpkg-deb não encontrado — sem ele não dá para montar o pacote')
  process.exit(1)
}

const arch = debArchitecture(process.arch)
if (arch === null) {
  miss(`não sei empacotar para ${process.arch} — o binário é por plataforma`)
  process.exit(1)
}

if (!existsSync(BINARIO)) {
  miss('dist/local-session não existe — rode `bun run build` antes')
  process.exit(1)
}

const plugin = JSON.parse(await Bun.file(join(REPO, '.claude-plugin/plugin.json')).text())
const version: string = plugin.version

const raiz = mkdtempSync(join(tmpdir(), 'ls-deb-'))

try {
  // 1. o binário, fora da árvore do plugin: ela é copiada por usuário.
  mkdirSync(join(raiz, dirname(BIN_PATH)), { recursive: true })
  cpSync(BINARIO, join(raiz, BIN_PATH))
  chmodSync(join(raiz, BIN_PATH), 0o755)

  // 2. a árvore leve do plugin.
  for (const dir of SHARE_DIRS) {
    if (!existsSync(join(REPO, dir))) continue
    cpSync(join(REPO, dir), join(raiz, SHARE_DIR, dir), { recursive: true })
  }
  for (const file of SHARE_FILES) {
    mkdirSync(join(raiz, SHARE_DIR, dirname(file)), { recursive: true })
    cpSync(join(REPO, file), join(raiz, SHARE_DIR, file))
  }
  chmodSync(join(raiz, SHARE_DIR, 'bin', 'local-session'), 0o755)

  // 3. a unit de usuário, instalada pelo sistema: cada usuário só dá enable.
  mkdirSync(join(raiz, dirname(UNIT_PATH)), { recursive: true })
  writeFileSync(join(raiz, UNIT_PATH), systemdUnit(`/${BIN_PATH}`, `/${SHARE_DIR}`, true))

  // 4. a interface: runtime do Electron renomeado + o app em resources/app.
  // O Electron procura `resources/app` ao lado do próprio executável, e o nome
  // do processo vira o do binário — por isso renomear em vez de chamar o
  // `electron` original com um caminho.
  const electronDist = join(REPO, 'desktop', 'node_modules', 'electron', 'dist')
  if (!existsSync(electronDist)) {
    miss('desktop/node_modules/electron/dist não existe — rode `bun run ui:install` antes')
    process.exit(1)
  }
  cpSync(electronDist, join(raiz, UI_DIR), { recursive: true })
  renameSync(join(raiz, UI_DIR, 'electron'), join(raiz, UI_DIR, UI_EXEC))
  chmodSync(join(raiz, UI_DIR, UI_EXEC), 0o755)

  const appDir = join(raiz, UI_DIR, 'resources', 'app')
  mkdirSync(appDir, { recursive: true })
  for (const item of ['main.js', 'preload.js', 'core.js', 'package.json', 'icon.png']) {
    cpSync(join(REPO, 'desktop', item), join(appDir, item))
  }
  cpSync(join(REPO, 'desktop', 'renderer'), join(appDir, 'renderer'), { recursive: true })

  mkdirSync(join(raiz, dirname(UI_BIN)), { recursive: true })
  writeFileSync(join(raiz, UI_BIN), uiLauncher())
  chmodSync(join(raiz, UI_BIN), 0o755)

  mkdirSync(join(raiz, dirname(DESKTOP_ENTRY)), { recursive: true })
  writeFileSync(join(raiz, DESKTOP_ENTRY), desktopEntry())

  mkdirSync(join(raiz, dirname(ICON_PATH)), { recursive: true })
  cpSync(join(REPO, 'desktop', 'icon.png'), join(raiz, ICON_PATH))

  // 5. os metadados do pacote.
  mkdirSync(join(raiz, 'DEBIAN'), { recursive: true })
  writeFileSync(
    join(raiz, 'DEBIAN', 'control'),
    controlFile({
      version,
      architecture: arch,
      maintainer: 'Ueslei Nascimento <uesleinasch@users.noreply.github.com>',
      description: 'Sessões do Claude Code numa página da rede local',
    }),
  )
  for (const [nome, conteudo] of [
    ['postinst', postinstScript()],
    ['postrm', postrmScript()],
  ] as const) {
    const caminho = join(raiz, 'DEBIAN', nome)
    writeFileSync(caminho, conteudo)
    chmodSync(caminho, 0o755)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const saida = join(OUT_DIR, debFileName(version, arch))
  execFileSync('dpkg-deb', ['--build', '--root-owner-group', raiz, saida], { stdio: 'inherit' })

  const mb = (Bun.file(saida).size / 1024 / 1024).toFixed(0)
  did(`${saida} · ${mb} MB`)
  ok('inclui a interface (Electron) — não há pacote electron nos repos para depender')
  ok(`instale com: sudo apt install ${saida}`)
  console.log('\n  depois da instalação, cada usuário roda uma vez: local-session setup\n')
} finally {
  rmSync(raiz, { recursive: true, force: true })
}

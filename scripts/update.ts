#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readConfig } from '../src/config'
import { DEFAULT_PORT } from '../src/protocol'
import { STALE_FILES, SYNC_DIRS, SYNC_FILES, pidsOnPort, versionDirs } from '../src/update-core'

const REPO = process.cwd()
const BINARIO_REPO = join(REPO, 'dist', 'local-session')
const HOME = homedir()
const DRY = process.argv.includes('--check')

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)
const miss = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function die(msg: string): never {
  miss(msg)
  process.exit(1)
}

const plugin = readJson<{ name?: string; version?: string }>(
  join(REPO, '.claude-plugin', 'plugin.json'),
)
const marketplace = readJson<{ name?: string }>(join(REPO, '.claude-plugin', 'marketplace.json'))

console.log(`\nlocal-session update — de ${REPO}\n`)

if (!plugin?.name || !plugin.version) {
  die('não achei .claude-plugin/plugin.json aqui — rode a partir da raiz do repositório')
}
if (!marketplace?.name) die('não achei .claude-plugin/marketplace.json aqui')

const cacheRoot = join(HOME, '.claude', 'plugins', 'cache', marketplace.name, plugin.name)
const dirs = versionDirs(cacheRoot)

if (dirs.length === 0) {
  die(`nenhuma instalação em ${cacheRoot} — instale o plugin uma vez antes de atualizar`)
}

const installed = readJson<{ version?: string }>(
  join(dirs.at(-1)!, '.claude-plugin', 'plugin.json'),
)
ok(`repo ${plugin.version} · cache ${installed?.version ?? '?'} · ${dirs.length} diretório(s)`)

// Espelha em todos os diretórios: uma sessão antiga respawna o hub do próprio
// root, e um diretório esquecido devolve o código velho no primeiro respawn.
if (DRY) {
  did(
    `espelharia ${SYNC_DIRS.join(', ')} + ${SYNC_FILES.length} arquivo(s) e apagaria ${STALE_FILES.join(', ')} em ${dirs.length} diretório(s)`,
  )
} else {
  const rsync = Bun.which('rsync')
  for (const dir of dirs) {
    for (const sub of SYNC_DIRS) {
      const from = join(REPO, sub)
      if (!existsSync(from)) continue
      if (rsync) execFileSync(rsync, ['-a', '--delete', `${from}/`, `${join(dir, sub)}/`])
      else execFileSync('cp', ['-a', `${from}/.`, join(dir, sub)])
    }
    for (const file of SYNC_FILES) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      copyFileSync(join(REPO, file), join(dir, file))
    }
    for (const file of STALE_FILES) rmSync(join(dir, file), { force: true })

    // Com o pacote instalado, `/usr/bin/local-session` entra no PATH e o shim
    // do cache passa a preferi-lo ao fonte — hooks e MCP rodariam o binário do
    // apt enquanto o hub vem do .ts recém-espelhado. O link devolve a
    // precedência ao build do repo, que é o primeiro lugar onde o shim olha;
    // sem repo no disco ele quebra e o shim cai no binário do sistema, que é o
    // comportamento certo para quem só instalou.
    const linkDist = join(dir, 'dist', 'local-session')
    rmSync(linkDist, { force: true })
    if (existsSync(BINARIO_REPO)) {
      mkdirSync(dirname(linkDist), { recursive: true })
      symlinkSync(BINARIO_REPO, linkDist)
    }
  }
  did(`código espelhado em ${dirs.length} diretório(s) do cache`)
  if (existsSync(BINARIO_REPO)) did('dist/local-session do repo tem precedência sobre o do apt')
  else if (Bun.which('local-session')) {
    miss('sem dist/local-session, os hooks usarão o binário do apt — rode `bun run build`')
  }
}

// Trocar o hub é matar quem tem a porta: o respawner da primeira sessão que
// falar com ele sobe outro no lugar, já com o código novo.
const port = readConfig()?.port ?? DEFAULT_PORT
let listing = ''
try {
  listing = execFileSync('ss', ['-tlnp'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  miss('ss indisponível — mate o hub à mão e ele volta com o código novo')
}
const pids = pidsOnPort(listing, port)

if (pids.length === 0) {
  ok(`nenhum hub na porta ${port} — o próximo a subir já pega o código novo`)
} else if (DRY) {
  did(`mataria o hub (pid ${pids.join(', ')}) na porta ${port}`)
} else {
  for (const pid of pids) {
    try {
      process.kill(pid)
    } catch {}
  }
  did(`hub encerrado (pid ${pids.join(', ')})`)

  let back: number[] = []
  for (let i = 0; i < 40 && back.length === 0; i++) {
    await Bun.sleep(250)
    try {
      const again = execFileSync('ss', ['-tlnp'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      back = pidsOnPort(again, port).filter(p => !pids.includes(p))
    } catch {}
  }
  if (back.length > 0) ok(`hub de pé de novo (pid ${back.join(', ')})`)
  else miss('o hub ainda não voltou — ele sobe sozinho na próxima sessão ou pelo serviço')
}

// A unit do systemd aponta para um diretório de versão que pode ter mudado.
const unitPath = join(HOME, '.config', 'systemd', 'user', 'local-session-hub.service')
if (existsSync(unitPath)) {
  const target = readFileSync(unitPath, 'utf8').match(/ExecStart=\S+ (\S+)\/src\/hub\.ts/)?.[1]
  if (target && !dirs.includes(target)) {
    miss(`a unit do systemd aponta para ${target}, que não está no cache — rode /local-session:service`)
  } else {
    ok('unit do systemd aponta para um diretório válido')
  }
}

console.log(
  DRY ? '\nrode sem --check para aplicar.\n' : '\npronto — recarregue a página se ela estiver aberta.\n',
)

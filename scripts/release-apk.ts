#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { jaPublicada, nomeDoApk, tagDaVersao, versaoDoPubspec } from '../src/release-core'

const REPO = join(import.meta.dir, '..')
const MOBILE = join(REPO, 'mobile')
const DRY = process.argv.includes('--check')
const SEM_BUILD = process.argv.includes('--sem-build')

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)
const miss = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`)

function die(msg: string): never {
  miss(msg)
  process.exit(1)
}

function saida(bin: string, args: string[], cwd = REPO): string {
  return execFileSync(bin, args, { cwd, encoding: 'utf8' }).trim()
}

/** O Flutter costuma ficar fora do PATH — mesma ordem do shim `bin/local-session`. */
function acharFlutter(): string {
  const doPath = Bun.which('flutter')
  if (doPath !== null) return doPath
  const noHome = join(homedir(), 'flutter', 'bin', 'flutter')
  if (existsSync(noHome)) return noHome
  return die('flutter não encontrado — nem no PATH nem em ~/flutter/bin')
}

console.log('\nlocal-session release do apk\n')

const versao = versaoDoPubspec(readFileSync(join(MOBILE, 'pubspec.yaml'), 'utf8'))
if (versao === null) die('mobile/pubspec.yaml sem versão semver na chave `version:`')

const tag = tagDaVersao(versao)
ok(`versão ${versao} · tag ${tag}`)

// Release tem de corresponder a um commit: APK de árvore suja é impossível de
// reproduzir depois.
if (saida('git', ['status', '--porcelain']) !== '') {
  die('há mudança não commitada — commite antes de publicar')
}

let publicadas: string[] = []
try {
  publicadas = saida('gh', ['release', 'list', '--json', 'tagName', '--jq', '.[].tagName'])
    .split('\n')
    .filter(t => t !== '')
} catch {
  die('gh não respondeu — confira `gh auth status`')
}

if (jaPublicada(tag, publicadas)) {
  die(`${tag} já existe — suba a versão em mobile/pubspec.yaml`)
}
ok(`${tag} ainda não publicada`)

const apkBruto = join(MOBILE, 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk')

if (DRY) {
  did(`compilaria o release e publicaria ${nomeDoApk(versao)} em ${tag}`)
  process.exit(0)
}

if (SEM_BUILD) {
  did('build pulado por --sem-build')
} else {
  const flutter = acharFlutter()
  did('compilando o release (alguns minutos)')
  try {
    execFileSync(flutter, ['build', 'apk', '--release'], {
      cwd: MOBILE,
      stdio: 'inherit',
      env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME ?? join(homedir(), 'Android', 'Sdk') },
    })
  } catch {
    die('o build falhou — a saída acima diz por quê')
  }
}

if (!existsSync(apkBruto)) die(`não achei o apk em ${apkBruto}`)

const apk = join(MOBILE, 'build', nomeDoApk(versao))
copyFileSync(apkBruto, apk)
const mb = (statSync(apk).size / 1024 / 1024).toFixed(1)
ok(`${nomeDoApk(versao)} · ${mb} MB`)

const notas = [
  `APK de uso pessoal, assinado com a chave de debug desta máquina.`,
  '',
  'Instalar: abra este arquivo no celular e confirme a instalação.',
  '',
  `Precisa de um hub na versão 0.12.1 ou mais nova — é a que expõe a rota`,
  '`/_endpoints`, por onde o app descobre o endereço sozinho. Baixar arquivos',
  'para Downloads exige o hub 0.13.0, que expõe a rota `/_download`.',
].join('\n')

// `--latest=false` não é detalhe: o README manda baixar o `.deb` de
// /releases/latest, e um release do app marcado como latest deixa esse comando
// sem nenhum `.deb` para achar.
try {
  execFileSync(
    'gh',
    [
      'release',
      'create',
      tag,
      '--title',
      `App ${versao}`,
      '--notes',
      notas,
      '--latest=false',
      apk,
    ],
    { cwd: REPO, stdio: 'inherit' },
  )
} catch {
  die('gh release create falhou — a saída acima diz por quê')
}

console.log(`\npronto — ${saida('gh', ['release', 'view', tag, '--json', 'url', '--jq', '.url'])}\n`)

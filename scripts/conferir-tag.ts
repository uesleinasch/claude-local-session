#!/usr/bin/env bun
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conferirTag, versaoDoPubspec } from '../src/release-core'

const REPO = join(import.meta.dir, '..')
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? ''

const lerJson = (rel: string): string => JSON.parse(readFileSync(join(REPO, rel), 'utf8')).version
const r = conferirTag(tag, {
  plugin: lerJson('.claude-plugin/plugin.json'),
  pacote: lerJson('package.json'),
  app: versaoDoPubspec(readFileSync(join(REPO, 'mobile', 'pubspec.yaml'), 'utf8')) ?? '',
})

if (!r.ok) {
  console.error(`  \x1b[31m✗\x1b[0m ${r.erro}`)
  process.exit(1)
}

const tipo = r.prerelease ? 'pre-release' : 'release'
console.log(`  \x1b[32m✓\x1b[0m ${tag} confere com o código — ${tipo} do ${r.alvo} ${r.versao}`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `alvo=${r.alvo}\nversao=${r.versao}\nprerelease=${r.prerelease}\n`)
}

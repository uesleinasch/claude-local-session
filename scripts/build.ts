#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..')
const OUT = join(REPO, 'dist', 'local-session')

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const did = (s: string) => console.log(`  \x1b[33m▸\x1b[0m ${s}`)

console.log('\nlocal-session build — executável único\n')

mkdirSync(join(REPO, 'dist'), { recursive: true })

const inicio = Date.now()
execFileSync(
  process.execPath,
  ['build', '--compile', join(REPO, 'src', 'cli.ts'), '--outfile', OUT],
  { cwd: REPO, stdio: 'inherit' },
)
did(`compilado em ${((Date.now() - inicio) / 1000).toFixed(1)}s`)

const mb = (statSync(OUT).size / 1024 / 1024).toFixed(0)
ok(`${OUT} · ${mb} MB`)

// O shim bin/local-session prefere este arquivo ao fonte: um binário velho aqui
// é a armadilha de "editei e não mudou" com outra cara.
console.log(`\n  recompile depois de mexer em src/, web/ ou hooks/ — o shim prefere o binário.\n`)

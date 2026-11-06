#!/usr/bin/env bun
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dir, '..')
const MODULOS = join(REPO, 'node_modules')
const FONTES = join(REPO, 'web', 'fonts')

function copiar(de: string, para: string): void {
  copyFileSync(de, para)
  console.log(`  ${para.slice(REPO.length + 1)}`)
}

export function main(): void {
  console.log('assets do design system:')
  mkdirSync(FONTES, { recursive: true })
  const inter = join(MODULOS, '@fontsource-variable', 'inter')
  copiar(join(inter, 'files', 'inter-latin-opsz-normal.woff2'), join(FONTES, 'inter-latin-opsz-normal.woff2'))
  copiar(join(inter, 'LICENSE'), join(FONTES, 'OFL.txt'))
}

if (import.meta.main) main()

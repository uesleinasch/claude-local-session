#!/usr/bin/env bun
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSprite, WEB_ICONS } from '../src/icons-core'

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

  const simbolos = join(MODULOS, '@material-symbols', 'svg-400', 'outlined')
  const paths = new Map<string, string>()
  for (const nome of WEB_ICONS) {
    const svg = readFileSync(join(simbolos, `${nome}.svg`), 'utf8')
    const d = svg.match(/\sd="([^"]+)"/)?.[1]
    if (d === undefined) throw new Error(`${nome}.svg sem path`)
    paths.set(nome, d)
  }
  writeFileSync(join(REPO, 'web', 'icons.svg'), buildSprite(paths))
  console.log(`  web/icons.svg (${paths.size} ícones)`)
}

if (import.meta.main) main()

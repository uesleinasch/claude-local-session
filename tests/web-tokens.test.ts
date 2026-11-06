import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(import.meta.dir, '..', 'web')
const ler = (arquivo: string) => readFileSync(join(WEB, arquivo), 'utf8')
const semComentario = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const ESQUEMA: Record<string, string> = {
  '--md-sys-color-primary': '#ffc77f',
  '--md-sys-color-on-primary': '#462b00',
  '--md-sys-color-primary-container': '#f5a524',
  '--md-sys-color-on-primary-container': '#462b00',
  '--md-sys-color-secondary': '#ecbf86',
  '--md-sys-color-on-secondary': '#462b00',
  '--md-sys-color-secondary-container': '#624315',
  '--md-sys-color-on-secondary-container': '#ffddb4',
  '--md-sys-color-tertiary': '#9ad9ff',
  '--md-sys-color-on-tertiary': '#003549',
  '--md-sys-color-tertiary-container': '#36c2ff',
  '--md-sys-color-on-tertiary-container': '#004d69',
  '--md-sys-color-error': '#ffb4ab',
  '--md-sys-color-on-error': '#690005',
  '--md-sys-color-error-container': '#93000a',
  '--md-sys-color-on-error-container': '#ffdad6',
  '--md-sys-color-surface': '#151311',
  '--md-sys-color-surface-container-lowest': '#100e0c',
  '--md-sys-color-surface-container-low': '#1e1b19',
  '--md-sys-color-surface-container': '#221f1d',
  '--md-sys-color-surface-container-high': '#2c2927',
  '--md-sys-color-surface-container-highest': '#373432',
  '--md-sys-color-surface-bright': '#3c3936',
  '--md-sys-color-on-surface': '#e8e1dd',
  '--md-sys-color-on-surface-variant': '#cec5bd',
  '--md-sys-color-outline': '#978f88',
  '--md-sys-color-outline-variant': '#4b4640',
  '--md-sys-color-inverse-surface': '#e8e1dd',
  '--md-sys-color-inverse-on-surface': '#33302d',
  '--md-sys-color-inverse-primary': '#835400',
  '--md-sys-color-scrim': '#000000',
  '--ls-color-success': '#85db5d',
  '--ls-color-on-success': '#103900',
  '--ls-color-success-container': '#1b5200',
  '--ls-color-on-success-container': '#a0f976',
}

describe('tokens do design system', () => {
  test('tokens.css declara o esquema aprovado', () => {
    const tokens = ler('tokens.css')
    for (const [nome, hex] of Object.entries(ESQUEMA)) {
      expect(tokens).toMatch(new RegExp(`${nome}:\\s*${hex};`, 'i'))
    }
  })

  test('style.css não tem cor literal — toda cor sai de tokens.css', () => {
    const corpos = [...semComentario(ler('style.css')).matchAll(/\{([^{}]*)\}/g)].map(m => m[1]!)
    const literais = corpos.flatMap(corpo => corpo.match(/#[0-9a-f]{3,8}\b/gi) ?? [])
    expect(literais).toEqual([])
  })

  test('a página não carrega nada de fora — o celular pode estar sem internet', () => {
    for (const arquivo of ['index.html', 'style.css', 'tokens.css']) {
      expect(semComentario(ler(arquivo))).not.toMatch(/https?:\/\//)
    }
  })

  test('a fonte é Inter servida pelo próprio hub', () => {
    const tokens = ler('tokens.css')
    expect(tokens).toContain('@font-face')
    expect(tokens).toContain('url("/fonts/inter-latin-opsz-normal.woff2")')
    expect(tokens).toContain('font-display: swap')
    expect(ler('index.html')).toContain(
      '<link rel="preload" href="/fonts/inter-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin />',
    )
  })
})

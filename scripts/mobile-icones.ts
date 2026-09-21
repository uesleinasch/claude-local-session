import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dir, '..')
const RES = join(RAIZ, 'mobile', 'android', 'app', 'src', 'main', 'res')

/**
 * O legado sai do ícone do desktop para as duas interfaces não divergirem; só a
 * camada adaptativa tem arquivo próprio, porque ela precisa do recuo da máscara.
 */
const FONTE_LEGADO = join(RAIZ, 'desktop', 'icon.svg')
const FONTE_FRENTE = join(RAIZ, 'mobile', 'icone', 'frente.svg')

const LEGADO: Record<string, number> = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

const FRENTE: Record<string, number> = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
}

async function rasterizar(fonte: string, destino: string, lado: number): Promise<void> {
  const proc = Bun.spawn(
    [
      'inkscape',
      fonte,
      `--export-filename=${destino}`,
      `--export-width=${lado}`,
      `--export-height=${lado}`,
      '--export-type=png',
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  )
  const erro = await new Response(proc.stderr).text()
  if ((await proc.exited) !== 0) {
    throw new Error(`inkscape falhou em ${destino}: ${erro.trim()}`)
  }
}

export async function main(): Promise<void> {
  if (Bun.which('inkscape') === null) {
    process.stderr.write('inkscape não encontrado — instale com: sudo apt install inkscape\n')
    process.exit(1)
  }

  for (const [densidade, lado] of Object.entries(LEGADO)) {
    const pasta = join(RES, `mipmap-${densidade}`)
    mkdirSync(pasta, { recursive: true })
    await rasterizar(FONTE_LEGADO, join(pasta, 'ic_launcher.png'), lado)
    await rasterizar(FONTE_FRENTE, join(pasta, 'ic_launcher_foreground.png'), FRENTE[densidade]!)
    process.stdout.write(`  ✓ mipmap-${densidade} (${lado}px, frente ${FRENTE[densidade]}px)\n`)
  }

  process.stdout.write('\nícones gerados — rode `bun test tests/mobile-recursos.test.ts`\n')
}

if (import.meta.main) await main()

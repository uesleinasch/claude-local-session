import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RES = join(import.meta.dir, '..', 'mobile', 'android', 'app', 'src', 'main', 'res')

/** Densidades e o lado que cada uma exige, em px. */
const LEGADO = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FRENTE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

/** Largura e altura do IHDR, que são os bytes 16..24 de um PNG. */
function tamanhoPng(caminho: string): { largura: number; altura: number } {
  const bytes = readFileSync(caminho)
  return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) }
}

function texto(...partes: string[]): string {
  return readFileSync(join(RES, ...partes), 'utf8')
}

describe('ícone do app', () => {
  test('o ícone legado existe em toda densidade, no tamanho da densidade', () => {
    for (const [densidade, lado] of Object.entries(LEGADO)) {
      const caminho = join(RES, `mipmap-${densidade}`, 'ic_launcher.png')
      expect(existsSync(caminho)).toBe(true)
      expect(tamanhoPng(caminho)).toEqual({ largura: lado, altura: lado })
    }
  })

  /**
   * O adaptativo é 108dp com a máscara do sistema comendo a borda; gerar todas as
   * densidades no mesmo tamanho é o erro que aparece só como ícone serrilhado.
   */
  test('a camada da frente existe em toda densidade, em 108dp', () => {
    for (const [densidade, lado] of Object.entries(FRENTE)) {
      const caminho = join(RES, `mipmap-${densidade}`, 'ic_launcher_foreground.png')
      expect(existsSync(caminho)).toBe(true)
      expect(tamanhoPng(caminho)).toEqual({ largura: lado, altura: lado })
    }
  })

  test('o adaptativo aponta para recursos que existem', () => {
    const xml = texto('mipmap-anydpi-v26', 'ic_launcher.xml')
    expect(xml).toContain('<adaptive-icon')
    expect(xml).toContain('@color/ic_launcher_background')
    expect(xml).toContain('@mipmap/ic_launcher_foreground')
    expect(texto('values', 'ic_launcher_background.xml')).toContain('ic_launcher_background')
  })
})

describe('splash', () => {
  /**
   * `drawable-v21` tem precedência em todo aparelho moderno: corrigir só o
   * `drawable` deixaria a splash do template valendo na prática.
   */
  test('o fundo da splash é a cor da marca nas duas variantes', () => {
    for (const pasta of ['drawable', 'drawable-v21']) {
      const xml = texto(pasta, 'launch_background.xml')
      expect(xml).not.toContain('@android:color/white')
      expect(xml).not.toContain('?android:colorBackground')
      expect(xml).toContain('@color/fundo_splash')
    }
    expect(texto('values', 'cores.xml')).toContain('fundo_splash')
  })

  /**
   * No Android 12+ o sistema ignora o windowBackground e desenha a própria
   * splash. O qualificador `night` vence `version` na resolução de recursos,
   * então sem o par night-v31 o modo escuro cai no tema sem os atributos.
   */
  test('o Android 12+ recebe os atributos da splash, claro e escuro', () => {
    for (const pasta of ['values-v31', 'values-night-v31']) {
      const xml = texto(pasta, 'styles.xml')
      expect(xml).toContain('android:windowSplashScreenBackground')
      expect(xml).toContain('android:windowSplashScreenAnimatedIcon')
    }
    expect(existsSync(join(RES, 'drawable', 'splash_icone.xml'))).toBe(true)
  })
})

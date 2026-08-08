import { describe, expect, test } from 'bun:test'
import { MAX_UPLOAD_BYTES, sniffImage, uploadName } from '../src/upload'

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)))
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('sniffImage', () => {
  test('reconhece PNG pelos bytes, não pelo nome', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('png')
  })

  test('reconhece JPEG', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0))).toBe('jpg')
  })

  test('reconhece GIF', () => {
    expect(sniffImage(concat(ascii('GIF89a'), bytes(0, 0, 0, 0, 0, 0)))).toBe('gif')
  })

  test('reconhece WEBP, que é um RIFF com marca no meio', () => {
    expect(sniffImage(concat(ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WEBP'), bytes(0)))).toBe('webp')
  })

  test('RIFF que não é WEBP não passa — áudio wav tem o mesmo começo', () => {
    expect(sniffImage(concat(ascii('RIFF'), bytes(1, 2, 3, 4), ascii('WAVE'), bytes(0)))).toBeNull()
  })

  test('arquivo que não é imagem é recusado, mesmo com nome de foto', () => {
    expect(sniffImage(ascii('#!/bin/sh\nrm -rf /\n'))).toBeNull()
  })

  test('conteúdo curto demais não vira imagem', () => {
    expect(sniffImage(bytes(0x89, 0x50))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('uploadName', () => {
  test('monta nome previsível a partir da sessão e do instante', () => {
    expect(uploadName('sess-1', 'png', 1700000000000)).toBe('sess-1-1700000000000.png')
  })

  test('sessionId com caminho não escapa do diretório de uploads', () => {
    const name = uploadName('../../etc/passwd', 'png', 1)
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
  })

  test('sessionId estranho ainda produz nome utilizável', () => {
    expect(uploadName('', 'jpg', 7)).toBe('sessao-7.jpg')
  })
})

describe('limite', () => {
  test('o teto de upload cabe numa foto de celular sem virar canal de arquivo', () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(2_000_000)
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(16_000_000)
  })
})

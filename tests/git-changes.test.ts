import { describe, expect, test } from 'bun:test'
import { MAX_CHANGES, formatChanges } from '../src/git-changes'

describe('formatChanges', () => {
  test('árvore limpa diz que nada mudou, em vez de devolver vazio', () => {
    expect(formatChanges({ status: '', stat: '', diff: '' })).toBe('nada mudou desde o último commit')
  })

  test('lista os arquivos, o resumo e o diff, nessa ordem', () => {
    const out = formatChanges({
      status: ' M src/hub.ts\n?? novo.ts',
      stat: ' src/hub.ts | 4 ++--\n 1 file changed',
      diff: 'diff --git a/src/hub.ts b/src/hub.ts\n+const x = 1',
    })
    expect(out.indexOf('src/hub.ts')).toBeLessThan(out.indexOf('1 file changed'))
    expect(out.indexOf('1 file changed')).toBeLessThan(out.indexOf('diff --git'))
    expect(out).toContain('?? novo.ts')
  })

  test('arquivo novo sem diff ainda aparece — untracked não entra no git diff', () => {
    const out = formatChanges({ status: '?? foto.png', stat: '', diff: '' })
    expect(out).toContain('?? foto.png')
    expect(out).not.toBe('nada mudou desde o último commit')
  })

  test('diff gigante é cortado com aviso, não entregue inteiro no celular', () => {
    const out = formatChanges({ status: ' M a.ts', stat: '', diff: 'x'.repeat(MAX_CHANGES * 2) })
    expect(out.length).toBeLessThan(MAX_CHANGES + 500)
    expect(out).toContain('cortado')
  })

  test('seção sem conteúdo não vira cabeçalho órfão', () => {
    const out = formatChanges({ status: ' M a.ts', stat: '', diff: '' })
    expect(out).not.toContain('resumo')
  })
})

import { describe, expect, test } from 'bun:test'
import { TRUST_KEYS, isTrustPrompt, trustAccepted } from '../src/trust'

const withProjects = (projects: Record<string, unknown>) => ({ projects })

describe('trustAccepted', () => {
  test('aceita o diretório marcado como confiado', () => {
    const cfg = withProjects({ '/home/u/repos/app': { hasTrustDialogAccepted: true } })
    expect(trustAccepted(cfg, '/home/u/repos/app')).toBe(true)
  })

  test('recusa o diretório marcado como não confiado', () => {
    const cfg = withProjects({ '/home/u/repos/app': { hasTrustDialogAccepted: false } })
    expect(trustAccepted(cfg, '/home/u/repos/app')).toBe(false)
  })

  test('recusa diretório sem entrada nenhuma', () => {
    const cfg = withProjects({ '/home/u/repos/outro': { hasTrustDialogAccepted: true } })
    expect(trustAccepted(cfg, '/home/u/repos/app')).toBe(false)
  })

  test('barra final não muda a resposta', () => {
    const cfg = withProjects({ '/home/u/repos/app': { hasTrustDialogAccepted: true } })
    expect(trustAccepted(cfg, '/home/u/repos/app/')).toBe(true)
  })

  test('confiar no pai não confia no filho — o diálogo é por diretório', () => {
    const cfg = withProjects({ '/home/u/repos': { hasTrustDialogAccepted: true } })
    expect(trustAccepted(cfg, '/home/u/repos/app')).toBe(false)
  })

  test('config ilegível ou fora de forma não vira permissão', () => {
    expect(trustAccepted(null, '/home/u/repos/app')).toBe(false)
    expect(trustAccepted({}, '/home/u/repos/app')).toBe(false)
    expect(trustAccepted({ projects: 'nada' }, '/home/u/repos/app')).toBe(false)
    expect(trustAccepted(withProjects({ '/home/u/repos/app': null }), '/home/u/repos/app')).toBe(
      false,
    )
  })

  test('só o booleano true libera — string "true" não', () => {
    const cfg = withProjects({ '/home/u/repos/app': { hasTrustDialogAccepted: 'true' } })
    expect(trustAccepted(cfg, '/home/u/repos/app')).toBe(false)
  })
})

const TELA_TRUST = [
  ' Accessing workspace:',
  ' /home/u/repos/app',
  ' Quick safety check: Is this a project you created or one you trust? (Like your',
  " own code, a well-known open source project, or work from your team). If not,",
  " take a moment to review what's in this folder first.",
  ' Security guide',
  ' ❯ No, exit',
  '   Yes, I trust this folder',
  ' Enter to confirm · Esc to cancel',
].join('\n')

const TELA_PRONTA = [
  ' ▐▛███▛█   Claude Code v2.1.278',
  '  ▝▝ ▝▝    ~/repos/app',
  ' ▎ Channels (experimental) messages from plugin:local-session@unac inject',
  '❯ ',
  '  ⏵⏵ auto mode on (shift+tab to cycle)',
].join('\n')

describe('isTrustPrompt', () => {
  test('reconhece a tela do diálogo de confiança', () => {
    expect(isTrustPrompt(TELA_TRUST)).toBe(true)
  })

  test('não confunde a sessão já pronta com o diálogo', () => {
    expect(isTrustPrompt(TELA_PRONTA)).toBe(false)
  })

  test('tela vazia não é diálogo — o pane ainda está subindo', () => {
    expect(isTrustPrompt('')).toBe(false)
  })

  test('não basta a palavra trust solta no texto da sessão', () => {
    expect(isTrustPrompt('rodando testes de trust boundary no repo')).toBe(false)
  })
})

describe('TRUST_KEYS', () => {
  test('desce até "Yes, I trust this folder" e confirma', () => {
    expect(TRUST_KEYS).toEqual(['Down', 'Enter'])
  })
})

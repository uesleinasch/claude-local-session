import { describe, expect, test } from 'bun:test'
import {
  BIN_PATH,
  controlFile,
  debArchitecture,
  debFileName,
  postinstScript,
  desktopEntry,
  postrmScript,
  SHARE_DIRS,
  SHARE_FILES,
  UI_BIN,
  UI_DIR,
  UI_EXEC,
  uiLauncher,
} from '../src/package-core'

const CONTROL = {
  version: '0.11.0',
  architecture: 'amd64',
  maintainer: 'Ueslei Nascimento <ueslei@example.com>',
  description: 'Sessões do Claude Code na rede local',
}

describe('controlFile', () => {
  const control = controlFile(CONTROL)

  test('declara tmux como dependência em vez de descobri-lo em runtime', () => {
    expect(control).toContain('Depends: tmux')
  })

  test('traz os campos que o dpkg-deb exige', () => {
    for (const campo of ['Package:', 'Version:', 'Architecture:', 'Maintainer:', 'Description:']) {
      expect(control).toContain(campo)
    }
  })

  test('termina com linha em branco — dpkg-deb recusa control sem ela', () => {
    expect(control.endsWith('\n')).toBe(true)
  })

  test('as linhas de continuação da descrição começam com espaço', () => {
    const linhas = control.split('\n')
    const inicio = linhas.findIndex(l => l.startsWith('Description:'))
    const continuacao = linhas.slice(inicio + 1).filter(l => l !== '')
    for (const l of continuacao) expect(l.startsWith(' ')).toBe(true)
  })
})

describe('SHARE_DIRS', () => {
  test('não leva src/ nem web/ — os dois estão dentro do binário', () => {
    expect([...SHARE_DIRS] as string[]).not.toContain('src')
    expect([...SHARE_DIRS] as string[]).not.toContain('web')
  })

  test('leva o que o Claude Code precisa ler do plugin', () => {
    expect([...SHARE_DIRS]).toEqual(
      expect.arrayContaining(['commands', 'bin', '.claude-plugin']),
    )
  })

  test('de hooks/ vai só o manifesto — os .ts importam src/, que não é empacotado', () => {
    expect([...SHARE_DIRS] as string[]).not.toContain('hooks')
    expect([...SHARE_FILES]).toEqual(['hooks/hooks.json'])
  })
})

describe('postinst', () => {
  const script = postinstScript()

  test('aplica o managed-settings chamando o próprio binário', () => {
    expect(script).toContain(`/${BIN_PATH} managed-settings --apply`)
  })

  test('só age em configure', () => {
    expect(script).toContain('if [ "$1" = "configure" ]')
  })

  test('diz o passo que falta, porque o registro do plugin é por usuário', () => {
    expect(script).toContain('local-session setup')
  })

  test('falha do managed-settings não aborta a instalação do pacote', () => {
    expect(script).toContain('managed-settings --apply || true')
  })
})

describe('postrm', () => {
  const script = postrmScript()

  test('remove a entrada só no purge — upgrade passa por remove', () => {
    expect(script).toContain('if [ "$1" = "purge" ]')
    expect(script).toContain('managed-settings --remove')
  })

  test('não chama um binário que já saiu do disco', () => {
    expect(script).toContain(`[ -x /${BIN_PATH} ]`)
  })
})

describe('nome e arquitetura', () => {
  test('o nome do arquivo segue o formato que o dpkg-deb espera', () => {
    expect(debFileName('0.11.0', 'amd64')).toBe('local-session_0.11.0_amd64.deb')
  })

  test('traduz a arquitetura do runtime para a do Debian', () => {
    expect(debArchitecture('x64')).toBe('amd64')
    expect(debArchitecture('arm64')).toBe('arm64')
  })

  test('arquitetura que não sabemos empacotar não vira pacote errado', () => {
    expect(debArchitecture('riscv64')).toBeNull()
  })
})

describe('a interface vai dentro do pacote', () => {
  test('o Electron não é dependência: não existe pacote electron nos repos', () => {
    const control = controlFile(CONTROL)
    expect(control).not.toMatch(/Depends:.*\belectron\b/)
  })

  test('as bibliotecas que o Electron carrega, sim — senão o app nem abre', () => {
    const control = controlFile(CONTROL)
    for (const lib of ['libgtk-3-0', 'libnss3', 'libxtst6']) expect(control).toContain(lib)
  })

  test('o .desktop chama o launcher e casa a janela com o ícone', () => {
    const d = desktopEntry()
    expect(d).toContain(`Exec=/${UI_BIN}`)
    expect(d).toContain('StartupWMClass=')
    expect(d.startsWith('[Desktop Entry]')).toBe(true)
  })

  test('uma categoria principal só — com duas o app aparece repetido no menu', () => {
    const cat = desktopEntry()
      .split('\n')
      .find(l => l.startsWith('Categories='))!
    const principais = ['Development', 'Utility', 'Network', 'System', 'Settings'].filter(c =>
      cat.includes(c),
    )
    expect(principais).toHaveLength(1)
  })

  test('o launcher aponta para o Electron renomeado, não para `electron`', () => {
    expect(uiLauncher()).toContain(`/${UI_DIR}/${UI_EXEC}`)
    expect(uiLauncher()).not.toMatch(/\/electron["\s]/)
  })
})

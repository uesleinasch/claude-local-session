import { describe, expect, test } from 'bun:test'
import {
  aliasCommand,
  detectPluginIdentity,
  ensureAliasBlock,
  mergeManagedSettings,
  mergeUserPermissions,
  rcPathFor,
  replyToolName,
} from '../src/setup-core'

const ID = { plugin: 'local-session', marketplace: 'unac' }

describe('detectPluginIdentity', () => {
  test('extrai plugin e marketplace do caminho de instalação', () => {
    expect(detectPluginIdentity('/home/u/.claude/plugins/cache/unac/local-session/0.1.0')).toEqual(ID)
  })

  test('tolera barra final', () => {
    expect(detectPluginIdentity('/home/u/.claude/plugins/cache/unac/local-session/0.1.0/')).toEqual(ID)
  })

  test('devolve null fora do cache de plugins', () => {
    expect(detectPluginIdentity('/home/u/repos/claude-local-session')).toBeNull()
  })

  test('devolve null quando o caminho para no marketplace', () => {
    expect(detectPluginIdentity('/home/u/.claude/plugins/cache/unac')).toBeNull()
  })
})

describe('identificadores derivados', () => {
  test('o alias sobrepõe o próprio claude', () => {
    expect(aliasCommand(ID)).toBe("alias claude='claude --channels plugin:local-session@unac'")
  })

  test('o nome da tool segue o padrão do Claude Code', () => {
    expect(replyToolName(ID)).toBe('mcp__plugin_local-session_local-session__reply')
  })

  test('acompanha um marketplace renomeado', () => {
    const outro = { plugin: 'local-session', marketplace: 'outro' }
    expect(aliasCommand(outro)).toContain('plugin:local-session@outro')
  })
})

describe('rcPathFor', () => {
  test('zsh e bash têm rc próprio', () => {
    expect(rcPathFor('/usr/bin/zsh', '/home/u')).toBe('/home/u/.zshrc')
    expect(rcPathFor('/bin/bash', '/home/u')).toBe('/home/u/.bashrc')
  })

  test('shell desconhecido cai em .profile', () => {
    expect(rcPathFor('/usr/bin/fish', '/home/u')).toBe('/home/u/.profile')
    expect(rcPathFor('', '/home/u')).toBe('/home/u/.profile')
  })
})

describe('mergeManagedSettings', () => {
  test('cria do zero quando não há arquivo', () => {
    const { next, changed } = mergeManagedSettings(null, ID)
    expect(changed).toBe(true)
    expect(next).toEqual({ channelsEnabled: true, allowedChannelPlugins: [ID] })
  })

  test('não marca mudança quando já está correto', () => {
    const atual = { channelsEnabled: true, allowedChannelPlugins: [ID] }
    expect(mergeManagedSettings(atual, ID).changed).toBe(false)
  })

  test('preserva entradas de allowlist alheias', () => {
    const outro = { plugin: 'telegram', marketplace: 'claude-plugins-official' }
    const { next } = mergeManagedSettings(
      { channelsEnabled: true, allowedChannelPlugins: [outro] },
      ID,
    )
    expect(next.allowedChannelPlugins).toEqual([outro, ID])
  })

  test('preserva chaves desconhecidas do arquivo', () => {
    const { next } = mergeManagedSettings({ algumaPoliticaDaOrg: 'x' }, ID)
    expect(next.algumaPoliticaDaOrg).toBe('x')
  })

  test('liga channelsEnabled sem remover a allowlist existente', () => {
    const { next, changed } = mergeManagedSettings({ allowedChannelPlugins: [ID] }, ID)
    expect(changed).toBe(true)
    expect(next.channelsEnabled).toBe(true)
    expect(next.allowedChannelPlugins).toEqual([ID])
  })

  test('reexecução não duplica a entrada', () => {
    const um = mergeManagedSettings(null, ID).next
    const dois = mergeManagedSettings(um, ID).next
    expect(dois.allowedChannelPlugins).toHaveLength(1)
  })

  test('tolera lixo na allowlist sem lançar nem descartar', () => {
    const atual = { allowedChannelPlugins: [null, 'texto', ID] as never }
    const { next, changed } = mergeManagedSettings(atual, ID)
    expect(changed).toBe(true)
    expect(next.allowedChannelPlugins).toEqual([null, 'texto', ID] as never)
  })
})

describe('mergeUserPermissions', () => {
  const tool = replyToolName(ID)

  test('cria permissions.allow quando não existe', () => {
    const { next, changed } = mergeUserPermissions(null, tool)
    expect(changed).toBe(true)
    expect(next).toEqual({ permissions: { allow: [tool] } })
  })

  test('não duplica em reexecução', () => {
    const um = mergeUserPermissions(null, tool).next
    const dois = mergeUserPermissions(um, tool)
    expect(dois.changed).toBe(false)
    expect((dois.next.permissions as any).allow).toHaveLength(1)
  })

  test('preserva outras permissões e outras chaves', () => {
    const atual = {
      model: 'opus',
      permissions: { allow: ['Bash(ls:*)'], deny: ['Bash(rm:*)'] },
    }
    const { next } = mergeUserPermissions(atual, tool)
    expect(next.model).toBe('opus')
    expect((next.permissions as any).deny).toEqual(['Bash(rm:*)'])
    expect((next.permissions as any).allow).toEqual(['Bash(ls:*)', tool])
  })
})

describe('ensureAliasBlock', () => {
  const linha = aliasCommand(ID)

  test('acrescenta o bloco num rc vazio', () => {
    const { next, changed } = ensureAliasBlock('', linha)
    expect(changed).toBe(true)
    expect(next).toContain(linha)
    expect(next).toContain('# >>> local-session >>>')
  })

  test('preserva o conteúdo anterior do rc', () => {
    const { next } = ensureAliasBlock('export FOO=1\n', linha)
    expect(next.startsWith('export FOO=1\n')).toBe(true)
  })

  test('não quebra rc sem quebra de linha final', () => {
    const { next } = ensureAliasBlock('export FOO=1', linha)
    expect(next).toContain('export FOO=1\n')
    expect(next).toContain(linha)
  })

  test('reexecução não duplica o bloco', () => {
    const um = ensureAliasBlock('', linha).next
    const dois = ensureAliasBlock(um, linha)
    expect(dois.changed).toBe(false)
    expect(dois.next.match(/# >>> local-session >>>/g)).toHaveLength(1)
  })

  test('atualiza o bloco quando o marketplace muda', () => {
    const antigo = ensureAliasBlock('', aliasCommand({ ...ID, marketplace: 'antigo' })).next
    const { next, changed } = ensureAliasBlock(antigo, linha)
    expect(changed).toBe(true)
    expect(next).toContain('plugin:local-session@unac')
    expect(next).not.toContain('plugin:local-session@antigo')
    expect(next.match(/# >>> local-session >>>/g)).toHaveLength(1)
  })
})

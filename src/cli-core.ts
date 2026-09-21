import { dirname, join } from 'node:path'

/**
 * Cada ponto de entrada do plugin é um subcomando: `bun build --compile` aceita
 * um entrypoint só, e um executável por programa multiplicaria o runtime do Bun
 * (~90 MB) por quantos fossem.
 */
export const COMMANDS = [
  'hub',
  'mcp',
  'hook',
  'context-hook',
  'setup',
  'service',
  'managed-settings',
  'status',
] as const

export type Command = (typeof COMMANDS)[number]

const DESCRIPTIONS: Record<Command, string> = {
  hub: 'daemon HTTP/WebSocket que serve a página (um por máquina)',
  mcp: 'MCP server desta sessão, por stdio',
  hook: 'evento de hook do Claude Code, lido do stdin',
  'context-hook': 'payload do statusline, lido do stdin',
  setup: 'configura as camadas do canal nesta máquina',
  service: 'instala o hub como serviço de usuário do systemd',
  'managed-settings': 'habilita o canal em /etc (usado pelo postinst do pacote)',
  status: 'diagnóstico da instalação; --json para consumo por programa',
}

export function parseCommand(argv: readonly string[]): Command | null {
  const first = argv[0]
  if (first === undefined) return null
  return (COMMANDS as readonly string[]).includes(first) ? (first as Command) : null
}

export function usage(): string {
  const width = Math.max(...COMMANDS.map(c => c.length))
  return [
    'uso: local-session <comando> [opções]',
    '',
    ...COMMANDS.map(c => `  ${c.padEnd(width)}  ${DESCRIPTIONS[c]}`),
    '',
  ].join('\n')
}

/**
 * `Bun.main` dentro de um executável de `bun build --compile` aponta para o
 * sistema de arquivos virtual embutido. É o sinal de que não existe `src/*.ts`
 * em disco — nem para relançar o hub, nem para localizar o `web/`.
 */
export function isStandalone(main: string): boolean {
  return main.startsWith('/$bunfs/')
}

/**
 * Relançar o hub: dentro do binário o próprio executável é o programa e o
 * subcomando basta; fora dele é preciso o caminho do fonte.
 */
export function hubSpawnArgs(root: string, standalone: boolean): string[] {
  return standalone ? ['hub'] : [join(root, 'src', 'hub.ts')]
}

export type RootSources = {
  standalone: boolean
  /** `import.meta.dir` de um módulo em `src/`. */
  moduleDir: string
  /** `process.execPath` — dentro do binário, o próprio executável. */
  execPath: string
  /** `LOCAL_SESSION_ROOT`, quando definido. */
  env?: string | undefined
}

/**
 * Raiz do plugin — de onde saem `.claude-plugin/*.json`, e com eles a identidade
 * que habilita criar sessões. No binário `import.meta.dir` é o fs virtual e não
 * serve; sobra o diretório do executável (`<root>/dist/local-session`) ou, quando
 * o pacote instala o binário longe dos metadados, o env.
 */
export function pluginRoot(src: RootSources): string {
  if (src.env !== undefined && src.env !== '') return src.env
  if (src.standalone) return join(dirname(src.execPath), '..')
  return join(src.moduleDir, '..')
}

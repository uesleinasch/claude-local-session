import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { configDir } from './config'

export const TERM_COLS = { min: 20, max: 400, fallback: 80 }
export const TERM_ROWS = { min: 5, max: 200, fallback: 24 }
export const TERM_SEED_LINES = 400
export const MAX_TERM_INPUT = 4_000
const MAX_READER_RESTARTS = 3

/**
 * Teclas que o `tmux send-keys` entende. É allowlist porque o nome vai cru para
 * a linha de comando do tmux — qualquer string do navegador viraria argumento.
 */
export const TERM_KEYS = [
  'Enter',
  'Escape',
  'Tab',
  'BSpace',
  'Space',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'C-a',
  'C-c',
  'C-d',
  'C-e',
  'C-k',
  'C-l',
  'C-n',
  'C-p',
  'C-r',
  'C-u',
  'C-w',
  'C-z',
] as const

export function isTermKey(v: unknown): v is string {
  return typeof v === 'string' && (TERM_KEYS as readonly string[]).includes(v)
}

function clamp(v: unknown, range: { min: number; max: number; fallback: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return range.fallback
  return Math.min(range.max, Math.max(range.min, Math.trunc(v)))
}

export function clampCols(v: unknown): number {
  return clamp(v, TERM_COLS)
}

export function clampRows(v: unknown): number {
  return clamp(v, TERM_ROWS)
}

/**
 * Nome da sessão tmux de um diretório. O hash do caminho inteiro entra porque
 * duas pastas `web` de projetos diferentes colidiriam só pelo basename, e o
 * terminal de um apareceria como o do outro.
 */
export function terminalName(dir: string): string {
  const slug = basename(dir).replace(/[^\w-]/g, '_').slice(0, 24)
  const hash = createHash('sha256').update(dir).digest('hex').slice(0, 8)
  return `lst-${slug === '' ? 'dir' : slug}-${hash}`
}

/** Aspas simples para o shell que o `pipe-pane` abre. */
export function shellQuote(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`
}

export type TermSize = { cols: number; rows: number }
export type TermListener = { data(text: string): void; exit(reason: string): void }
export type AttachResult =
  | { ok: true; name: string; seed: string; cols: number; rows: number }
  | { ok: false; error: string }

type LiveTerm = {
  name: string
  dir: string
  /** `%12` — id do pane, o único alvo que `send-keys` e `pipe-pane` aceitam. */
  pane: string
  fifo: string
  size: TermSize
  reader: ChildProcess | null
  restarts: number
  decoder: TextDecoder
  listeners: Set<TermListener>
}

/**
 * Terminais tmux por diretório. O tmux é quem emula o terminal e guarda a tela;
 * o navegador recebe o fluxo cru do `pipe-pane` e devolve teclas por `send-keys`.
 * A sessão sobrevive ao navegador, ao hub e ao fim da sessão do Claude — só o
 * `kill` explícito a encerra.
 */
export class Terminals {
  private live = new Map<string, LiveTerm>()

  constructor(private env: NodeJS.ProcessEnv = process.env) {}

  private run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
    return new Promise(resolve => {
      execFile(cmd, args, { env: this.env, maxBuffer: 8 << 20 }, (err, stdout, stderr) =>
        resolve({ ok: !err, out: `${stdout}${stderr}`.trimEnd() }),
      )
    })
  }

  private tmux(...args: string[]): Promise<{ ok: boolean; out: string }> {
    return this.run('tmux', args)
  }

  /**
   * `=nome` só resolve para sessão ou janela; `send-keys`, `capture-pane` e
   * `pipe-pane` pedem um pane e recusam esse alvo. O id do pane serve para todos.
   */
  private async paneOf(name: string): Promise<string | null> {
    const panes = await this.tmux('list-panes', '-t', `=${name}`, '-F', '#{pane_id}')
    if (!panes.ok) return null
    const first = panes.out.split('\n')[0]?.trim()
    return first !== undefined && first.startsWith('%') ? first : null
  }

  private fifoPath(name: string): string {
    const dir = join(configDir(), 'term')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    return join(dir, `${name}.pipe`)
  }

  private emit(t: LiveTerm, text: string): void {
    for (const l of t.listeners) l.data(text)
  }

  private end(t: LiveTerm, reason: string): void {
    this.live.delete(t.dir)
    this.stopReader(t)
    for (const l of t.listeners) l.exit(reason)
    t.listeners.clear()
  }

  private stopReader(t: LiveTerm): void {
    const reader = t.reader
    t.reader = null
    if (reader === null) return
    reader.removeAllListeners()
    reader.stdout?.removeAllListeners()
    try {
      reader.kill('SIGKILL')
    } catch {}
  }

  private async startReader(t: LiveTerm): Promise<string | null> {
    if (!existsSync(t.fifo)) {
      const made = await this.run('mkfifo', ['-m', '600', t.fifo])
      if (!made.ok && !existsSync(t.fifo)) return 'não consegui abrir o canal de saída do terminal'
    }
    // O `cat` bloqueia no open do fifo até o tmux abrir a ponta de escrita; por
    // ser processo filho, quem espera é ele, não o hub.
    const reader = spawn('cat', [t.fifo], { env: this.env, stdio: ['ignore', 'pipe', 'ignore'] })
    t.reader = reader
    reader.stdout?.on('data', (chunk: Buffer) => {
      const text = t.decoder.decode(chunk, { stream: true })
      if (text !== '') this.emit(t, text)
    })
    reader.on('error', () => this.onReaderClosed(t))
    reader.on('close', () => this.onReaderClosed(t))

    const piped = await this.tmux('pipe-pane', '-O', '-t', t.pane, `cat >> ${shellQuote(t.fifo)}`)
    return piped.ok ? null : 'não consegui ligar a saída do terminal'
  }

  private onReaderClosed(t: LiveTerm): void {
    if (t.reader === null || this.live.get(t.dir) !== t) return
    this.stopReader(t)
    if (t.listeners.size === 0) return
    void this.paneOf(t.name).then(pane => {
      if (this.live.get(t.dir) !== t) return
      if (pane === null) {
        this.end(t, 'o terminal foi encerrado')
        return
      }
      if (t.restarts >= MAX_READER_RESTARTS) {
        this.end(t, 'perdi a saída do terminal — reabra o painel')
        return
      }
      t.pane = pane
      t.restarts += 1
      void this.startReader(t)
    })
  }

  private async ensureSession(
    name: string,
    dir: string,
    size: TermSize,
  ): Promise<{ pane: string } | { error: string }> {
    const existing = await this.paneOf(name)
    if (existing !== null) {
      await this.resizePane(existing, size)
      return { pane: existing }
    }
    const created = await this.tmux(
      'new-session',
      '-d',
      '-s',
      name,
      '-c',
      dir,
      '-x',
      String(size.cols),
      '-y',
      String(size.rows),
    )
    if (!created.ok) return { error: `tmux falhou: ${created.out}` }
    const pane = await this.paneOf(name)
    if (pane === null) return { error: 'não encontrei o terminal recém-criado' }
    // Sem isto, anexar um cliente pelo terminal passaria a ditar o tamanho da
    // janela e o `resize-window` vindo do navegador seria descartado.
    await this.tmux('set-option', '-w', '-t', pane, 'window-size', 'manual')
    return { pane }
  }

  private async resizePane(pane: string, size: TermSize): Promise<void> {
    await this.tmux('resize-window', '-t', pane, '-x', String(size.cols), '-y', String(size.rows))
  }

  private capture(pane: string): Promise<{ ok: boolean; out: string }> {
    return this.tmux('capture-pane', '-p', '-e', '-J', '-S', `-${TERM_SEED_LINES}`, '-t', pane)
  }

  async attach(dir: string, size: TermSize, listener: TermListener): Promise<AttachResult> {
    const name = terminalName(dir)
    const existing = this.live.get(dir)
    if (existing) {
      existing.listeners.add(listener)
      await this.resizePane(existing.pane, size)
      existing.size = size
      const seed = await this.capture(existing.pane)
      return { ok: true, name, seed: seed.ok ? seed.out : '', ...size }
    }

    const session = await this.ensureSession(name, dir, size)
    if ('error' in session) return { ok: false, error: session.error }

    const t: LiveTerm = {
      name,
      dir,
      pane: session.pane,
      fifo: this.fifoPath(name),
      size,
      reader: null,
      restarts: 0,
      decoder: new TextDecoder(),
      listeners: new Set([listener]),
    }
    this.live.set(dir, t)

    const broke = await this.startReader(t)
    if (broke) {
      this.live.delete(dir)
      this.stopReader(t)
      return { ok: false, error: broke }
    }

    // O `pipe-pane` entra antes da foto: o contrário perderia o que saísse no
    // intervalo. O preço é poder repetir alguns bytes desses milissegundos.
    const seed = await this.capture(t.pane)
    return { ok: true, name, seed: seed.ok ? seed.out : '', ...size }
  }

  /** Sai da audiência. Sem ninguém olhando, desliga o fluxo e mantém o tmux vivo. */
  async detach(dir: string, listener: TermListener): Promise<void> {
    const t = this.live.get(dir)
    if (!t) return
    t.listeners.delete(listener)
    if (t.listeners.size > 0) return
    this.live.delete(dir)
    this.stopReader(t)
    await this.tmux('pipe-pane', '-t', t.pane)
  }

  private async paneFor(dir: string): Promise<string | null> {
    return this.live.get(dir)?.pane ?? (await this.paneOf(terminalName(dir)))
  }

  async write(dir: string, text: string, enter: boolean): Promise<string | null> {
    const pane = await this.paneFor(dir)
    if (pane === null) return 'este terminal não está mais aberto'
    if (text !== '') {
      const typed = await this.tmux('send-keys', '-t', pane, '-l', '--', text.slice(0, MAX_TERM_INPUT))
      if (!typed.ok) return 'não consegui enviar o texto para o terminal'
    }
    if (!enter) return null
    return (await this.tmux('send-keys', '-t', pane, 'Enter')).ok
      ? null
      : 'não consegui enviar o Enter para o terminal'
  }

  async key(dir: string, key: string): Promise<string | null> {
    const pane = await this.paneFor(dir)
    if (pane === null) return 'este terminal não está mais aberto'
    return (await this.tmux('send-keys', '-t', pane, key)).ok
      ? null
      : 'não consegui enviar a tecla para o terminal'
  }

  async resize(dir: string, size: TermSize): Promise<void> {
    const t = this.live.get(dir)
    if (t) t.size = size
    const pane = await this.paneFor(dir)
    if (pane !== null) await this.resizePane(pane, size)
  }

  async kill(dir: string): Promise<string | null> {
    const name = terminalName(dir)
    const t = this.live.get(dir)
    const killed = await this.tmux('kill-session', '-t', `=${name}`)
    if (t) {
      this.end(t, 'terminal encerrado')
      try {
        rmSync(t.fifo, { force: true })
      } catch {}
    }
    return killed.ok ? null : 'não consegui encerrar o terminal'
  }
}

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Terminals, terminalName, type TermListener } from '../src/terminal'

const hasTmux = Bun.which('tmux') !== null && Bun.which('mkfifo') !== null

let home: string
let work: string
let terminals: Terminals

function collector(): TermListener & { text(): string; exits: string[] } {
  const chunks: string[] = []
  const exits: string[] = []
  return {
    data: t => void chunks.push(t),
    exit: r => void exits.push(r),
    text: () => chunks.join(''),
    exits,
  }
}

async function waitFor(pred: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (pred()) return
    await Bun.sleep(25)
  }
  throw new Error('timeout esperando a condição')
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'ls-term-'))
  work = mkdtempSync(join(tmpdir(), 'ls-work-'))
  process.env.LOCAL_SESSION_DIR = home
  terminals = new Terminals(process.env)
})

afterAll(async () => {
  if (hasTmux) await terminals.kill(work)
  rmSync(home, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
})

describe.if(hasTmux)('terminal por tmux', () => {
  test('o que sai do comando chega ao navegador', async () => {
    const eye = collector()
    const res = await terminals.attach(work, { cols: 80, rows: 24 }, eye)
    expect(res.ok).toBe(true)

    await terminals.write(work, 'echo alo-do-terminal', true)
    await waitFor(() => eye.text().includes('alo-do-terminal'))
    expect(eye.text()).toContain('alo-do-terminal')
  })

  test('a sessão nasce no diretório pedido', async () => {
    const eye = collector()
    await terminals.attach(work, { cols: 80, rows: 24 }, eye)
    const before = eye.text().length

    await terminals.write(work, 'pwd', true)
    await waitFor(() => eye.text().slice(before).includes(work))
    expect(eye.text().slice(before)).toContain(work)
  })

  // O eco do que se digita também viaja pelo pipe, então o comando é escrito de
  // um jeito que o shell expande: só a saída de verdade produz "fim-42".
  test('tecla de controle interrompe o que está rodando', async () => {
    const eye = collector()
    await terminals.attach(work, { cols: 80, rows: 24 }, eye)

    await terminals.write(work, 'sleep 30; echo fim-$((6*7))', true)
    await Bun.sleep(300)
    await terminals.key(work, 'C-c')
    await terminals.write(work, 'echo depois-do-ctrl-c', true)

    await waitFor(() => eye.text().includes('depois-do-ctrl-c'))
    expect(eye.text()).not.toContain('fim-42')
  })

  test('reabrir traz a tela de volta pela foto do tmux', async () => {
    const primeiro = collector()
    await terminals.attach(work, { cols: 80, rows: 24 }, primeiro)
    await terminals.write(work, 'echo marca-de-reabertura', true)
    await waitFor(() => primeiro.text().includes('marca-de-reabertura'))
    await terminals.detach(work, primeiro)

    const segundo = collector()
    const res = await terminals.attach(work, { cols: 80, rows: 24 }, segundo)
    expect(res.ok && res.seed).toContain('marca-de-reabertura')
  })

  test('o comando continua rodando enquanto ninguém assiste', async () => {
    const eye = collector()
    await terminals.attach(work, { cols: 80, rows: 24 }, eye)
    await terminals.write(work, '(sleep 1; echo rodou-sozinho) &', true)
    await terminals.detach(work, eye)

    await Bun.sleep(1500)
    const volta = collector()
    const res = await terminals.attach(work, { cols: 80, rows: 24 }, volta)
    expect(res.ok && res.seed).toContain('rodou-sozinho')
  })

  test('encerrar mata a sessão tmux e avisa quem assistia', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-morre-'))
    const eye = collector()
    await terminals.attach(dir, { cols: 80, rows: 24 }, eye)

    expect(await terminals.kill(dir)).toBeNull()
    expect(eye.exits.length).toBe(1)

    const alive = () => {
      try {
        execFileSync('tmux', ['has-session', '-t', `=${terminalName(dir)}`], { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    }
    expect(alive()).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  test('o navegador manda o tamanho da janela e o tmux obedece', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-size-'))
    const eye = collector()
    await terminals.attach(dir, { cols: 42, rows: 13 }, eye)

    const size = execFileSync(
      'tmux',
      ['list-panes', '-t', `=${terminalName(dir)}`, '-F', '#{window_width}x#{window_height}'],
      { encoding: 'utf8' },
    ).trim()
    expect(size).toBe('42x13')

    await terminals.resize(dir, { cols: 61, rows: 21 })
    const depois = execFileSync(
      'tmux',
      ['list-panes', '-t', `=${terminalName(dir)}`, '-F', '#{window_width}x#{window_height}'],
      { encoding: 'utf8' },
    ).trim()
    expect(depois).toBe('61x21')

    await terminals.kill(dir)
    rmSync(dir, { recursive: true, force: true })
  })
})

#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { lanAddress, loadConfig, tailscaleAddress } from './config'
import { HubClient } from './hub-client'
import type { HubToSession } from './protocol'

const ROOT = join(import.meta.dir, '..')
const cfg = loadConfig()

const SESSION_ID = process.env.CLAUDE_CODE_SESSION_ID ?? `pid-${process.pid}`
const CWD = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const PID = Number(process.env.CLAUDE_PID ?? process.ppid)

const mcp = new Server(
  { name: 'local-session', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      experimental: {
        'claude/channel': {},
        // Declarar isto afirma que o server autentica quem responde. Aqui é verdade:
        // o hub descarta qualquer requisição sem token antes de virar decisão.
        'claude/channel/permission': {},
      },
    },
    instructions: [
      'Quem manda a mensagem está numa página web da rede local, não neste terminal. O que você escrever aqui não chega até lá — só o texto passado para a tool `reply` aparece na tela dessa pessoa.',
      '',
      'Mensagens chegam como <channel source="local-session" session_id="..." ts="...">. Responda com `reply` ao terminar a tarefa pedida, e use `reply` também para avisos intermediários quando algo demorar.',
      '',
      'A tool `link` devolve o endereço da página. Use quando perguntarem como acessar.',
      '',
      'A página já mostra sozinha o que você está executando (ferramenta e alvo) — não precisa narrar cada passo por `reply`.',
    ].join('\n'),
  },
)

const pendingPermissions = new Set<string>()

function onHubMessage(msg: HubToSession): void {
  if (msg.type === 'prompt') {
    void mcp
      .notification({
        method: 'notifications/claude/channel',
        params: {
          content: msg.text,
          meta: { session_id: SESSION_ID, ts: new Date().toISOString() },
        },
      })
      .catch(err => {
        process.stderr.write(`local-session: falha ao entregar prompt: ${err}\n`)
      })
    return
  }

  if (msg.type === 'permission_decision') {
    // requestId desconhecido ou já resolvido: descarta em vez de reemitir.
    if (!pendingPermissions.delete(msg.requestId)) return
    void mcp
      .notification({
        method: 'notifications/claude/channel/permission',
        params: { request_id: msg.requestId, behavior: msg.behavior },
      })
      .catch(err => {
        process.stderr.write(`local-session: falha ao entregar decisão: ${err}\n`)
      })
  }
}

const hub = new HubClient({
  port: cfg.port,
  token: cfg.token,
  root: ROOT,
  register: {
    type: 'register',
    sessionId: SESSION_ID,
    cwd: CWD,
    label: basename(CWD) || SESSION_ID,
    pid: Number.isFinite(PID) ? PID : 0,
  },
  onMessage: onHubMessage,
})

mcp.setNotificationHandler(
  z.object({
    method: z.literal('notifications/claude/channel/permission_request'),
    params: z.object({
      request_id: z.string(),
      tool_name: z.string(),
      description: z.string(),
      input_preview: z.string(),
    }),
  }),
  async ({ params }) => {
    pendingPermissions.add(params.request_id)
    hub.send({
      type: 'permission_request',
      requestId: params.request_id,
      toolName: params.tool_name,
      description: params.description,
      inputPreview: params.input_preview,
    })
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description:
        'Envia texto para a página web desta sessão. É o único caminho até quem está do outro lado — o que você escreve no terminal não chega lá.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    {
      name: 'link',
      description: 'Devolve o endereço da página desta sessão na rede local, com o token de acesso.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  try {
    switch (req.params.name) {
      case 'reply': {
        const text = String((req.params.arguments as Record<string, unknown> | undefined)?.text ?? '')
        if (text.trim() === '') {
          return { content: [{ type: 'text', text: 'reply exige text não vazio' }], isError: true }
        }
        hub.send({ type: 'reply', text })
        return { content: [{ type: 'text', text: 'enviado para a página' }] }
      }
      case 'link': {
        const host = await lanAddress()
        const tailnet = tailscaleAddress()
        const lines = [
          `Rede local: http://${host}:${cfg.port}/?t=${cfg.token}`,
          ...(tailnet
            ? [
                '',
                `Tailscale (funciona de qualquer lugar, com o app logado no celular):`,
                `http://${tailnet}:${cfg.port}/?t=${cfg.token}`,
              ]
            : []),
          '',
          `Sessão: ${basename(CWD) || SESSION_ID}`,
        ]
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }
      default:
        return {
          content: [{ type: 'text', text: `tool desconhecida: ${req.params.name}` }],
          isError: true,
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `${req.params.name} falhou: ${msg}` }], isError: true }
  }
})

await mcp.connect(new StdioServerTransport())
hub.start()

let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  hub.stop()
  process.exit(0)
}

mcp.onclose = shutdown
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// O socket do hub e os timers de reconexão seguram o event loop, então o EOF do
// stdin não derruba o processo sozinho — sem isto, cada sessão encerrada deixa
// um MCP server zumbi segurando a conexão com o hub.
process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)

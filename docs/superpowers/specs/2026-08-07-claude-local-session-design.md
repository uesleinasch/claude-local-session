# claude-local-session — design

Data: 2026-08-07

## Problema

Quando uma sessão do Claude Code está rodando num terminal, ela só existe naquele terminal.
Sair da mesa significa perder o acompanhamento: não dá para ver o que a sessão está fazendo,
mandar um prompt novo, nem aprovar a permissão que travou o trabalho.

O objetivo é expor cada sessão do Claude Code numa página web acessível pela rede local, de
onde seja possível conversar com aquela sessão, acompanhar o que ela está executando e
responder aos pedidos de permissão.

## Escopo

Dentro:

- Chat bidirecional com a sessão (prompt entra, resposta do Claude volta).
- Aprovação e negação de permissão pelo navegador.
- Linha de atividade da sessão (qual ferramenta, qual alvo, começou/terminou/ocioso).
- Múltiplas sessões simultâneas atrás de um link único.
- Autenticação por token.

Fora, deliberadamente:

- Shell independente no navegador (xterm.js, node-pty).
- Espelho do TUI do Claude Code.
- Histórico persistente entre reinícios do hub.
- Multiusuário, HTTPS/mTLS, upload de arquivos.
- Qualquer exposição fora da LAN (port forwarding, túnel).

## Fundamento técnico

O Claude Code tem um protocolo de canal nativo, usado pelo plugin oficial do Telegram
(`~/.claude/plugins/cache/claude-plugins-official/telegram/0.0.6/server.ts`). Um MCP server
que declara as capabilities certas ganha três coisas:

| Capability / mecanismo                             | O que habilita                                          |
| -------------------------------------------------- | ------------------------------------------------------- |
| `experimental: { 'claude/channel': {} }`            | Emitir `notifications/claude/channel` — push de mensagem para dentro da sessão, entregue ao Claude como bloco `<channel source="..." ...>` |
| Uma tool de resposta (aqui, `reply`)                | Caminho de volta: o Claude manda texto para fora        |
| `experimental: { 'claude/channel/permission': {} }` | Receber `notifications/claude/channel/permission_request` e responder com `notifications/claude/channel/permission` |

Declarar `claude/channel/permission` é uma asserção de que o server autentica quem responde.
Aqui isso é verdade: o token barra qualquer requisição antes de ela virar decisão.

O MCP server recebe no ambiente tudo que precisa para se identificar:

- `CLAUDE_CODE_SESSION_ID` — mesmo UUID que os hooks recebem no stdin. É a chave de correlação.
- `CLAUDE_PROJECT_DIR` — cwd da sessão, usado como rótulo na lista.
- `CLAUDE_PID` — PID da sessão.
- `CLAUDE_PLUGIN_ROOT` — raiz do plugin, usada para localizar `hub.ts` e os assets web.

Plugins declaram hooks em `hooks/hooks.json` na própria raiz, com `${CLAUDE_PLUGIN_ROOT}` nos
comandos. Nada precisa ser escrito no `settings.json` do usuário.

## Arquitetura

```
navegador (celular / notebook na LAN)
        │  HTTP + WebSocket  :7777
        ▼
┌──────────────────────────────────────────┐
│  hub  (daemon único, independente)       │
│  · serve a UI estática                   │
│  · roteia browser ↔ sessão               │
│  · ring buffer de eventos por sessão     │
└──────────────────────────────────────────┘
     ▲ ws          ▲ ws           ▲ POST
     │             │              │
  server.ts     server.ts    hooks/report.ts
  (sessão A)    (sessão B)   (dispara por tool)
     ▲             ▲
     │ stdio MCP   │
  Claude Code   Claude Code
```

Três processos, cada um com uma responsabilidade:

**hub** (`src/hub.ts`) — daemon HTTP/WebSocket. Serve a UI, mantém o registro de sessões,
roteia mensagens e guarda o feed recente. Não sabe nada de MCP.

**server** (`src/server.ts`) — MCP server stdio, um por sessão do Claude Code. Traduz entre o
protocolo MCP e o protocolo do hub. Não sabe nada de HTTP além do WebSocket cliente.

**report** (`hooks/report.ts`) — script disparado por hook. Traduz o payload do hook num evento
de atividade e faz POST no hub. Não mantém estado.

### Por que o hub é daemon separado

A alternativa — a primeira sessão vira hub — exige eleição de líder e perde o estado quando
essa sessão morre. Como daemon desanexado, o hub sobrevive à morte de qualquer sessão.

Ciclo de vida:

1. `server.ts` sobe e tenta conectar em `ws://127.0.0.1:7777`.
2. Falhou: spawna `hub.ts` com `detached: true`, `stdio: 'ignore'`, `.unref()`, e refaz a
   tentativa com backoff.
3. Corrida na largada (duas sessões subindo juntas) resolve sozinha: os dois daemons tentam
   bindar a porta, o perdedor recebe `EADDRINUSE` e sai em silêncio.
4. O hub se autoencerra após 60s sem nenhuma sessão registrada. Não vira zumbi.

## Protocolo

Tipos compartilhados em `src/protocol.ts`, importados pelo hub, pelo server e (como referência)
pela UI.

### Eventos do feed

Unidade que a UI renderiza. O hub guarda os últimos `MAX_EVENTS = 200` por sessão.

```ts
type FeedEvent =
  | { kind: 'prompt';     ts: number; text: string }
  | { kind: 'reply';      ts: number; text: string }
  | { kind: 'activity';   ts: number; tool: string; detail: string; status: 'start' | 'end' | 'idle' }
  | { kind: 'permission'; ts: number; requestId: string; toolName: string;
      description: string; inputPreview: string; resolved?: 'allow' | 'deny' }
```

### Sessão → hub

```ts
{ type: 'register', sessionId, cwd, label, pid }
{ type: 'reply', text }
{ type: 'permission_request', requestId, toolName, description, inputPreview }
```

### Hub → sessão

```ts
{ type: 'prompt', text }
{ type: 'permission_decision', requestId, behavior: 'allow' | 'deny' }
```

### Browser → hub

```ts
{ type: 'subscribe', sessionId }
{ type: 'prompt', sessionId, text }
{ type: 'permission_decision', sessionId, requestId, behavior }
```

### Hub → browser

```ts
{ type: 'sessions', sessions: SessionSummary[] }   // lista, a cada mudança
{ type: 'history', sessionId, events: FeedEvent[] } // replay ao assinar
{ type: 'event', sessionId, event: FeedEvent }      // incremental
```

`SessionSummary` é `{ id, label, cwd, pid, alive, endedAt? }`.

## Fluxos

**Você → Claude.** Browser manda `prompt` no WS → hub roteia para o `server.ts` da sessão →
ele emite `notifications/claude/channel` com `content` e `meta` → o Claude Code entrega como
`<channel source="local-session" session_id="..." ts="...">`. É push, sem polling.

**Claude → você.** O Claude chama a tool `reply({ text })` → `server.ts` envia ao hub → hub faz
broadcast para os browsers assinantes daquela sessão. O `session_id` não é argumento da tool:
cada `server.ts` atende exatamente uma sessão e já sabe qual é.

O server expõe também a tool `link`, que devolve o endereço da página com o token — é como
você descobre a URL sem ir ler o arquivo de config.

**Permissão.** Claude Code emite `permission_request` → `server.ts` repassa → hub → card no
navegador → decisão volta pelo mesmo caminho → `server.ts` emite
`notifications/claude/channel/permission` com `{ request_id, behavior }`.

**Atividade.** `PreToolUse` / `PostToolUse` / `Stop` / `SessionEnd` disparam `report.ts`, que lê
o JSON do stdin, monta um resumo curto e faz POST em `/_activity`.

Regra dura do `report.ts`: **timeout de 300ms e falha em silêncio.** Hook lento trava a sessão
inteira, e um hub fora do ar nunca pode derrubar o trabalho local. Qualquer erro sai com código 0.

Resumo por ferramenta:

| Tool                    | `detail`                                  |
| ----------------------- | ----------------------------------------- |
| `Bash`                  | `command`, truncado em 80 chars           |
| `Read` `Write` `Edit`   | `file_path` relativo ao cwd               |
| `Grep` `Glob`           | `pattern`                                 |
| `Task` `Agent`          | `description`                             |
| outros                  | string vazia                              |

## Segurança

Token de 32 bytes (hex, `crypto.randomBytes`) gerado no primeiro boot e gravado em
`~/.claude/local-session/config.json` com modo `0600`. Escrita atômica: grava em `.tmp` e
renomeia, para duas sessões subindo juntas não produzirem token pela metade.

Apresentação do token:

- UI: query `?t=` na primeira visita; o hub responde com cookie `ls_token`
  (`HttpOnly`, `SameSite=Strict`, `Path=/`), e as visitas seguintes dispensam a query.
- `server.ts` e `report.ts`: header `X-LS-Token`.

**Requisição sem token válido recebe 404, nunca 401.** Não confirma que o serviço existe.
Comparação do token com tempo constante (`crypto.timingSafeEqual`) para não vazar o prefixo.

Bind em `0.0.0.0:7777` — é o que torna a porta alcançável da LAN. O endereço é entregue pela
tool `link` do MCP server, e o IP vem da rota default (socket UDP conectado, sem enviar
pacote), não das sete interfaces Docker da máquina.

Risco explícito, assumido: **essa página aprova `Bash`.** O token é a única barreira. Numa rede
que não é só sua, vale fechar o resto com `ufw allow from 192.168.1.0/24 to any port 7777`.

O `server.ts` só aceita decisão de permissão para `requestId` que ele mesmo tem pendente. Um
`requestId` desconhecido ou já resolvido é descartado.

## Falhas

| Situação                        | Comportamento                                                            |
| ------------------------------- | ------------------------------------------------------------------------ |
| Hub fora do ar                  | `server.ts` reconecta com backoff (1s → 30s) e respawna o daemon; a sessão segue normal, só sem canal |
| Sessão morre                    | WS fecha; hub marca `alive: false` e mantém na lista com `endedAt`        |
| Browser reconecta               | Recebe `sessions` + `history` do ring buffer; nada se perde na tela       |
| Hook não alcança o hub          | Timeout de 300ms, saída silenciosa código 0                              |
| Duas sessões spawnam hub juntas | Perdedor sai com `EADDRINUSE`                                            |
| Hub sem sessões por 60s         | Autoencerra                                                              |

## Estrutura

```
claude-local-session/
├── .claude-plugin/plugin.json
├── .mcp.json
├── package.json
├── src/
│   ├── server.ts       MCP stdio — ponte Claude ↔ hub
│   ├── hub.ts          daemon HTTP/WS
│   ├── config.ts       token, porta, IP da LAN
│   └── protocol.ts     tipos compartilhados
├── hooks/
│   ├── hooks.json      PreToolUse / PostToolUse / Stop / SessionEnd
│   └── report.ts       stdin JSON → POST /_activity
├── web/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── tests/
```

Bun + TypeScript, mesmo runtime e mesmas dependências do plugin oficial do Telegram
(`@modelcontextprotocol/sdk@^1.27.1`, `zod@^4.3.6`). UI em HTML/CSS/JS puro, sem bundler nem
framework — o hub serve `web/` como estático.

## Testes

Cobre o que tem lógica de decisão:

- `config.ts` — geração de token, permissões do arquivo, releitura idempotente.
- `protocol.ts` / resumo do hook — payload de hook vira o `FeedEvent` esperado, por ferramenta.
- `hub.ts` — gate de token (404 sem token, 200 com), registro de sessão, roteamento
  browser → sessão e sessão → browser, ring buffer truncando em 200, marcação de sessão morta.

Integração sobe o hub numa porta efêmera com um cliente de sessão falso e um cliente de browser
falso, exercitando os dois sentidos e o ciclo de permissão.

A confirmação visual da UI no navegador é do usuário. Teste verde não prova que a tela está
certa no celular.

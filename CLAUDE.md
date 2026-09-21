# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Plugin do Claude Code (marketplace `unac`, plugin `local-session`) que expõe cada sessão numa
página web da rede local. Runtime é **Bun** + TypeScript; a UI é HTML/CSS/JS puro, sem framework
e sem build. Todo o código, comentário, string de UI e commit é em **português**.

## Comandos

```bash
bun install
bun test                        # unitários + integração (hub e tmux de verdade, porta efêmera)
bun test tests/hub-state.test.ts        # um arquivo
bun test -t "auto mode"                 # um teste por nome
bunx tsc --noEmit               # única checagem estática do repo — não há linter/formatter
bun run hub                     # hub em primeiro plano, para depurar
bun run build                   # dist/local-session, o executável único (~92 MB, ~0,2s)
bun run package                 # dist/local-session_<versão>_amd64.deb (exige dpkg-deb)
bun scripts/update.ts           # deploy local (ver "A dança do deploy")
bun scripts/update.ts --check   # o que aconteceria, sem mexer
bun scripts/setup.ts            # configura as 3 camadas de canal na máquina
bun scripts/service.ts          # unit de usuário do systemd para o hub
```

## Um ponto de entrada, sete subcomandos

Hub, MCP server, os dois hooks e os scripts de configuração são **um programa só**:
`src/cli.ts` despacha por `process.argv[2]` (`hub`, `mcp`, `hook`, `context-hook`, `setup`,
`service`, `managed-settings`, em `src/cli-core.ts`). `bun build --compile` aceita um entrypoint só, e um executável
por programa multiplicaria o runtime do Bun — 92 MB cada.

Nada invoca `bun` nem um `.ts` diretamente: `hooks/hooks.json`, `.claude-plugin/mcp.json` e
`commands/*.md` chamam **`bin/local-session`**, um shim `sh` que prefere `dist/local-session`
quando ele existe e cai no fonte quando não. É isso que faz a mesma árvore funcionar instalada
do marketplace (sem binário) e empacotada. `tests/entrypoint.test.ts` guarda o acoplamento
entre os quatro manifestos, o bit de execução do shim e a lista de subcomandos — sem ele, um
caminho errado só aparece como "a régua de atividade parou de encher".

O import de cada subcomando é **dinâmico** de propósito: `hub.ts` e `server.ts` fazem trabalho
já no topo (leem o config, abrem o histórico, conectam no hub), e um import estático os faria
rodar em todo subcomando. Cada módulo mantém `if (import.meta.main) main()`, então
`bun src/hub.ts` continua funcionando como sempre.

Essa config **não** pode voltar para um `.mcp.json` na raiz: ali ela também é lida como MCP
*de projeto* por qualquer sessão aberta dentro do repo, contexto em que `${CLAUDE_PLUGIN_ROOT}`
não é expandido e o server morre no boot com
`ENOENT: Could not change directory to "${CLAUDE_PLUGIN_ROOT}"`. O `plugin.json` aponta para ela
pelo campo `mcpServers`, e `scripts/update.ts` apaga o `.mcp.json` que tenha sobrado no cache.

Pelo mesmo motivo o `mcp.json` roda `sh -c` em vez de chamar o shim direto: só há prova de que
`${CLAUDE_PLUGIN_ROOT}` é expandido **dentro de uma linha de comando** — é o que os quatro hooks
fazem desde sempre. No campo `command`, um harness que não expanda deixaria o caminho literal e
a sessão subiria sem MCP, falha que só apareceria na próxima sessão nova.

Dentro do binário não existe `src/*.ts` em disco, o que muda três resoluções — todas centradas
em `src/cli-core.ts`, todas testadas:

- **quem sou eu**: `Bun.main` começa com `/$bunfs/` (`isStandalone`);
- **onde está a raiz do plugin**: `import.meta.dir` é o fs virtual e não serve, então vale o
  diretório do executável ou `LOCAL_SESSION_ROOT` (`pluginRoot`) — sem isso `IDENTITY` fica nula,
  `CAN_SPAWN` cai e o hub se autoencerra em 60s achando que está ocioso;
- **como relançar o hub**: `spawn(execPath, ['hub'])` em vez do caminho do `.ts`
  (`hubSpawnArgs`).

## Arquitetura: três processos e um navegador

```
navegador ──HTTP/WS :7777──► hub (daemon único, desanexado)
                               ▲ ws           ▲ POST /_activity, /_context
                          src/server.ts    hooks/report.ts
                          (1 por sessão)   hooks/context-report.ts
```

- **`src/server.ts`** — MCP stdio, um processo por sessão do Claude Code. É a única via de mão
  dupla com o modelo: recebe prompt do hub e o injeta como `notifications/claude/channel`;
  expõe as tools `reply` e `link`. Nada que o Claude escreve no terminal chega ao navegador —
  **só o texto passado para `reply`**.
- **`src/hub.ts`** — daemon HTTP/WebSocket em `0.0.0.0:7777`, um por máquina. Sobrevive à morte
  de qualquer sessão; se autoencerra 60s depois da última sair, a menos que haja navegador
  conectado ou spawn configurado. Se perder a corrida pela porta, `Bun.serve` lança e o processo
  sai com 0 — o vencedor atende por todos.
- **`hooks/report.ts`** — registrado em `hooks/hooks.json` para `PreToolUse`, `PostToolUse`,
  `Stop` e `SessionEnd`. É a origem da régua de atividade, dos previews de permissão e dos cards
  de `AskUserQuestion`.
- **`hooks/context-report.ts`** — **não** está em `hooks.json`: roda no pipeline do *statusline*
  do usuário, a única fonte com o percentual de janela de contexto já calculado para o modelo em
  uso. Sem statusline configurado, a barra de contexto simplesmente não existe.

Ambos os hooks engolem qualquer erro e saem com 0 sempre: hook barulhento ou lento trava a
sessão do usuário, e hub fora do ar não pode derrubar o trabalho local.

## O pacote `.deb`

`bun run package` monta o `.deb` (26 MB comprimidos, 92 MB instalados). Três destinos, e a
divisão entre eles tem um motivo medido:

| caminho | o quê |
| --- | --- |
| `/usr/bin/local-session` | o executável |
| `/usr/share/local-session/` | `.claude-plugin/`, `commands/`, `bin/`, e de `hooks/` **só** o `hooks.json` |
| `/usr/lib/systemd/user/local-session-hub.service` | unit disponível a todo usuário, ativa só para quem der `enable` |

**`claude plugin install` a partir de um caminho em disco copia a árvore** para
`~/.claude/plugins/cache` de cada usuário (medido em 2026-09-21: plugin de 3 MB → 2,9 MB no
cache, diretório real). Por isso o binário fica fora dela — seriam 92 MB por usuário — e por
isso `src/` e `web/` não vão no pacote: estão dentro do binário. De `hooks/` vai só o manifesto,
porque os `.ts` ao lado importam `../src`, que ali não existe.

O `postinst` chama `/usr/bin/local-session managed-settings --apply`, e não um merge em shell:
`mergeManagedSettings` preserva allowlist alheia e recusa arquivo corrompido, cuidado que se
perderia na tradução. O `postrm` só remove a entrada no **purge** — num upgrade o `remove`
acontece antes da instalação da versão nova, e tirar a entrada ali deixaria a máquina sem canal
no meio do caminho. `channelsEnabled` nunca é desligado: é chave global de outros plugins.

O que o pacote **não** faz, porque o registro do plugin é por usuário e o `postinst` roda antes
de haver usuário na equação: registrar o marketplace, escrever o alias e ligar o serviço. Isso é
o passo 0 do `local-session setup`, que a mensagem pós-instalação manda rodar.

Como o cache de cada usuário é uma **cópia**, um `apt upgrade` deixa a árvore do plugin para
trás enquanto só o binário muda. Quando um manifesto muda, o sintoma seria silencioso — daí o
binário embutir o próprio `plugin.json` (`src/plugin-meta.ts`) e o hub comparar com o do `ROOT`:
divergindo, a página mostra a tarja `#outdated` com o comando que resolve.

## `src/protocol.ts` é o contrato

Todas as mensagens dos quatro lados vivem lá: `SessionToHub`, `HubToSession`, `BrowserToHub`,
`HubToBrowser`, `FeedEvent`, `SessionSummary`, mais os parsers/validadores (`parseActivityPost`,
`parseQuestionSpecs`, …) e os limites (`MAX_EVENTS`, `MAX_PREVIEW`, `IDLE_SHUTDOWN_MS`).

O navegador **não importa** esse arquivo — `web/*.js` é JS puro servido direto. Mudança em
`BrowserToHub`/`HubToBrowser` exige tocar `src/protocol.ts`, o handler em `src/hub.ts` **e**
`web/app.js` na mão; nada avisa se você esquecer um dos três.

## Núcleo puro vs. casca de I/O

O padrão do repo é separar a lógica testável do efeito colateral. Ao mexer, ponha a regra no
núcleo, não na casca. Quando o núcleo precisa de um efeito, ele entra como parâmetro com
default — `tailscaleAddress(nets = networkInterfaces())` em `src/config.ts` e
`probeTailscale(run = runStatus)` em `src/tailscale.ts` são os dois exemplos a copiar:

| Núcleo (sem I/O, com teste unitário) | Casca (I/O, integração) |
| --- | --- |
| `hub-state.ts` (registro, feed, urgência), `notify.ts`, `hook-event.ts`, `context-report.ts`, `git-changes.ts`, `question-keys.ts`, `setup-core.ts`, `update-core.ts`, `upload.ts`, `tailscale.ts`, `trust.ts`, `cli-core.ts`, `web-assets.ts`, `plugin-meta.ts`, `package-core.ts` | `hub.ts`, `server.ts`, `hub-client.ts`, `history.ts`, `terminal.ts`, `cli.ts`, `scripts/*.ts` |
| `web/markdown.js`, `web/session-status.js`, `web/connection.js` | `web/app.js`, `web/terminal-panel.js` |

## As três camadas do canal (por que "o prompt não chega")

O protocolo de canal do Claude Code vem desligado e é protegido em três níveis independentes.
Faltando qualquer um, o plugin instala, conecta, serve a página, registra a atividade — e o
prompt é **descartado em silêncio** antes de chegar ao modelo:

1. `/etc/claude-code/managed-settings.json` com `channelsEnabled` + `allowedChannelPlugins`
   (declarar essa chave **substitui** a allowlist padrão da Anthropic, não soma a ela — por isso
   `setup-core.ts` faz merge).
2. a flag por sessão `claude --channels plugin:local-session@unac` (sem equivalente em
   `settings.json`; daí a função de shell que o instalador escreve no rc).
3. opcional: `mcp__plugin_local-session_local-session__reply` no `permissions.allow`, senão cada
   resposta fica parada num card de permissão.

O log que diz qual camada falta está no README (`grep "Channel notifications skipped"`).

## O que só funciona dentro de tmux

O protocolo de canal não tem interrupção, resposta a `AskUserQuestion` nem troca de modelo. Tudo
isso é resolvido **escrevendo teclas no pane do tmux** onde o `claude` roda (`src/hub.ts`
localiza o pane pelo PID registrado; `src/question-keys.ts` traduz escolha em sequência de
teclas). Fora do tmux esses controles não aparecem na página. Alvo de `send-keys`/`capture-pane`
tem de ser o **id do pane** (`%12`) — `=nome` só resolve para sessão/janela.

Sessão nova nasce **detached**, então qualquer diálogo que o `claude` abra no boot trava tudo sem
ninguém para responder — e, sem inicializar, ela nunca sobe o MCP nem registra no hub: a página
fica sem a sessão enquanto o tmux segue vivo. É o caso do diálogo de confiança da pasta: o hub lê
`hasTrustDialogAccepted` em `~/.claude.json` (`src/trust.ts`) **antes** de spawnar e devolve
`spawn_trust` para a página confirmar; só então cria a sessão e aceita o diálogo por `send-keys`.
As teclas só são enviadas se `capture-pane` mostrar o diálogo — Enter às cegas cairia no prompt de
uma sessão já pronta.

Os terminais remotos (`src/terminal.ts`) são sessões tmux próprias, nomeadas `lst-<slug>-<hash>`
e presas ao **diretório**, não à sessão do Claude: sobrevivem ao hub e ao navegador.

## Fronteiras de segurança que não podem afrouxar

- Token é a única barreira e a página aprova `Bash`. Requisição sem token válido recebe **404**,
  nunca 401 (401 confirmaria que o serviço existe); comparação por `timingSafeEqual`.
- O navegador nunca envia caminho arbitrário: `spawn`/`browse` comparam por igualdade exata
  contra a home e `projectsRoot`; as teclas do terminal são a allowlist `TERM_KEYS`.
- Upload é reconhecido pelos **bytes**, não pelo nome nem pelo content-type.
- `web/vendor/` é xterm.js/addon-fit de terceiros (MIT), servido com `cache-control: immutable`.
  Não editar.

## A dança do deploy local

`claude plugin install/update` puxa do marketplace remoto (GitHub) e **não vê** o código local.
Para ver o repo rodando de verdade, a partir da raiz: `bun scripts/update.ts` (ou
`/local-session:update`). Ele espelha `src/`, `web/`, `hooks/`, `commands/` e o `plugin.json` em
**todos** os diretórios de versão do cache — uma sessão antiga respawna o hub do próprio root, e
um diretório esquecido ressuscita código velho — e mata o hub pelo **PID que escuta a porta**
(`ss -tlnp`), nunca por `pkill -f` com o caminho no padrão, que mataria o próprio shell.

Duas assimetrias que enganam ao depurar "a feature não responde":

- `web/` é lido do disco a cada request; **o código do hub é o carregado no boot do processo** —
  compare a idade do processo com o mtime dos arquivos. Rodando do fonte isso continua valendo:
  os imports `with { type: 'file' }` de `src/web-assets.ts` devolvem o caminho real no disco, e
  só viram `/$bunfs/...` dentro do binário. Compilado, `web/` congela — `LOCAL_SESSION_WEB_DIR`
  serve a página de um diretório e devolve a edição ao vivo.
- **O shim prefere `dist/local-session`**: um binário velho ali é a armadilha de "editei e não
  mudou" com outra cara. Depois de mexer em `src/`, `web/` ou `hooks/`, ou você recompila
  (`bun run build`) ou apaga o `dist/`.
- `managed-settings.json` só é lido na inicialização da sessão do Claude Code.

Ao bumpar versão, `package.json` e `.claude-plugin/plugin.json` andam juntos. O bump aqui é
passo de **desenvolvimento**, não de release: a validação acontece na própria página, muitas
vezes de uma sessão remota.

## Invariantes que os testes guardam

`tests/web-css.test.ts` lê `index.html` e `style.css` de verdade e reprova padrões que só
aparecem no celular. Ao mexer na UI, cumpra os contratos ou o teste quebra:

- quem tem `overflow-x: auto` declara `min-width: 0` (filho de flex/grid não encolhe sozinho e
  empurra a página inteira para o scroll horizontal);
- elemento `position: fixed` centralizado por `translateX(-50%)` tem `max-width`;
- campo que mostra nome de ferramenta tem `max-width` + `text-overflow: ellipsis` (nome de tool
  MCP passa de 45 caracteres);
- id com `display` próprio **e** atributo `hidden` no HTML precisa da regra `#id[hidden]` — sem
  ela `el.hidden = true` não tem efeito;
- controle pequeno cresce no bloco `@media (hover: none)`.

## Convenções

- Comentário só para invariante que o código não mostra (acoplamento entre arquivos, armadilha
  de biblioteca, decisão de segurança que alguém "consertaria"). O repo inteiro segue isso — não
  há comentário narrativo nem doc decorativo.
- `tsconfig.json` é `strict` com `noUncheckedIndexedAccess` e `verbatimModuleSyntax`.
- Commits em conventional commits, descrição em português minúscula, focada no efeito para quem
  usa (`feat: terminal de verdade no diretório do projeto, pelo navegador`).
- Confirmação visual/comportamental na página é do usuário: peça para ele validar no navegador.

## Onde ler mais

`README.md` cobre instalação, uso e diagnóstico com detalhe; `ROADMAP.md` diz o que vem e por
quê (inclusive o que foi descartado); `docs/superpowers/specs/2026-08-07-*.md` tem o design
original e o do instalador.

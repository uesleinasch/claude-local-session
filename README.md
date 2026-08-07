# claude-local-session

Expõe cada sessão do Claude Code numa página web da sua rede local. Pelo navegador do
celular você manda prompt para a sessão, acompanha o que ela está executando e aprova ou
nega os pedidos de permissão.

```
navegador (celular / notebook na LAN)
        │  HTTP + WebSocket  :7777
        ▼
┌──────────────────────────────────────────┐
│  hub  (daemon único, independente)       │
└──────────────────────────────────────────┘
     ▲ ws          ▲ ws           ▲ POST
  server.ts     server.ts    hooks/report.ts
  (sessão A)    (sessão B)   (dispara por tool)
     ▲             ▲
  Claude Code   Claude Code
```

Um link só para todas as sessões. O hub é um daemon desanexado: sobrevive à morte de
qualquer sessão e se autoencerra 60s depois que a última sai.

## Instalação

Clone, leia o script e execute — um comando resolve tudo, inclusive numa máquina recém-formatada:

```bash
git clone https://github.com/uesleinasch/claude-local-session
./claude-local-session/install.sh
```

Se preferir a via curta (executa código remoto sem revisão prévia, avalie):

```bash
curl -fsSL https://raw.githubusercontent.com/uesleinasch/claude-local-session/main/install.sh | bash
```

O instalador verifica o `claude`, instala o `bun` se faltar, adiciona o marketplace, instala o
plugin e configura as três camadas descritas abaixo. É idempotente: rodar de novo não duplica
nada e não pede senha se já estiver tudo certo. Ele pede `sudo` uma única vez, para escrever em
`/etc/claude-code/managed-settings.json`.

Depois abra um terminal novo e rode `claude` — o canal já vem ativo, porque o instalador
escreve no seu rc:

```bash
alias claude='claude --channels plugin:local-session@unac'
```

Numa máquina que já tem o plugin, `/local-session:setup` faz a mesma configuração de dentro do
Claude Code (o pedido de senha vira um diálogo gráfico, via `pkexec`).

## O que o instalador configura

O protocolo de canal do Claude Code vem **desligado de fábrica** e é protegido por três camadas
independentes. Sem todas elas, o plugin instala, conecta, serve a página e registra a atividade
normalmente — **mas os prompts nunca chegam ao modelo**, e o descarte é silencioso do lado do
Claude. Esta seção existe para você entender o que foi mexido na sua máquina, e para conseguir
fazer à mão se preferir.

### 1. Ligar o recurso e permitir o plugin

Em `/etc/claude-code/managed-settings.json` (exige `sudo`, vale para a máquina inteira):

```bash
sudo mkdir -p /etc/claude-code
sudo tee /etc/claude-code/managed-settings.json >/dev/null <<'EOF'
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [
    { "plugin": "local-session", "marketplace": "unac" }
  ]
}
EOF
```

`channelsEnabled` liga o recurso; `allowedChannelPlugins` diz quais plugins podem empurrar
mensagens para dentro das sessões.

**Atenção:** declarar `allowedChannelPlugins` *substitui* a allowlist padrão da Anthropic, em
vez de somar a ela. Se você usa outro plugin de canal — o Telegram oficial, por exemplo —
acrescente a entrada dele aqui, senão ele para de receber. É por isso que o instalador faz
merge em vez de sobrescrever: uma entrada que já esteja no arquivo nunca é removida.

### 2. Ativar o canal na sessão

A allowlist diz o que *pode* ser canal; cada sessão ainda escolhe o que *é*:

```bash
claude --channels plugin:local-session@unac
```

O formato é `plugin:<nome>@<marketplace>` — não o identificador que aparece nos logs. É por isso
que o instalador escreve o alias sobrepondo o próprio `claude`: a flag é por sessão e não tem
equivalente em `settings.json`, então sem o alias você precisaria lembrar dela toda vez.

### 3. Opcional: não aprovar cada resposta

Por padrão a tool `reply` pede permissão, então toda resposta do Claude fica parada até você
aprovar pela página. Isso é seguro, mas cansa. Para liberar só a resposta (o `Bash` e o resto
continuam pedindo), em `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__plugin_local-session_local-session__reply"]
  }
}
```

Se a sua organização distribui `managed-settings.json` por política, a alteração do passo 1
pode ser sobrescrita — fale com quem administra antes.

## Como pegar o link

Na primeira execução o MCP server gera o token em `~/.claude/local-session/config.json`
(modo `0600`) e sobe o hub sozinho. Para descobrir o endereço, pergunte ao Claude — ele tem a
tool `link`:

```
> qual o link da sessão?
http://192.168.0.42:7777/?t=<token>
```

Salve esse link no celular. Na primeira visita o hub devolve um cookie, então as visitas
seguintes dispensam o token na URL.

## Uso

A página abre na lista de sessões vivas, cada uma rotulada pelo diretório do projeto. Ao
entrar numa delas você vê:

- **você / claude** — o que foi mandado e o que o Claude respondeu pela tool `reply`.
- **régua de atividade** — a ferramenta e o alvo de cada passo, com `…` enquanto roda.
- **card de permissão** — em fundo âmbar, com `permitir` e `negar`.

O que o Claude escreve no terminal **não** chega na página: só o texto passado para `reply`.
Isso é do protocolo de canal, e as instruções do MCP server já orientam o Claude a usá-lo.

## Segurança

O token é a única barreira, e essa página aprova `Bash`. Quem tiver o link executa código
na sua máquina.

- Requisição sem token válido recebe **404**, nunca 401 — não confirma que o serviço existe.
- Comparação do token em tempo constante (`timingSafeEqual`).
- O hub escuta em `0.0.0.0:7777`, que é o que o torna alcançável da LAN.

Numa rede que não é só sua, feche o resto:

```
sudo ufw allow from 192.168.0.0/24 to any port 7777
```

Para revogar o acesso, apague `~/.claude/local-session/config.json` e reinicie as sessões —
um token novo é gerado e todos os links antigos param de funcionar.

## Se algo não aparecer

**Mando prompt e nada acontece, mas a mensagem aparece no meu próprio feed.** O prompt chegou
ao `server.ts` — o eco só é registrado quando a entrega dá certo — e foi descartado pelo Claude
Code. Falta alguma das três camadas. O log diz exatamente qual:

```bash
grep -h "Channel notifications skipped" \
  ~/.cache/claude-cli-nodejs/*/mcp-logs-plugin-local-session-*/*.jsonl | tail -1
```

| Mensagem no log                                   | Camada faltando |
| ------------------------------------------------- | --------------- |
| `channels not enabled by org policy`              | `channelsEnabled` (passo 1) |
| `not on the approved channels allowlist`          | `allowedChannelPlugins` (passo 1) |
| `not in --channels list for this session`         | a flag `--channels` (passo 2) |

As duas primeiras exigem reiniciar a sessão depois de corrigir: managed settings só são lidas
na inicialização.

**O Claude recebe o prompt, trabalha, mas a resposta não chega.** Ele está parado no pedido de
permissão da tool `reply` — o card aparece na própria página, em âmbar. Aprove ali, ou libere
a tool de vez pelo passo 3 do pré-requisito.

**A sessão não aparece na lista.** O MCP server não subiu. Rode `/mcp` e veja se
`local-session` está conectado; o stderr dele mostra falhas de conexão com o hub.

**A sessão aparece, mas a régua de atividade fica vazia.** Os hooks não estão executando.
Eles invocam `bun` pelo `PATH` e falham em silêncio de propósito — hook barulhento trava a
sessão. Confirme com `bun --version` e, se o binário não estiver no `PATH` do Claude Code,
troque `bun` pelo caminho absoluto nos quatro comandos de `hooks/hooks.json`.

**Nada carrega no celular.** Confirme que o celular está na mesma rede e que a porta está
aberta: `curl -o /dev/null -w '%{http_code}' "http://192.168.0.42:7777/?t=<token>"` deve
responder `200` da própria máquina.

## Configuração

| Variável              | Efeito                                              |
| --------------------- | --------------------------------------------------- |
| `LOCAL_SESSION_DIR`   | Onde fica o `config.json` (padrão `~/.claude/local-session`) |
| `LOCAL_SESSION_PORT`  | Porta do hub, sobrepondo a do arquivo (padrão 7777) |

## Desenvolvimento

```
bun install
bun test          # unitários + integração (sobe o hub num porta efêmera)
bunx tsc --noEmit # checagem de tipos
bun run hub       # sobe o hub no primeiro plano, para depurar
```

Estrutura:

| Arquivo             | Responsabilidade                                  |
| ------------------- | ------------------------------------------------- |
| `src/server.ts`     | MCP stdio — ponte entre o Claude Code e o hub     |
| `src/hub.ts`        | Daemon HTTP/WebSocket, roteamento e assets        |
| `src/hub-state.ts`  | Registro de sessões e feed (sem I/O, testável)    |
| `src/hub-client.ts` | Cliente WebSocket com backoff e spawn do daemon   |
| `src/config.ts`     | Token, porta, IP da rota default                  |
| `src/hook-event.ts` | Payload de hook → evento de atividade             |
| `hooks/report.ts`   | Hook: lê stdin, faz POST, falha em silêncio       |
| `web/`              | UI estática, sem framework nem build              |
| `src/setup-core.ts` | Merges de configuração, sem I/O (testável)        |
| `scripts/setup.ts`  | Aplica a configuração; eleva com `sudo` ou `pkexec` |
| `install.sh`        | Instalador de máquina nova — casca fina sobre o setup |

O design completo está em `docs/superpowers/specs/2026-08-07-claude-local-session-design.md`.

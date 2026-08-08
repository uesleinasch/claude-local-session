# Roadmap

O que já existe cobre acompanhar, decidir com contexto e trabalhar de longe dentro da LAN
(markdown, diff no card de permissão, histórico persistente, fila offline, nova sessão e
interrupção via tmux). Este documento lista o que vem depois, em ordem de impacto.

## 1. Sair da LAN

- ~~**Tailscale na tool `link`**~~ — feito: a tool detecta o IPv4 da faixa CGNAT
  (100.64/10) e oferece o endereço da tailnet junto com o da LAN. Acessa de qualquer
  lugar sem expor a porta 7777 à internet; resolve inclusive LAN com bloqueio de
  tráfego entre clientes (firewall de endpoint, isolamento de mesh).
- **HTTPS opcional** — hoje o token viaja em texto claro; aceitável dentro de uma VPN,
  não fora dela. Certificado autoassinado ou o TLS do próprio Tailscale (`tailscale cert`).
  HTTPS também é pré-requisito de Web Push e de PWA instalável em iOS.

## 2. Ser avisado em vez de vigiar

- ~~**Push via ntfy.sh**~~ — feito: com `notifyUrl` no `config.json`, o hub publica no
  tópico ntfy a cada pedido de permissão, pergunta, `reply` e fim de turno. Quem posta é o
  hub, então o aviso independe de página aberta ou WebSocket vivo. Publicação por JSON no
  servidor (título com acento não caberia em header latin-1) e dedupe por evento, já que
  um mesmo pedido de permissão é reemitido quando o preview chega depois.
- **Gotify** — mesmo lugar do `notifyUrl`, formato de payload diferente (`/message` com
  token). Só vale se o ntfy não servir.
- **Web Push nativo** — sem app de terceiros, mas exige HTTPS + service worker + VAPID.
  Depois do item 1.
- **PWA** — manifest + service worker: ícone na home do celular, tela cheia. Pré-requisito
  do Web Push.
- ~~**Badges na lista de sessões**~~ — feito: `waiting` e `lastEventAt` no `SessionSummary`
  viram "aguardando você", "trabalhando", "ociosa há N min" e "encerrada". O texto é uma
  função pura (`web/session-status.js`), e a lista se redesenha de minuto em minuto para o
  tempo não congelar sem evento novo.

## 3. Limitações do protocolo de canal (verificado em 2026-08-07)

O protocolo experimental documenta apenas prompt-in (`notifications/claude/channel`),
pedido de permissão e decisão allow/deny
([channels-reference](https://code.claude.com/docs/en/channels-reference)). Não existe hoje:

- **Interrupção de turno via canal** — não documentado. Por isso o botão "parar" usa
  `tmux send-keys Escape` no pane da sessão; funciona para qualquer sessão dentro de tmux
  e para as spawnadas pela página. Se o protocolo ganhar um método nativo, migrar.
- ~~**AskUserQuestion via canal**~~ — perguntas de múltipla escolha continuam não chegando
  ao canal, mas o plugin contorna: o hook `PreToolUse` captura a pergunta completa
  (`tool_input.questions` + `tool_use_id`), a página mostra o card com as opções, e a
  resposta vira teclas no pane do tmux (dígitos/Tab/Enter, texto literal para "Other") —
  mesmo braço remoto do botão "parar". `PostToolUse` traz as respostas e resolve o card,
  respondido de qualquer lado. Fora do tmux o card é somente leitura. Se o protocolo
  ganhar um método nativo, migrar.
- **Sessão interativa sem TTY** — `claude --channels` headless morre com erro de stdin
  (issues [#30447](https://github.com/anthropics/claude-code/issues/30447) e
  [#40726](https://github.com/anthropics/claude-code/issues/40726)); tmux é a solução
  prática e é o que o spawn remoto usa.

## 4. Refinamentos do que já existe

- ~~**Reconectar ao voltar para a página**~~ — feito: o hub derruba o socket após 120s sem
  tráfego e o celular congela os timers da aba em segundo plano, então o retry agendado
  pelo `onclose` podia nunca disparar — só o refresh manual reconectava. Agora um ping a
  cada 45s segura a conexão, `visibilitychange`/`pageshow`/`online` reconectam na hora, e a
  ausência de `pong` denuncia o socket que voltou do sono como aberto mas morto.

- ~~**systemd user unit para o hub**~~ — feito: o `setup` (e portanto o `install.sh`) já
  grava a unit de usuário, habilita, inicia e liga o *linger* — instalar não tem passo
  extra; `--no-service` pula. `/local-session:service` existe para reconfigurar depois.
  Sem linger o serviço de usuário morre com o logout, que é exatamente o caso do reboot sem
  login. `Restart=on-failure` porque sair de porta ocupada é saída normal, não erro. A unit
  aponta para um diretório de versão, então `/local-session:update` avisa quando ela fica
  órfã.
- ~~**`/local-session:update`**~~ — feito: espelha `src/web/hooks/commands` + `plugin.json`
  em todos os diretórios do cache, mata o hub pelo PID vindo do `ss` (nunca por padrão de
  texto — `pkill -f` com o caminho no padrão mata o próprio shell) e espera o novo subir.
- **Hub que se auto-encerra ao ver versão nova no cache** — eliminaria o passo de matar:
  o hub compararia a própria versão com a maior do cache e sairia sozinho. Só vale a pena
  se o `update` se mostrar frágil na prática.

- **Diff real no card de permissão** — hoje o preview de `Edit` mostra os blocos antigo/novo
  prefixados com `-`/`+`; um diff de linhas (LCS) marcaria só o que mudou.
- **Navegar histórico antigo** — os `.jsonl` de `~/.claude/local-session/history/` ficam em
  disco, mas o hub só hidrata os das últimas 48h; falta UI para abrir sessões mais antigas.
- **Render incremental do feed** — `renderFeed()` reconstrói o DOM a cada evento dentro de
  um `aria-live`; leitores de tela reanunciam o feed inteiro.
- **Limite de tamanho de mensagem no hub** — um portador do token pode mandar payloads
  grandes; hoje coberto pelo modelo de ameaça (token = confiança total), mas vale um teto.

## 5. Produtividade e experiência (avaliação de 2026-08-08)

Quatro fraquezas que a avaliação expôs: a página vê a **conversa, não o trabalho** (o que o
Claude escreve no terminal não chega, então "o que ele mexeu no meu repo?" não tem resposta
na tela); o `auto` é **tudo-ou-nada** (aprovar cada `Read` na mão ou liberar `rm -rf` sem
olhar); **escrever no celular é caro**; e o feed é **plano**, sem colapso nem busca.

- **Permissão por ferramenta** — no card, "sempre permitir `Read` nesta sessão". Libera o
  ruído (leitura, busca) e mantém `Bash`/`Edit` sob os olhos. Mais seguro que o `auto` de
  hoje e mais confortável; provavelmente o que mais muda o uso diário.
- **Aprovar pela notificação** — o ntfy dispara ações HTTP: o push de permissão chega com
  *permitir* / *negar* e a decisão sai da tela de bloqueio. A ação **não pode carregar o
  token do hub** (quem tem o tópico teria a chave da máquina) — nonce por pedido, preso ao
  `requestId` e com validade curta.
- **"O que mudou"** — `git -C <cwd> diff --stat` (e o diff sob demanda) mostrado com a UI de
  diff que o card de permissão já tem. Leitura pura, o hub já sabe o `cwd`.
- **Prompts de um toque** — chips acima do composer (`continuar`, `rodar os testes`,
  `commitar`, `resuma o diff`) e reenvio de um prompt anterior. Corta a digitação no celular.
- **Mandar foto** — fotografar um erro na tela e mandar. O canal só aceita texto, então o
  hub grava o arquivo e o prompt referencia o caminho; o Claude abre com `Read`.
- **Colapsar rajadas no feed** — "12 leituras de arquivo" numa linha expansível, com busca
  dentro da sessão. Junto com o render incremental do item 4.
- **Menores** — renomear e fixar sessões (o rótulo é só o nome da pasta), feed unificado de
  todas as sessões, tempo do turno em andamento, e ditado por voz (a API do navegador exige
  contexto seguro, então depende do HTTPS do item 1).

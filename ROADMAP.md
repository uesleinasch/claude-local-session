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
- **Badges na lista de sessões** — "aguardando permissão", "ociosa há N min", última
  atividade. O hub já tem os dados; falta expor no `SessionSummary` e renderizar.

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

- **systemd user unit para o hub** — com spawn configurado o hub já é serviço
  permanente, mas após um reboot da máquina nada o inicia até a primeira sessão de
  terminal. Um `systemctl --user enable` fecharia o ciclo: celular funciona desde o boot.
- **`/local-session:update`** — a atualização hoje exige bump de versão (sem ele o
  `plugin install` mantém o snapshot), reinstalar, e trocar o hub vencendo a corrida
  contra os respawners das sessões antigas (`hub-client` respawna do próprio root no
  instante em que a porta vaga). Um comando que faça a dança inteira — e um hub que
  se auto-encerre ao detectar versão mais nova no cache — eliminam o atrito.

- **Diff real no card de permissão** — hoje o preview de `Edit` mostra os blocos antigo/novo
  prefixados com `-`/`+`; um diff de linhas (LCS) marcaria só o que mudou.
- **Navegar histórico antigo** — os `.jsonl` de `~/.claude/local-session/history/` ficam em
  disco, mas o hub só hidrata os das últimas 48h; falta UI para abrir sessões mais antigas.
- **Render incremental do feed** — `renderFeed()` reconstrói o DOM a cada evento dentro de
  um `aria-live`; leitores de tela reanunciam o feed inteiro.
- **Limite de tamanho de mensagem no hub** — um portador do token pode mandar payloads
  grandes; hoje coberto pelo modelo de ameaça (token = confiança total), mas vale um teto.

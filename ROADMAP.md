# Roadmap

O que já existe cobre acompanhar, decidir com contexto e trabalhar de longe dentro da LAN
(markdown, diff no card de permissão, histórico persistente, fila offline, nova sessão e
interrupção via tmux). Este documento lista o que vem depois, em ordem de impacto.

## 1. Sair da LAN

- ~~**Tailscale na tool `link`**~~ — feito: a tool detecta o IPv4 da faixa CGNAT
  (100.64/10) e oferece o endereço da tailnet junto com o da LAN. Acessa de qualquer
  lugar sem expor a porta 7777 à internet; resolve inclusive LAN com bloqueio de
  tráfego entre clientes (firewall de endpoint, isolamento de mesh).
- ~~**Estado do Tailscale na tool `link`**~~ — feito: `src/tailscale.ts` lê o
  `tailscale status --json` (com timeout de 500ms, senão um `tailscaled` pendurado travaria
  uma tool interativa) e separa "não instalado", "desligado" e "sem autenticação", cada um
  com o comando que resolve. Antes os três eram o mesmo silêncio, porque a detecção por faixa
  CGNAT só sabe dizer se existe um IP `100.x`. Conectado, a URL sai pelo nome do MagicDNS
  (`Self.DNSName`, aparando o ponto final do FQDN) em vez do IP — mais fácil de digitar no
  celular e estável. Binário fora do PATH com a tailnet de pé continua mostrando o endereço
  pelo IP: interface de rede vale mais que ausência de binário, senão o mesmo tropeço que o
  `bun` dos hooks dá viraria "instale o que já está instalado".
- **HTTPS opcional** — hoje o token viaja em texto claro; aceitável dentro de uma VPN,
  não fora dela. Certificado autoassinado ou o TLS do próprio Tailscale (`tailscale cert`).
  HTTPS também é pré-requisito de Web Push e de PWA instalável em iOS.
- **HTTPS pelo `tailscale serve`** — provavelmente o caminho mais curto para o item acima:
  publica o `127.0.0.1:7777` como HTTPS com certificado **válido** dentro da tailnet, sem
  autoassinado e sem o hub precisar escutar em `0.0.0.0`. O subcomando existe na 1.98.10
  (verificado em 2026-08-21); falta confirmar se depende de "HTTPS Certificates" habilitado
  no admin console da tailnet. Com ele, PWA, Web Push e ditado por voz saem do bloqueio de
  uma vez.

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
- ~~**"O que mudou"**~~ — feito: o botão `⑂ mudanças` abre `git status --short` (com
  não rastreados, que não aparecem no `git diff` — sem eles "criei o arquivo X" se lê como
  "nada mudou"), o `--stat` e o diff colorido, cortado em 40 mil caracteres.
- ~~**Prompts de um toque**~~ — feito: chips vindos do hub (`quickPrompts` no config, com
  padrões embutidos) enviam com um toque só, e cada prompt do feed ganha `↻ reenviar`.
  Nenhum padrão tem efeito colateral, porque um toque acidental manda de verdade.
- ~~**Mandar foto**~~ — feito: `POST /_upload` grava em `~/.claude/local-session/uploads/` e
  o prompt sai com o caminho. O tipo é decidido pelos **bytes** (PNG/JPEG/GIF/WebP), nunca
  pelo nome ou content-type, e o nome do arquivo é derivado da sessão — o original vem de
  fora. Teto de 8 MB. Falta: limpeza dos uploads antigos, que hoje ficam para sempre.
- ~~**Terminal remoto**~~ — feito: o botão `▮ terminal` abre um shell tmux no diretório da
  sessão. O tmux é o emulador (nada de emular VT100 no navegador): o `pipe-pane` despeja o
  output cru num fifo, o hub lê e repassa pelo WebSocket, e o xterm.js desenha. O terminal
  pertence ao **diretório**, não à sessão — sobrevive à página, ao hub e ao fim da sessão do
  Claude, e só o `✕ encerrar` o mata. Entrada por linha mais uma fileira de teclas de
  controle, porque a captura tecla a tecla do xterm briga com o teclado virtual do Android.
  Pontos a saber: `send-keys`/`capture-pane`/`pipe-pane` **recusam** `=nome` como alvo e
  exigem o id do pane (`%12`); e na abertura o pipe entra antes da foto da tela, o que pode
  repetir alguns bytes em vez de perdê-los.
- **Colapsar rajadas no feed** — "12 leituras de arquivo" numa linha expansível, com busca
  dentro da sessão. Junto com o render incremental do item 4.
- **Menores** — renomear e fixar sessões (o rótulo é só o nome da pasta), feed unificado de
  todas as sessões, tempo do turno em andamento, e ditado por voz (a API do navegador exige
  contexto seguro, então depende do HTTPS do item 1).

## 6. Instalar na máquina de outra pessoa (desenho de 2026-08-21, sem data de implantação)

Hoje instalar exige `git clone` ou `curl | bash`, ter o `bun` no PATH e um `sudo` para o
managed-settings. Serve para quem leu o README inteiro, não para quem só quer usar. A meta é
`apt install` e pronto.

Um teto que nenhum empacotamento dissolve: o valor depende do Claude Code rodando na máquina —
`src/server.ts` só existe dentro de uma sessão (MCP stdio), o canal só liga pelo
`managed-settings.json` do sistema e a flag `--channels` é por sessão. Um app autônomo, sem
Claude Code, foi considerado e **descartado**: sobraria um servidor web sem nada para servir.

Ordem: o binário é o conteúdo do pacote, e a bandeja só vale depois que o pacote existir.

- **Binário único (`bun build --compile`)** — tira o `bun` do PATH da equação, e com ele uma
  classe de falha silenciosa real: os hooks invocam `bun` pelo PATH e engolem o erro de
  propósito, então `bun` ausente aparece como "a régua de atividade fica vazia" e mais nada.
  Dois pontos de quebra a resolver antes: `src/hub.ts:38-39` acha o `web/` por
  `import.meta.dir`, então os assets passariam a ser embutidos em vez de lidos do disco — o que
  também derruba a conveniência de editar `web/` e ver na hora, hoje usada no desenvolvimento; e
  `src/hub-client.ts:104` respawna o daemon com
  `spawn(process.execPath, [join(root, 'src', 'hub.ts')])`, caminho que não existe dentro de um
  binário, então o spawn viraria o próprio executável com um argv (`local-session hub`). Custo a
  medir: o tamanho, com o `web/vendor/` (xterm.js) embutido.
- **Pacote nativo (`.deb`/`.rpm`)** — o `postinst` roda com privilégio, então escreve o
  `/etc/claude-code/managed-settings.json` sem diálogo de senha, instala a unit do systemd e
  declara `tmux` como dependência de pacote em vez de descobri-lo em runtime (`Bun.which`, em
  `src/hub.ts:71-74`), onde a ausência hoje só apaga botões da página sem dizer por quê. O que
  ele **não** resolve, e é a incógnita que decide a viabilidade: o plugin é registrado por
  usuário (`~/.claude/plugins/cache/<marketplace>/<plugin>/<versão>`) e o `marketplace.json` de
  hoje aponta para o GitHub — falta verificar se o Claude Code aceita marketplace a partir de um
  caminho de disco, que é o que permitiria ao pacote entregar o plugin de `/usr/lib` sem rede.
  A função de shell do `--channels` também é por usuário: fica num passo pós-instalação (o
  `/local-session:setup` de hoje), não no `postinst`.
- **Flatpak, Snap e AppImage não servem** — o trabalho do hub é justamente rodar `tmux`, `git` e
  `claude` do host, e o sandbox do Flatpak e do Snap existe para impedir exatamente isso. O
  AppImage não tem `postinst`, então não escreve o managed-settings nem instala a unit; vale como
  transporte do binário para quem não usa `apt`/`dnf`, nada além.
- **Tailscale como opt-in detectado, nunca instalação automática** — decidido em 2026-08-21.
  O `tailscale` não está nos repos do Ubuntu/Debian (vem de `pkgs.tailscale.com`), então
  `Depends: tailscale` faria o **nosso** pacote falhar numa máquina limpa; o `postinst` teria
  de adicionar um repositório de terceiros para contornar. E o passo que trava não é instalar,
  é **logar**: `tailscale up` exige autenticação interativa e o celular precisa entrar na
  mesma tailnet, trabalho em outro aparelho, fora do alcance de qualquer `postinst`. Somado ao
  daemon de rede e ao DNS que o Tailscale reconfigura — conflito real com VPN corporativa —
  a decisão é oferecer, não instalar. A tool `link` já detecta e ensina os passos; a bandeja
  mostraria o mesmo estado com um botão.
- **Bandeja com o estado do hub** — depois do pacote, é o que troca "leia o README e rode um
  comando" por uma janela: hub de pé ou não, o link com QR code para o celular ler (hoje o
  caminho é pedir o link ao Claude e digitar à mão), ligar e desligar o serviço, e as três
  camadas do canal com ✓ ou ✗ em vez de um `grep` no log. Decisão de produto mais que de
  engenharia: cria uma dependência de toolkit gráfico que o projeto hoje não tem.

Nada disso foi sondado ainda — as duas medições que faltam são se o `--compile` sobe e serve a
página de fato (e em quantos MB), e se o marketplace aceita caminho de disco.

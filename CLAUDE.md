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
bun run ui                      # a interface Electron, do fonte
bun run ui:install              # baixa o Electron (o --silent do npm pula o postinstall)
bun scripts/update.ts           # deploy local (ver "A dança do deploy")
bun scripts/update.ts --check   # o que aconteceria, sem mexer
bun scripts/setup.ts            # configura as 3 camadas de canal na máquina
bun scripts/service.ts          # unit de usuário do systemd para o hub
```

O cliente Android vive em `mobile/` e tem toolchain própria — nada aqui depende de o Flutter
estar instalado:

```bash
cd mobile && flutter test       # núcleos puros do app
cd mobile && flutter analyze    # checagem estática do Dart
cd mobile && flutter build apk --debug
adb install -r mobile/build/app/outputs/flutter-apk/app-debug.apk
bun scripts/mobile-icones.ts    # rasteriza os mipmaps (exige inkscape)
bun scripts/release-apk.ts --check
```

Release é **por tag**, e quem publica é o GitHub Actions (`.github/workflows/release.yml`):

```bash
bun scripts/conferir-tag.ts v0.13.1              # a tag bate com o código?
git tag -a v0.13.1 -m "título" -m "notas em markdown" && git push origin v0.13.1
git tag -a app-v1.1.1 -m "app 1.1.1" && git push origin app-v1.1.1
gh workflow run release -f tag=v0.13.1           # ensaio: tudo menos publicar
```

## Um ponto de entrada, oito subcomandos

Hub, MCP server, os dois hooks e os scripts de configuração são **um programa só**:
`src/cli.ts` despacha por `process.argv[2]` (`hub`, `mcp`, `hook`, `context-hook`, `setup`,
`service`, `managed-settings`, `status`, em `src/cli-core.ts`). `bun build --compile` aceita um entrypoint só, e um executável
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

`bun run package` monta o `.deb` (111 MB comprimidos — 92 MB de binário mais o Electron da
seção seguinte). Os destinos, e o motivo medido da divisão:

| caminho | o quê |
| --- | --- |
| `/usr/bin/local-session` | o executável |
| `/usr/share/local-session/` | `.claude-plugin/`, `commands/`, `bin/`, e de `hooks/` **só** o `hooks.json` |
| `/usr/lib/systemd/user/local-session-hub.service` | unit disponível a todo usuário, ativa só para quem der `enable` |
| `/usr/lib/local-session-ui/` | o Electron renomeado + o app em `resources/app` |
| `/usr/bin/local-session-ui` | shim que chama o de cima |
| `/usr/share/applications/`, `/usr/share/icons/…` | entrada de menu e ícone |

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

## A interface (`desktop/`)

App Electron de bandeja e janela, empacotado **dentro do mesmo `.deb`** — não há
pacote `electron` nos repos do Debian/Ubuntu (verificado em 2026-09-21) para se declarar como
dependência, então ele viaja junto e o pacote passa de 26 MB para ~111 MB. As bibliotecas que
o Electron carrega (`libgtk-3-0`, `libnss3`, `libxtst6`, …) **são** `Depends`: sem elas o app
falha com símbolo faltando, não com mensagem.

O app é **casca**. Ele não sabe diagnosticar nada: roda `local-session status --json` e desenha
o resultado. Toda a regra vive em `src/status-core.ts`, puro e testado, e é o mesmo conteúdo do
`local-session status` em texto. Um segundo diagnóstico, em JavaScript, divergiria do primeiro
no dia seguinte.

- **`desktop/core.js`** é o núcleo puro (testado por `tests/desktop-core.test.ts`, via
  `desktop/core.d.ts`): a allowlist de ações, a busca do binário e os textos da bandeja.
- **A janela nunca manda linha de comando.** O renderer envia um **id** de ação, e o processo
  principal o resolve contra `ACTIONS`. A consulta usa `Object.hasOwn` — `ACTIONS['__proto__']`
  devolveria um objeto herdado e furaria a allowlist. `contextIsolation`, `sandbox` e
  `nodeIntegration: false` completam o cerco, e o CSP da página proíbe qualquer origem externa.
- **`abrir-link` só aceita as URLs que o próprio hub montou**: o renderer não escolhe endereço.
- `local-session managed-settings --apply` é a única ação que passa por `pkexec` — escrever em
  `/etc` exige privilégio e não há TTY para o sudo pedir senha.

A busca do binário repete a ordem do shim `bin/local-session` (repo, sistema, PATH). Manter as
duas em sincronia é o que faz o app funcionar tanto instalado quanto rodando do clone.

A janela é dividida em cinco seções — situação, acesso, dependências, serviço, canal — porque
uma lista corrida de dez verificações e oito botões de peso igual não se lê. Cada `Check` carrega
a `section` a que pertence (`src/status-core.ts`), as abas de dependências e canal mostram um
contador do que não está ok, e a seção "situação" repete cada pendência como atalho para a seção
que a resolve. Uma ação primária por seção, e só ela tem cor.

**Instalar dependência passa por `pkexec`, nunca por um campo de senha nosso.** A senha fica no
diálogo do sistema: não passa pela memória do app, não vai para swap nem crash dump, e ninguém
se acostuma a digitar senha de root numa janela qualquer. O nome do pacote é validado contra
`/^[a-z0-9][a-z0-9+.-]*$/` antes de virar argv de root — a lista vem da UI.

O QR code sai do `qrencode` (dependência do pacote) como **PNG em `data:` URI**, não SVG por
`innerHTML`: o CSP já libera `img-src data:` e nada de marcação externa entra no DOM. Só as URLs
que o próprio hub montou viram QR. Sem o `qrencode` a seção mostra o botão que o instala; com
ele instalado e ainda assim sem imagem, a mensagem diz isso em vez de mandar instalar de novo.

O autostart da bandeja é um `.desktop` em `~/.config/autostart/`, escrito pela própria janela —
**não** em `/etc/xdg/autostart/`, que ligaria o ícone para todo usuário da máquina. Ele sobe com
`--tray`, sem abrir janela na cara de quem acabou de logar. O serviço do hub é outra coisa e
continua sendo systemd.

## O cliente Android (`mobile/`)

App Flutter que **encapsula a mesma página** que o hub serve. Nativo é só o que a página não
consegue fazer por si: achar o hub, guardar o token e falar com o Android. Reimplementar o feed
em Dart daria a `src/protocol.ts` um terceiro cliente para esquecer de atualizar.

O que decide o desenho é a fronteira de segurança: **toda requisição ao hub exige token, e sem
ele a resposta é 404**. Então o endereço é descoberto sozinho, mas o token entra **uma vez**,
pelo QR que a janela Electron já gera — `lerLink` (`lib/pareamento/link.dart`) lê exatamente a
URL `http://host:7777/?t=…` que ela produz. Nem o Electron nem o hub mudaram para isso.

- **A corrida** (`lib/descoberta/candidatos.dart`): o app tenta todos os endereços conhecidos em
  paralelo e fica com o primeiro que responder o `/_endpoints`. A resposta do vencedor renova a
  lista, então trocar de IP por DHCP se corrige sozinho enquanto **alguma** rota funcionar.
- **`rotuloDoHost` existe por causa do filtro de rede**: o QR não diz se aquele endereço é LAN ou
  tailnet, e sem classificar pela faixa CGNAT (a mesma de `isCgnat`, em `src/config.ts`) o modo
  "só VPN" descartaria justamente o endereço pareado.
- **Falhar é ambíguo de propósito**: token errado e "não é o hub" são o mesmo 404, então a tela de
  erro cita as duas causas em vez de adivinhar uma.
- **`network_security_config.xml`** libera texto claro. Sem ele o Android 9+ recusa HTTP e o erro
  não explica nada. Some quando o hub tiver HTTPS.
- **`flutter_inappwebview`, não `webview_flutter`**: só o primeiro implementa
  `onShowFileChooser`, sem o qual o `<input type="file">` da página fica inerte e anexar imagem
  não funciona dentro do app.
- O núcleo puro leva a sonda como parâmetro (`correr(candidatos, sonda)`), igual a
  `tailscaleAddress(nets = …)`. `flutter test` cobre os núcleos; `bun test` não depende do
  Flutter estar instalado.

O que o nativo acrescenta à página, e o preço de cada um:

- **Ponte `window.localSession`** (fim de `web/app.js`): `inserirNoComposer` e `sessaoAtual`, só
  isso. É contrato entre dois repositórios de código que nada liga em tempo de build — daí
  `tests/ponte-mobile.test.ts` falhar se um dos nomes sumir do `app.js`. Imagem compartilhada
  **não** passa por aqui: sobe pela rota `/_upload` e só o caminho volta pela ponte, porque uma
  foto de vários MB atravessando `evaluateJavascript` é pedir para quebrar.
- **Download** vai pelo `DownloadManager` do sistema (canal `local_session/download` no
  `MainActivity.kt`), com o cookie do token copiado do `CookieManager` da WebView: o
  download roda em outro processo, que sem isso levaria 404. O nome passa por
  `nomeDoDownload`, que tira qualquer `/` antes de virar caminho em Downloads.
- **Avisos com o app fechado**: sem FCM não há push, então é serviço em primeiro plano assinando
  o tópico ntfy que o hub já publica — e o Android cobra por isso uma notificação permanente na
  barra. Por isso é opt-in nos ajustes, desligado por padrão. O tópico vem do `/_endpoints`, não
  de uma segunda configuração no celular.

### Ícone, splash e release

O ícone legado sai do **mesmo** `desktop/icon.svg` das duas interfaces; só a camada adaptativa
tem arquivo próprio (`mobile/icone/frente.svg`), porque o Android come a borda do canvas de
108dp e o traçado do desktop, que vai quase até o limite, apareceria cortado.
`bun scripts/mobile-icones.ts` rasteriza os dois com `inkscape`.

Três precedências de recurso que fazem o trabalho parecer não ter surtido efeito, todas
guardadas por `tests/mobile-recursos.test.ts`:

- **`drawable-v21/` vence `drawable/`** em qualquer aparelho moderno: mexer só no segundo deixa
  a splash branca do template valendo na prática;
- **`night` vence `version`**, então os atributos de splash do Android 12+ precisam existir em
  `values-v31/` **e** em `values-night-v31/`;
- no Android 12+ o sistema **ignora** o `windowBackground` e desenha a própria splash — sem
  `windowSplashScreenBackground` e `windowSplashScreenAnimatedIcon`, abre em branco.

As releases saem do workflow `release`, disparado por tag: `v<semver>` publica o `.deb` como
`Latest`, e `app-v<semver>` publica o APK fora do `latest` (o README baixa o `.deb` de
`/releases/latest`). O primeiro job roda `scripts/conferir-tag.ts` (`conferirTag`, em
`src/release-core.ts`): a tag tem de bater com `plugin.json` **e** `package.json`, ou com o
`pubspec.yaml`, senão nada é compilado. Tag anotada vira título e notas da release; tag leve
cai no `--generate-notes`.

O job do app chama o mesmo `scripts/release-apk.ts`, que exige árvore limpa (APK de árvore suja
não se reproduz), recusa versão já publicada e **recusa publicar fora do CI** — `--local` é a
saída de emergência. A assinatura continua sendo a **chave de debug desta máquina**, que viaja
como o secret `ANDROID_DEBUG_KEYSTORE` (base64). O workflow compara o SHA-256 do certificado
com o valor fixado no YAML antes de compilar: um secret trocado geraria APK que o Android
recusa instalar por cima, e só se descobriria no celular. Trocar a chave exige atualizar os
dois juntos.

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
| `hub-state.ts` (registro, feed, urgência), `files.ts`, `notify.ts`, `hook-event.ts`, `context-report.ts`, `git-changes.ts`, `question-keys.ts`, `setup-core.ts`, `update-core.ts`, `upload.ts`, `tailscale.ts`, `trust.ts`, `cli-core.ts`, `web-assets.ts`, `plugin-meta.ts`, `package-core.ts`, `status-core.ts`, `endpoints.ts`, `release-core.ts`, `desktop/core.js` | `hub.ts`, `server.ts`, `hub-client.ts`, `history.ts`, `terminal.ts`, `cli.ts`, `scripts/*.ts`, `desktop/main.js` |
| `web/markdown.js`, `web/session-status.js`, `web/connection.js`, `web/browse-core.js` | `web/app.js`, `web/terminal-panel.js` |

## As três camadas do canal (por que "o prompt não chega")

O protocolo de canal do Claude Code vem desligado e é protegido em três níveis independentes.
Faltando qualquer um, o plugin instala, conecta, serve a página, registra a atividade — e o
prompt é **descartado em silêncio** antes de chegar ao modelo:

1. `/etc/claude-code/managed-settings.json` com `channelsEnabled` + `allowedChannelPlugins`
   (declarar essa chave **substitui** a allowlist padrão da Anthropic, não soma a ela — por isso
   `setup-core.ts` faz merge).
2. a flag por sessão `claude --channels plugin:local-session@unac` (sem equivalente em
   `settings.json`; daí a função de shell que o instalador escreve no rc). **Procurar o bloco só
   no rc principal dá falso positivo**: ele costuma acabar num arquivo que o rc carrega
   (`~/.zshrc.local` e afins), configurado e funcionando. `sourcedPaths` + `channelAliasPresent`
   em `src/setup-core.ts` olham os incluídos, e o `setup` não reescreve quando acha o bloco num
   deles — seriam duas definições da mesma função, e a última a carregar venceria.
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
- O navegador nunca envia caminho arbitrário: `spawn`, `browse`, `mkdir`, `copy`, `find` e
  `/_download` passam o caminho por `realpath` e só então comparam com a home e os
  `projectsRoot` (também resolvidos, em `BASES`). Comparar o texto cru deixaria um symlink
  apontando para `/` sair da área. Nome de pasta nova passa por `validName`
  (`src/files.ts`); colar nunca sobrescreve (`copyTarget`). As teclas do terminal são a
  allowlist `TERM_KEYS`.
- `find` (busca em subpastas) é assíncrono e tem prazo de 1,5 s: um `readdirSync` recursivo
  pela home travaria o hub para todas as sessões. Não segue symlink — é o que o mantém dentro
  da área sem checar cada resultado.
- `/_download` responde sempre `application/octet-stream` + `nosniff` + `attachment`: um
  `.html` do disco renderizado na origem do hub rodaria com o token.
- Upload é reconhecido pelos **bytes**, não pelo nome nem pelo content-type.
- `web/vendor/` é xterm.js/addon-fit de terceiros (MIT), servido com `cache-control: immutable`.
  Não editar.
- No app Android a WebView só navega para o host pareado (`podeNavegar`, em
  `mobile/lib/tela/navegacao.dart`): ali não existe barra de endereço, então um link do feed
  levaria a pessoa para fora do hub sem nenhum sinal na tela. Texto vindo de outro aparelho pela
  ponte entra como literal JSON (`chamadaInserir`), nunca concatenado no JS — a página roda
  autenticada com o token.

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

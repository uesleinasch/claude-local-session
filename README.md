# claude-local-session

[![release](https://img.shields.io/github/v/release/uesleinasch/claude-local-session?label=release)](https://github.com/uesleinasch/claude-local-session/releases/latest)
[![ci](https://github.com/uesleinasch/claude-local-session/actions/workflows/ci.yml/badge.svg?branch=Development)](https://github.com/uesleinasch/claude-local-session/actions/workflows/ci.yml)
[![licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-f5a524)](LICENSE)

Expõe cada sessão do Claude Code numa página web da sua rede local. Pelo navegador do
celular você manda prompt para a sessão, acompanha o que ela está executando e aprova ou
nega os pedidos de permissão.

**Página do projeto:** <https://uesleinasch.github.io/claude-local-session/>

> **In English:** a Claude Code plugin that puts every session on a web page in your local
> network. From your phone you can send prompts, follow what the session is running, answer its
> questions and approve or deny permission requests. It also ships a Linux package with a tray
> app and an Android client. The project is documented in Brazilian Portuguese; issues and pull
> requests in English are welcome.

> Projeto independente da comunidade, **sem afiliação com a Anthropic**. "Claude" e "Claude
> Code" são marcas da Anthropic.

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
qualquer sessão e se autoencerra 60s depois que a última sai — a menos que haja navegador
conectado ou spawn configurado (`projects`/`projectsRoot`), caso em que permanece de pé
como serviço, para a página continuar podendo criar sessões novas.

## Instalação

### Pelo pacote (Debian/Ubuntu)

Um `.deb` traz o executável, o serviço, a entrada de menu e a **interface de configuração**.
Baixe o pacote da [última release](https://github.com/uesleinasch/claude-local-session/releases/latest)
e instale:

```bash
gh release download --repo uesleinasch/claude-local-session --pattern '*.deb'
sudo apt install ./local-session_*_amd64.deb
local-session setup
```

Sem o `gh`, baixe o `.deb` pela página da release e rode as duas últimas linhas.

O `apt` faz o que é de root — binário em `/usr/bin`, `tmux` como dependência de pacote e o
`/etc/claude-code/managed-settings.json` sem diálogo de senha. O `local-session setup` faz o
que é por usuário e o pacote não tem como fazer por quem ainda nem logou: registra o plugin no
Claude Code, escreve o alias do canal e liga o serviço.

Depois disso, `local-session` no terminal diagnostica a instalação (`--json` para consumo por
programa) e **local-session** no menu de aplicativos abre a janela de configuração, com ícone
de bandeja, estado do hub e o link com token a um clique.

O pacote tem ~111 MB porque carrega o runtime do Bun e o Electron: nenhum dos dois está nos
repositórios do Debian/Ubuntu para ser declarado como dependência.

### Pelo instalador (qualquer Linux)

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
escreve no seu rc uma função que sobrepõe o comando:

```bash
claude() {
  case "$1" in
    plugin|mcp|config|update|doctor|install|migrate-installer|setup-token) command claude "$@" ;;
    *) command claude --channels plugin:local-session@unac "$@" ;;
  esac
}
```

É função em vez de alias de propósito: um alias injetaria `--channels` também nos
subcomandos (`claude plugin install …`), e a flag engoliria os argumentos seguintes.

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

Se a máquina estiver numa tailnet ([Tailscale](https://tailscale.com)), a tool `link` também
devolve o endereço da tailnet — com o app logado no celular, a página funciona de qualquer
lugar (4G, outra rede), sem expor a porta 7777 à internet. É também a saída quando a própria
LAN bloqueia tráfego entre clientes (firewall de endpoint corporativo, isolamento de mesh).

O endereço vem pelo nome do MagicDNS quando ele está ligado — `estacao.tail1234.ts.net`
é bem mais fácil de digitar no celular que `100.101.102.103`, e não muda. E se o Tailscale não
estiver ali, a tool não fica calada: ela diz em que pé está e o que fazer.

| Estado                            | O que a `link` responde                           |
| --------------------------------- | ------------------------------------------------- |
| conectado                         | a URL, por nome MagicDNS (ou IP, se estiver desligado) |
| instalado, desligado              | `sudo tailscale up`                               |
| instalado, sem autenticação       | `sudo tailscale up` e entrar com a conta do celular |
| não instalado                     | os três passos: `install.sh`, `tailscale up`, app no celular |

Sem `tailscale` no `PATH` mas com a tailnet de pé, o endereço ainda aparece (pelo IP): a
detecção lê as interfaces de rede, então o binário invisível não vira "não instalado".

## Uso

A página abre na lista de sessões vivas, cada uma rotulada pelo diretório do projeto. Cada
linha diz em que pé a sessão está, para você saber onde tocar antes de entrar:

| Marca             | Estado                                                        |
| ----------------- | ------------------------------------------------------------- |
| ● `aguardando você` | há permissão ou pergunta esperando resposta                  |
| ● `trabalhando`   | turno em andamento                                            |
| ○ `ociosa há N min` | parada desde o último evento — o tempo conta sozinho        |
| ○ `encerrada`     | sessão terminada, histórico ainda navegável                   |

Ao entrar numa sessão você vê:

- **você / claude** — o que foi mandado e o que o Claude respondeu pela tool `reply`,
  renderizada como markdown (código, listas, links).
- **régua de atividade** — a ferramenta e o alvo de cada passo, com um indicador girando enquanto roda.
- **card de permissão** — com o ícone de escudo, `negar` e `permitir`. Para `Edit`, `Write` e
  `Bash` o card mostra a operação inteira: diff colorido, conteúdo do arquivo ou comando
  completo, capturados pelo hook `PreToolUse`.
- **card de pergunta** — quando o Claude usa `AskUserQuestion`, as perguntas e opções
  aparecem na página e a resposta volta pela mesma via do botão de interromper (teclas no
  tmux). Suporta multiseleção e resposta livre.

**Janela de contexto.** Uma barra fina abaixo do header mostra o uso da janela de
contexto da sessão (âmbar até 79%, vermelha a partir de 80%), com percentual e tokens;
na lista, cada sessão exibe o percentual. A fonte é o statusline do Claude Code — o
único lugar com o percentual exato calculado para o modelo em uso: o script de
statusline repassa o JSON que já recebe para `hooks/context-report.ts`, que faz um POST
autenticado ao hub. Sem statusline configurado, a barra simplesmente não aparece.

**Trocar o modelo.** O botão de modelo no rodapé (ao lado de `enviar`) mostra o modelo
ativo e abre um dropup com Fable 5, Opus 5, Sonnet 5 e Haiku 4.5. Escolher envia
`/model <alias>` ao pane do tmux; em ~1-2s o statusline reporta o novo modelo e o botão
se atualiza. Como no terminal, `/model` **também salva o modelo como default das próximas
sessões** — o dropup avisa isso. Fora do tmux o botão não aparece.

**Prompts de um toque.** Acima do composer há uma fila de chips (`continuar`, `rodar os
testes`, `explique o que você fez`, `resuma o diff`, `o que falta?`). Um toque **envia na
hora** — por isso nenhum padrão tem efeito colateral: um esbarrão no bolso não commita nem
faz deploy. Para trocar a lista, a chave `quickPrompts` no `config.json`:

```json
{ "quickPrompts": ["continuar", "rodar os testes", "subir o servidor"] }
```

Até 8 chips, 200 caracteres cada; lista vazia ou ausente cai nos padrões. E cada prompt seu
no feed ganha um botão **reenviar**, que devolve o texto ao composer para editar e mandar de novo
— o histórico de prompts mais barato que existe.

**O que mudou.** O botão `⑂ mudanças` no rodapé abre o estado do repositório da sessão:
arquivos tocados (`git status --short`, incluindo os não rastreados), o resumo do
`git diff --stat` e o diff completo, colorido. É leitura pura — o hub só roda `git` no
diretório que a sessão já declarou. Diff acima de 40 mil caracteres é cortado com aviso.
Sessão fora de um repositório git diz isso em vez de falhar.

**Terminal remoto.** Ao lado dele, o botão `▮ terminal` abre um terminal de verdade no
diretório da sessão — um shell dentro de uma sessão `tmux` própria, com o output cru
chegando ao navegador pelo `pipe-pane` e desenhado pelo xterm.js. Não é foto de tela: cores,
barra de progresso e `\r` funcionam como no terminal. Você escreve no campo de baixo e a
fileira de teclas manda `Ctrl-C`, `Esc`, `Tab`, setas e companhia; teclado físico digita
direto na tela.

O terminal pertence ao **diretório**, não à sessão do Claude: ele sobrevive ao fechar da
página, ao restart do hub e ao fim da sessão. Você inicia um build, sai, volta depois e
encontra tudo rolando — e do terminal da máquina dá para anexar no mesmo shell com
`tmux attach -t lst-…`. Só o **encerrar** mata a sessão de verdade. A fronteira é a mesma da
nova sessão (sua home mais os `projectsRoot`), e as teclas de controle são uma allowlist:
o navegador não escolhe o que vai para a linha de comando do `tmux`.

**Mandar foto.** O clipe no campo de mensagem abre a câmera ou a galeria. A imagem sobe para
`~/.claude/local-session/uploads/` e o prompt sai com o caminho — o canal só transporta
texto, então o Claude abre o arquivo com `Read` como faria com qualquer arquivo do projeto.
O hub valida pelos **bytes**, não pelo nome ou content-type: PNG, JPEG, GIF e WebP passam,
o resto é recusado com 400. Teto de 8 MB. Os arquivos ficam no disco até você apagá-los.

**Auto mode.** O botão `auto` no topo do feed liga a aprovação automática de permissões
daquela sessão: cada pedido que chegar é aprovado pelo hub na hora e o card entra no feed
já resolvido como **permitido (auto)** — rastro completo, zero toque. Ligar o auto também
aprova o pedido que estiver pendente. Vale por sessão, pede confirmação ao ligar (aprova
QUALQUER coisa, inclusive comandos destrutivos) e volta ao normal se o hub reiniciar.
Perguntas do `AskUserQuestion` nunca são auto-respondidas.

**Começar no computador e seguir no celular.** O que você digita no terminal e o texto final
de cada resposta também aparecem no feed, marcados como "no terminal". Dá para sair do
computador no meio da tarefa e continuar pelo celular: a próxima mensagem enviada pela página
cai na mesma sessão, e daí em diante o Claude responde pelo `reply`. As mensagens
intermediárias do terminal e a saída das ferramentas não vêm para a página, só a régua de
atividade com o nome de cada uma. Os hooks são lidos quando a sessão começa, então sessões
abertas antes da atualização não espelham nada.

Prompt escrito sem conexão não se perde: entra numa fila local ("na fila", no feed) e é
entregue quando a página reconecta. O histórico de cada sessão também sobrevive a restarts
do hub — fica em `~/.claude/local-session/history/`, um `.jsonl` por sessão, e as sessões
das últimas 48h reaparecem na lista após um reboot.

## Trabalhar de longe

Dois recursos dependem do `tmux` estar instalado:

**Nova sessão pelo celular.** A lista de sessões ganha a seção **nova sessão**: um
navegador de diretórios que parte da sua home (`~`) — o nome navega, o botão de play abre uma
sessão ali, e a estrela marca o diretório como favorito. Favoritos ficam no topo como
atalho de um toque e são persistidos na chave `projects` do
`~/.claude/local-session/config.json` (dá para editá-la à mão também). A navegação e o
spawn ficam confinados à sua home; a chave opcional `projectsRoot` adiciona outras
áreas navegáveis fora dela:

```json
{
  "token": "…",
  "port": 7777,
  "projects": ["/home/voce/repos/meu-projeto"],
  "projectsRoot": ["/srv/projetos"]
}
```

Reinicie o hub (ele morre sozinho 60s depois da última sessão sair, ou `pkill -f src/hub.ts`)
e a lista de sessões ganha a seção **nova sessão**, com um botão por projeto. O hub roda
`tmux new-session -d claude --channels …` no diretório escolhido — a sessão nasce dentro de
um tmux seu, sobrevive ao hub e ao navegador, e você pode anexá-la depois no terminal com
`tmux attach`. A allowlist é comparada por igualdade exata: o navegador nunca envia um
caminho arbitrário. Sem `projects`, o recurso fica desligado.

**Arquivos pelo celular.** Os favoritos viram uma faixa de atalhos no topo: tocar num deles
abre a pasta, e **sessão aqui** inicia a sessão na pasta aberta. O caminho no alto é
clicável e a estrela ao lado favorita a pasta. A lista ordena por nome, data ou tamanho, e a
busca filtra a pasta aberta e, a partir de 2 letras, procura também nas subpastas (até 6
níveis, sem entrar em pastas ocultas nem `node_modules`). Os arquivos aparecem com o tamanho.
`+ pasta` cria uma pasta no diretório aberto; `⧉` copia uma pasta ou um arquivo, e a
barra **colar aqui** aparece em qualquer outra pasta até você colar ou cancelar. Colar
nunca sobrescreve: se o nome já existe, a cópia vira `nome (cópia)`, `nome (cópia 2)`… `↓`
baixa o arquivo. No app Android o download vai para **Downloads**, pelo gerenciador de
downloads do sistema. Tudo fica restrito à mesma área da navegação, e um symlink que
aponte para fora dela é recusado. Renomear, mover e apagar ainda não existem.

**Receber aviso no celular.** Quem publica é o hub, não o navegador — o aviso chega com a
página fechada, o celular bloqueado e nenhum WebSocket de pé. É o caminho para largar a
página e ser chamado quando ela precisa de você.

1. Escolha um nome de tópico longo e aleatório. Ele é a única credencial:

   ```
   openssl rand -hex 12   # ex.: local-session-9f2c1a7b4e8d0c35
   ```

2. Coloque em `~/.claude/local-session/config.json`:

   ```json
   {
     "token": "…",
     "port": 7777,
     "notifyUrl": "https://ntfy.sh/local-session-9f2c1a7b4e8d0c35"
   }
   ```

3. Reinicie o hub — ele lê a chave no boot (`pkill -f src/hub.ts`, ou mate o PID que
   escuta a porta: `ss -tlnp | grep 7777`).

4. Instale o app [ntfy](https://ntfy.sh) (Android/iOS) ou abra
   `https://ntfy.sh/local-session-9f2c1a7b4e8d0c35` no navegador, e inscreva-se no mesmo
   tópico. Para testar sem esperar um evento:

   ```
   curl -d "teste" https://ntfy.sh/local-session-9f2c1a7b4e8d0c35
   ```

O hub avisa em quatro momentos: pedido de permissão, pergunta do Claude
(`AskUserQuestion`), `reply` da sessão e fim de turno. Não avisa nos prompts que você mesmo
mandou nem a cada tool executada — seria um push por linha do feed. Um mesmo pedido de
permissão gera um único aviso, mesmo quando o card é reemitido com o preview.

Vale para qualquer servidor ntfy, inclusive self-hosted
(`"notifyUrl": "http://192.168.1.9/ntfy/avisos"`); o tópico é sempre a última parte do
caminho. Sem a chave, o hub não notifica nada.

> **O tópico é o segredo.** No ntfy.sh público, quem souber o nome lê seus avisos — e eles
> incluem o texto do `reply` e a descrição da tool. Nome curto ou adivinhável vaza o
> conteúdo do seu trabalho. Para algo mais forte, use um servidor ntfy próprio com
> autenticação.

**Hub de pé desde o boot.** Sem serviço, o hub só sobe junto com a primeira sessão do
Claude Code — depois de um reboot, a página fica muda até alguém abrir um terminal na
máquina. **O instalador já resolve isso**: `install.sh` e `/local-session:setup` instalam a
unit de usuário do systemd como parte da configuração, sem passo extra (use
`--no-service` para pular). O comando abaixo existe para reconfigurar depois:

```
/local-session:service            # instala, habilita e inicia
/local-session:service --check    # só diagnostica
/local-session:service --disable  # para e desabilita
```

Ele grava `~/.config/systemd/user/local-session-hub.service` apontando para o diretório
atual do plugin e liga o *linger* do seu usuário — sem linger, o serviço de usuário só
existe enquanto há sessão de login aberta, que é justamente o que falta depois de um
reboot sem ninguém logar. Se faltar privilégio para o linger, o script mostra o comando
com `sudo` para você rodar. Logs em `journalctl --user -u local-session-hub.service -f`.

A unit aponta para um diretório de versão específico — depois de atualizar o plugin, rode
`/local-session:update` (que avisa se a unit ficou órfã) ou o comando de serviço de novo.

**Interromper o turno.** O botão `■ parar` no topo do feed envia `Escape` para o pane do
tmux onde a sessão roda — o mesmo gesto que interromperia no terminal. Funciona para
qualquer sessão dentro de tmux (não só as spawnadas pela página); para sessões fora de
tmux o hub avisa que não há como interromper. O protocolo de canal do Claude Code não tem
interrupção nativa (ver `ROADMAP.md`).

**Responder perguntas do Claude.** Quando a sessão usa `AskUserQuestion` (pergunta de
múltipla escolha), o protocolo de canal não entrega a pergunta — mas o hook `PreToolUse`
sim. A página mostra o card com as perguntas e opções (inclusive multiseleção e resposta
livre) e traduz sua escolha em teclas no pane do tmux, como o botão de interromper.
Respondida no terminal ou na página, o card se resolve com as respostas; fora de tmux ele
fica somente leitura.

**Encerrar a sessão.** O item **encerrar** do menu da sessão finaliza a sessão e a remove da
lista (apagando o histórico dela): dentro de tmux, via `tmux kill-session`; fora, via
`SIGTERM` no processo do `claude` — o mesmo que fechá-lo no terminal. Numa sessão já
encerrada, o × do item na lista apenas limpa o item.

## O app de Android

`mobile/` é um cliente Flutter que abre direto na sessão: encapsula a mesma página, mas
encontra o hub sozinho. Você não digita endereço nem token.

**O pareamento é uma vez só.** Abra a janela do Local Session na máquina, vá em *acesso* e
aponte o app para o QR code. Ele guarda o token no armazenamento cifrado do Android — e a
partir daí só o endereço é redescoberto.

**A cada abertura o app corre atrás do hub.** Ele pergunta ao `/_endpoints` por quais
endereços o hub responde (IP da LAN, `<hostname>.local` e o nome da tailnet), tenta todos ao
mesmo tempo e fica com o primeiro que responder. Trocar de Wi-Fi para 4G, ou o roteador mudar
o IP por DHCP, não pede nenhuma ação sua. Em *ajustes* dá para limitar a busca a **só rede
local** ou **só VPN** — útil em Wi-Fi que isola os aparelhos, ou quando a VPN está lenta.

Se aparecer "não encontrei o hub", é uma destas três: a máquina está fora do ar, o celular não
está em nenhuma das redes, ou o token mudou (o hub responde 404 nos três casos, de propósito —
veja *Segurança*). Nesse último caso, escaneie o QR de novo.

**Compartilhar de outro app.** O Local Session aparece na folha de compartilhamento do Android:
mandar um texto cai direto no composer da sessão aberta, e mandar uma imagem sobe pela mesma
rota `/_upload` do clipe da página, deixando `imagem anexada: <caminho>` no composer. Anexar da
galeria ou tirar foto pelo clipe também funciona dentro do app.

**Ser avisado com o app fechado.** Em *ajustes*, "escutar os avisos da sessão" assina o tópico
ntfy que o hub já publica (a chave `notifyUrl` do `config.json`; sem ela o app explica o que
configurar). Sem FCM não existe push no Android, então manter a conexão exige um serviço em
primeiro plano — e o Android cobra por isso uma **notificação permanente na barra**, como o
próprio app do ntfy. Por isso vem desligado. Tocar no aviso abre o app, não a sessão específica:
o payload do ntfy leva o rótulo, não o id da sessão, e enfiá-lo no campo `click` mandaria um
endereço com token para um servidor de terceiros.

**Instalar sem cabo.** Abra https://uesleinasch.github.io/claude-local-session/app/ no
navegador do celular e toque em baixar. A página sempre oferece a versão mais nova, e a janela
do Local Session mostra um QR code dela na seção *acesso*, logo abaixo do de pareamento. Na
primeira vez o Android pede para o navegador poder instalar apps, porque o app não vem da Play
Store. Cada versão também sai como release própria, com tag `app-v<versão>`. O `.apk` é
assinado sempre com a mesma chave, então instala por cima da versão anterior sem perder o
pareamento.

Para compilar e instalar, com o Flutter e o SDK do Android na máquina:

```bash
cd mobile
flutter test                 # núcleos puros
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

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
permissão da tool `reply` — o card aparece na própria página, com o ícone de escudo. Aprove ali, ou libere
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

No `config.json`, além de `token` e `port`, as chaves opcionais: `projects` (lista de
caminhos absolutos) habilita a criação de sessões pela página, `projectsRoot` amplia a área
navegável, `notifyUrl` liga os avisos por push e `quickPrompts` troca os atalhos do
composer.

## Desenvolvimento

```
bun install
bun test          # unitários + integração (sobe o hub num porta efêmera)
bunx tsc --noEmit # checagem de tipos
bun run hub       # sobe o hub no primeiro plano, para depurar
```

Para ver o código local rodando de verdade — o `plugin install/update` puxa do marketplace
remoto e ignora o que está só na sua máquina — use `/local-session:update` (ou
`bun scripts/update.ts`) a partir da raiz do repo. Ele espelha `src/`, `web/`, `hooks/` e
`commands/` em **todos** os diretórios de versão do cache do plugin e troca o hub em
execução, matando pelo PID que escuta a porta. Espelhar em todos importa: uma sessão antiga
respawna o hub do próprio root, e um diretório esquecido devolve código velho no primeiro
respawn. A página cai por alguns segundos e reconecta sozinha.

Estrutura:

| Arquivo             | Responsabilidade                                  |
| ------------------- | ------------------------------------------------- |
| `src/server.ts`     | MCP stdio — ponte entre o Claude Code e o hub     |
| `src/hub.ts`        | Daemon HTTP/WebSocket, roteamento e assets        |
| `src/hub-state.ts`  | Registro de sessões e feed (sem I/O, testável)    |
| `src/hub-client.ts` | Cliente WebSocket com backoff e spawn do daemon   |
| `src/config.ts`     | Token, porta, IP da rota default                  |
| `src/tailscale.ts`  | Estado da tailnet, host MagicDNS e os passos de configuração |
| `src/notify.ts`     | Evento → aviso ntfy, com dedupe (sem I/O no core) |
| `src/update-core.ts`| PID na porta e versões no cache — parsing testável |
| `src/git-changes.ts`| Saídas do git → o texto do painel "mudanças"       |
| `src/terminal.ts`   | Terminais tmux por diretório: fluxo, teclas e tamanho |
| `web/terminal-panel.js` | Visor do terminal (xterm.js) e teclas de controle |
| `web/vendor/`       | xterm.js e addon-fit, MIT, servidos com cache longo |
| `src/upload.ts`     | Imagem reconhecida pelos bytes e nome de arquivo derivado |
| `scripts/service.ts`| Instala a unit de usuário do systemd              |
| `scripts/update.ts` | Espelha o repo no cache e troca o hub             |
| `src/history.ts`    | Histórico em JSONL — persistência e hidratação    |
| `src/hook-event.ts` | Payload de hook → evento de atividade + preview   |
| `hooks/report.ts`   | Hook: lê stdin, faz POST, falha em silêncio       |
| `web/`              | UI estática, sem framework nem build              |
| `src/setup-core.ts` | Merges de configuração, sem I/O (testável)        |
| `scripts/setup.ts`  | Aplica a configuração; eleva com `sudo` ou `pkexec` |
| `install.sh`        | Instalador de máquina nova — casca fina sobre o setup |

O design completo está em `docs/superpowers/specs/2026-08-07-claude-local-session-design.md`.

### Fluxo de branches

O código anda por duas branches fixas, como no TickTask:

| branch | o que é |
| --- | --- |
| `Production` | o que está publicado. As releases saem daqui, e só entra por PR de `release/*` |
| `Development` | homologação. Recebe as tasks por PR e gera as pre-releases `-rc.N` |
| `main` | backup do código. Não recebe trabalho direto |

1. **Início da task:** crie a branch a partir de `Production` (`feat/…`, `fix/…`, `chore/…`) e
   faça commits pequenos ao longo do trabalho.
2. **Homologação:** atualize `Development` com `Production` por rebase e abra o PR da task
   para `Development`. Depois do merge, crie a pre-release (`v0.16.0-rc.1` e, se o app mudou,
   `app-v1.3.0-rc.1`) no commit mesclado em `Development`. Ela sai publicada como
   **pre-release**: dá para instalar e testar, e o `/releases/latest` não muda.
3. **Promoção:**
   1. crie `release/v<versão>` a partir de `Production`;
   2. abra o PR da task para a release, com **squash**;
   3. abra o PR da release para `Production`, com **merge**;
   4. crie a tag de produção (`v<versão>` e, se for o caso, `app-v<versão>`) no commit
      mesclado em `Production`;
   5. apague a branch da task e a da release;
   6. sincronize `Development` com `Production` por rebase.

`Production` nunca recebe nada direto de `Development`: o que vai para produção passa por uma
`release/*` e por um PR.

### Lançar uma versão

Release é **por tag**: quem compila e publica é o GitHub Actions
(`.github/workflows/release.yml`), nunca a máquina de quem desenvolve. Há duas famílias de tag,
cada uma com a própria contagem:

| tag | publica | a versão vem de |
| --- | --- | --- |
| `v0.13.1` | o `.deb`, marcado como **Latest** | `.claude-plugin/plugin.json` **e** `package.json` |
| `app-v1.1.1` | o `.apk`, fora do Latest | `mobile/pubspec.yaml` |
| `v0.13.1-rc.2`, `app-v1.1.1-rc.1` | o mesmo artefato, como **pre-release** | a versão base, nos mesmos arquivos |

O APK fica fora do Latest de propósito: o comando de instalação acima baixa o `.deb` de
`/releases/latest`, e um APK ali deixaria esse comando sem pacote para achar.

O passo a passo, para o pacote:

```bash
# 1. suba a versão nos dois manifestos na branch da task (ver Fluxo de branches)
bun scripts/conferir-tag.ts v0.13.1     # confere se a tag bate com o código
# 2. crie a tag anotada: a 1ª linha vira o título, o resto vira as notas
git tag -a v0.13.1 -m "correção do setup instalado pelo pacote" -m "## O que mudou ..."
git push origin v0.13.1
```

Para o app é igual, com a versão no `pubspec.yaml` e a tag `app-v<versão>`.

O que o workflow faz, e onde ele para:

1. **confere a tag contra o código.** Tag que não bate com a versão dos manifestos derruba
   tudo antes de compilar, e o erro diz qual arquivo diverge;
2. **testa.** O pacote passa por `tsc` e `bun test`; o app, por `flutter analyze` e
   `flutter test`;
3. **compila e publica.** Para o app, antes de compilar, confere se a chave de assinatura que
   veio do secret `ANDROID_DEBUG_KEYSTORE` tem a impressão SHA-256 fixada no workflow. Com
   outra chave, o Android recusaria atualizar o app instalado.

Tag anotada vira título e notas da release; tag leve cai nas notas geradas pelo GitHub. Versão
já publicada é recusada, nunca sobrescrita: para corrigir uma release, lance a próxima.

Para ensaiar sem publicar, rode o mesmo workflow à mão: tudo acontece, menos a publicação.

```bash
gh workflow run release -f tag=v0.13.1
gh run watch
```

`bun scripts/release-apk.ts` recusa publicar fora do CI; `--local` força, como saída de
emergência quando o Actions estiver fora do ar.

## Contribuindo

Contribuições são bem-vindas: o [CONTRIBUTING.md](CONTRIBUTING.md) mostra como montar o ambiente
e por onde os pull requests entram. Falha de segurança vai pelo canal privado descrito no
[SECURITY.md](SECURITY.md), nunca numa issue. Quem participa segue o
[Código de Conduta](CODE_OF_CONDUCT.md).

## Licença

[MIT](LICENSE) © Ueslei Nascimento

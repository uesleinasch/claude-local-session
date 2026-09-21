# cliente Android em Flutter — design

Data: 2026-09-21

## Problema

A página do hub funciona no celular, mas chegar até ela custa caro: abrir o navegador,
lembrar qual endereço vale agora (o IP da LAN mudou? estou fora de casa e preciso do nome da
tailnet?) e carregar uma URL com um token de 64 caracteres. O QR code da janela Electron
resolve a digitação uma vez; não resolve a segunda abertura, nem a troca de rede.

O objetivo é um app Android que abre direto na sessão: o usuário toca no ícone e o cliente
encontra o hub sozinho, na rede local ou pela VPN, sem endereço nem token na mão.

## Escopo

Dentro:

- App Flutter em `mobile/`, casca em volta da UI web que o hub já serve.
- Pareamento único por QR code, reaproveitando o QR que a janela Electron já gera.
- Descoberta automática do endereço a cada abertura, com escolha de rede
  (automático / só LAN / só VPN).
- Anexar imagem da galeria e da câmera.
- Compartilhar texto de outro app para o composer.
- Notificação com o app fechado, assinando o tópico ntfy que o hub já publica.

Fora, deliberadamente:

- Reimplementar feed, composer ou terminal em Dart (ver "Abordagens consideradas").
- Ditado por voz — adiado; o Gboard já tem microfone e a mesma engine do Android.
- iOS, APK assinado, GitHub Releases, loja: o repositório será privado e o app é de uso
  pessoal do autor.
- Qualquer afrouxamento da autenticação por token do hub.

## Abordagens consideradas

| Abordagem | Por que sim | Por que não |
| --- | --- | --- |
| **Casca em volta da UI web** (escolhida) | Uma UI só para manter; toda feature nova da página chega ao app de graça | Depende do WebView do Android |
| Cliente nativo do protocolo | UI nativa, gestos melhores | `src/protocol.ts` passaria a ter três implementações de cliente, e nada avisa quando você esquece de atualizar uma; 1.682 linhas de `app.js` reescritas mais um emulador de terminal em Dart |
| Híbrido (feed em WebView, composer nativo) | — | Duas fontes de verdade sobre o mesmo estado, mais a ponte entre elas |

## O que muda no hub

### `src/endpoints.ts` — núcleo puro

`montarCandidatos({ lan, tailscale, hostname, porta })` devolve a lista de endereços por onde
o hub é alcançável, deduplicada e ordenada. Recebe os dados prontos; quem faz I/O é a rota.
O `127.0.0.1` não entra: é inútil para o celular.

### Rota `/_endpoints`

Nasce atrás da validação de token de `src/hub.ts:860`, como todas as outras. Responde:

```json
{
  "versao": "0.12.1",
  "porta": 7777,
  "candidatos": [
    { "rotulo": "lan", "host": "192.168.0.10" },
    { "rotulo": "lan", "host": "estacao.local" },
    { "rotulo": "vpn", "host": "estacao.tailnet.ts.net" }
  ],
  "ntfy": "https://ntfy.sh/meu-topico"
}
```

`ntfy` sai do `notifyUrl` do config e é omitido quando não há nenhum — evita configurar o
mesmo tópico duas vezes. A rota já exige token, então não expõe nada novo.

O `<hostname>.local` entra como candidato barato, não como promessa: a resolução de mDNS pelo
Android é irregular e depende do roteador. Se não resolver, ele apenas perde a corrida — mas
quando resolve, é o único candidato que sobrevive à troca de IP pelo DHCP.

`versao` é a do hub em execução. Serve ao caso "app novo, hub velho": a ponte JS da seção
seguinte pode não existir, e o app avisa em vez de falhar calado — mesmo espírito da tarja
`#outdated` que a página já mostra.

### A ponte em `web/app.js`

```js
window.localSession = {
  inserirNoComposer(texto) { … },
  sessaoAtual() { … },
}
```

`inserirNoComposer` escreve em `#input` e redimensiona; `sessaoAtual` devolve o `currentId`.
São o suficiente para o compartilhamento, e nada além disso é exposto ao lado nativo.

Este é um contrato novo entre a página e o app, do mesmo tipo que o `CLAUDE.md` já sinaliza
para `src/protocol.ts`: mudança de um lado não avisa o outro. Vai documentado lá e coberto
por teste.

## O app

```
mobile/
  lib/
    main.dart
    descoberta/candidatos.dart   núcleo: ordenação, filtro por modo, corrida
    descoberta/sonda.dart        casca: GET /_endpoints
    pareamento/link.dart         núcleo: URL do QR -> host, porta, token
    pareamento/camera.dart       casca: leitura do QR
    dados/cofre.dart             casca: token no armazenamento seguro
    dados/preferencias.dart      casca: candidatos, modo, último vencedor
    tela/webview.dart            casca: InAppWebView
    tela/ajustes.dart            casca: modo de rede, repareamento, notificação
    notificacao/evento.dart      núcleo: JSON do ntfy -> notificação
    notificacao/servico.dart     casca: foreground service
  test/                          flutter test dos núcleos
```

A divisão repete a do repo: o núcleo não faz I/O e recebe o efeito como parâmetro com
default, como `tailscaleAddress(nets = networkInterfaces())` em `src/config.ts`.

### Pareamento

O app abre a câmera e lê o QR que a janela Electron já gera — a URL
`http://host:7777/?t=<token>`. `link.dart` extrai host, porta e token; o token vai para o
armazenamento seguro do Android e não é exibido de novo. Nada muda no Electron nem no hub.

Token nunca trafega em busca de hub: é o QR, na tela, fora da rede.

### Descoberta

Candidatos = o host do QR mais os que vieram do último `/_endpoints`, cada um rotulado `lan`
ou `vpn`. O modo escolhido nos ajustes filtra a lista (**automático**, padrão; **só rede
local**; **só VPN**).

Ao abrir, o app dispara `GET /_endpoints?t=<token>` em todos os candidatos filtrados em
paralelo, com timeout de 1,5 s. O primeiro 200 vence, vira o primeiro da fila da próxima
abertura, e sua resposta renova a lista inteira — se o DHCP trocar o IP da LAN, a rota da
tailnet salva a sessão e a lista se autocorrige.

Falha é ambígua por construção: token errado e "não é o hub" são o mesmo 404, porque 401
confirmaria que o serviço existe. O app não adivinha — diz que não encontrou o hub e oferece
escanear o QR de novo.

### Token no WebView

O app carrega `http://<vencedor>:<porta>/?t=<token>`. A página já lê o token da URL e o
reusa ao abrir o WebSocket (`web/app.js:141`), e o hub responde com o cookie `ls_token` que
cobre os assets. É o mesmo fluxo provado no navegador, sem código nativo de cookie.

## Recursos nativos

**Plugin: `flutter_inappwebview`.** O `webview_flutter` oficial não implementa
`onShowFileChooser`, então o `<input type="file">` que já existe no HTML fica inerte e tocar
no clipe não abre nada. Com o `flutter_inappwebview`, galeria e câmera funcionam sem uma
linha nova de código web.

**Compartilhamento.** Intent `ACTION_SEND`. Texto vai direto para `inserirNoComposer`.
Imagem: o app lê `sessaoAtual()`, faz `POST /_upload?session=<id>` com os bytes — a mesma
rota que a página usa — e insere `imagem anexada: <path>` no composer. Os bytes não passam
pela ponte JS, onde uma foto de vários MB seria arriscada.

**Notificação.** Sem FCM não existe push no Android: alguém mantém a conexão viva. Com o app
aberto a página já mostra tudo, então o valor está no app fechado, e isso exige um foreground
service assinando o tópico ntfy — que no Android obriga uma notificação persistente na barra,
como no próprio app do ntfy. Fica **opcional e desligado por padrão**, ligado nos ajustes.
FCM foi descartado (projeto Firebase e os eventos passando pelo Google); UnifiedPush também
(empurra o problema para outro app instalado).

Tocar na notificação abre o app, não a sessão específica: o payload do ntfy não carrega o
`sessionId` (`notificationFor` em `src/notify.ts` manda o label no título), e usar o campo
`click` levaria um endereço com token para um servidor de terceiros. Refinamento anotado, não
v1.

Privacidade, dita em voz alta: rótulos de sessão e trechos de prompt passam pelo ntfy.sh
público. Já é verdade hoje para quem configurou `notifyUrl`; o app torna isso rotina.

## Armadilhas conhecidas

- **Cleartext bloqueado.** Desde o Android 9 o sistema recusa HTTP em texto claro, e o erro
  não explica nada. Precisa de `network_security_config.xml` com
  `cleartextTrafficPermitted="true"`. Liberado para todo destino: os IPs do hub não são
  conhecidos em tempo de build. Enquanto o hub não tiver HTTPS (item 1 do `ROADMAP.md`), não
  há alternativa.
- **File chooser** — a razão de o plugin não ser negociável, acima.
- **Origem por host:porta.** Trocar de LAN para VPN é trocar de origem: cookie e
  `localStorage` da página não vêm junto. O app recarrega com `?t=` e a fila offline da
  página é por origem — prompt enfileirado numa rede não aparece na outra.

## Testes

- `flutter test` em `mobile/test/`: ordenação e filtro de candidatos, corrida (com sonda
  injetada), parse da URL do QR, parse do evento ntfy.
- `bun test`: `src/endpoints.ts` em teste unitário e a rota `/_endpoints` em
  `tests/hub.integration.test.ts`, junto das demais.
- `bun test` continua verde numa máquina sem Flutter. Amarrar um comando ao outro só
  quebraria o fluxo que o repo usa hoje.
- Confirmação de comportamento no aparelho é do usuário: teste verde não diz que o QR
  escaneou, que a corrida achou o hub no 4G ou que o teclado não cobriu o composer.

## Distribuição e versão

`flutter build apk --debug` e `adb install` — o `adb` já está na máquina. Sem keystore, sem
Releases, sem segredo para guardar: o repositório será privado e só o autor usa o app. Se a
lentidão do build debug incomodar, gera-se um keystore local depois, sem publicar nada.

`mobile/pubspec.yaml` versiona independente de `package.json` e `.claude-plugin/plugin.json`:
o APK sai fora do `.deb` e não faz sentido subir a versão do app porque o hub mudou. O `.deb`
não muda em nada.

Toolchain não instalada nesta máquina (`flutter` e `ANDROID_HOME` ausentes; `java` e `adb`
presentes) — instalar é o passo 0 da implementação.

## Fases

1. **App utilizável** — `/_endpoints`, pareamento por QR, corrida, WebView, modo de rede,
   anexo por galeria e câmera.
2. **Integração com o Android** — ponte JS, compartilhamento de texto e imagem, notificação
   por ntfy em foreground service opcional.
3. **Adiado** — ditado por voz, se ainda fizer falta depois de uma semana de uso; abrir a
   sessão exata pela notificação.

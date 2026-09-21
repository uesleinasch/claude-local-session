# local-session — cliente Android

Casca Flutter em volta da página que o hub já serve. O que é nativo aqui é só o que a página
não consegue fazer sozinha: **achar o hub**, **guardar o token** e falar com o Android.

## Como funciona

1. **Pareia uma vez**, lendo o QR code da janela do Local Session (`lib/pareamento/link.dart`
   entende a mesma URL `http://host:7777/?t=…` que a tool `link` imprime). O token vai para o
   armazenamento cifrado do Android e não aparece mais.
2. **A cada abertura, corre atrás do hub** (`lib/descoberta/candidatos.dart`): pergunta ao
   `/_endpoints` por quais endereços ele responde, tenta todos em paralelo e fica com o
   primeiro. A resposta do vencedor renova a lista, então IP trocado pelo DHCP se corrige
   sozinho enquanto alguma rota ainda funcionar.
3. **Mostra a página** numa WebView carregada com `?t=<token>` — o mesmo caminho que o
   navegador usa, inclusive o cookie que o hub devolve.

Além disso, o lado nativo faz o que a página não alcança: recebe o **compartilhamento** do
Android (texto vai para o composer pela ponte `window.localSession`; imagem sobe pela rota
`/_upload` e só o caminho volta pela ponte) e, se você ligar nos ajustes, **escuta o tópico
ntfy** num serviço em primeiro plano para avisar com o app fechado.

## Estrutura

| Núcleo puro (tem teste) | Casca (I/O) |
| --- | --- |
| `pareamento/link.dart`, `descoberta/candidatos.dart`, `notificacao/ntfy.dart`, `notificacao/memoria.dart`, `compartilhamento/anexo.dart`, `compartilhamento/fila.dart`, `compartilhamento/item.dart`, `ponte/chamada.dart`, `tela/navegacao.dart` | `descoberta/sonda.dart`, `dados/`, `tela/`, `ponte/ponte_web.dart`, `notificacao/escuta.dart`, `notificacao/servico.dart`, `compartilhamento/receber.dart`, `compartilhamento/enviar_imagem.dart` |

O núcleo recebe o efeito como parâmetro — `correr(candidatos, sonda)` — pelo mesmo motivo que
`tailscaleAddress(nets = …)` no hub: teste sem rede.

## Ícone e splash

O ícone legado sai do mesmo `desktop/icon.svg` das duas interfaces; a camada adaptativa tem
arquivo próprio (`icone/frente.svg`) porque o Android come a borda do canvas de 108dp e o
traçado do desktop, que vai quase até o limite, apareceria cortado. `bun scripts/mobile-icones.ts`
(na raiz) rasteriza os dois com `inkscape`.

## Publicar uma versão

`bun scripts/release-apk.ts` na raiz do repo: compila em release, recusa versão já publicada e
sobe o APK como release `app-v<semver>` no GitHub. Para instalar no celular, abra o release
logado e toque no `.apk` — sem cabo. Suba a versão em `pubspec.yaml` antes de cada publicação;
republicar a mesma falha de propósito.

A assinatura é a chave de **debug** desta máquina: nada de senha para guardar, mas se você
perder a máquina o app novo não atualiza por cima do antigo (precisa desinstalar).

## Comandos

```bash
flutter test        # núcleos puros
flutter analyze
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

## Armadilhas já pagas

- **AGP fixado na linha 8.11** (`android/settings.gradle.kts`): o AGP 9 recusa o
  `getDefaultProguardFile('proguard-android.txt')` que o `flutter_inappwebview_android` usa, e
  o build morre ao avaliar o plugin.
- **Gradle 8.14.3, nem menos nem mais**: o Flutter recusa abaixo de 8.14 ("your project's
  Gradle version is lower than Flutter's minimum supported version"), e a linha 9 traz de volta
  o AGP 9 acima.
- **`-Djava.net.preferIPv4Stack=true`** (`android/gradle.properties`): nesta rede o DNS devolve
  só AAAA para o Maven Central e a rota IPv6 anunciada não entrega tráfego.
- **`network_security_config.xml`**: sem ele o Android 9+ recusa o HTTP do hub sem dizer por quê.
- **`flutter_inappwebview`, não `webview_flutter`**: só o primeiro implementa
  `onShowFileChooser`; sem isso o clipe de anexo da página não abre nada.
- **`flutter_local_notifications` 22 usa argumentos nomeados** em `initialize` e `show`; os
  exemplos que circulam são da API posicional antiga e não compilam.
- **`isCoreLibraryDesugaringEnabled` + `desugar_jdk_libs`** (`android/app/build.gradle.kts`): o
  mesmo plugin usa API de data do Java 8 e, sem desugaring, o build falha apontando a página de
  java8-support — mensagem que não nomeia o plugin culpado.
- **A WebView só navega no host pareado** (`podeNavegar`): sem barra de endereço, um link do
  feed levaria para fora do hub sem sinal nenhum na tela.
- **`drawable-v21/` vence `drawable/`** em qualquer aparelho moderno, e **`night` vence
  `version`**: a splash precisa ser corrigida nos dois pares de pasta, senão o template branco
  continua valendo. No Android 12+ o sistema ainda ignora o `windowBackground` e desenha a
  própria splash, que exige `windowSplashScreenBackground` e `windowSplashScreenAnimatedIcon`.
- **`window.localSession` só existe depois do `onLoadStop`**, não do `onWebViewCreated`: a ponte
  nasce no fim de `app.js`. O Android entrega o compartilhamento antes disso, então
  `FilaDeCompartilhados` segura o item até a página carregar — entregar mais cedo o perderia em
  silêncio.

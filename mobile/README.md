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

## Estrutura

| Núcleo puro (tem teste) | Casca (I/O) |
| --- | --- |
| `pareamento/link.dart`, `descoberta/candidatos.dart`, `notificacao/ntfy.dart`, `compartilhamento/anexo.dart`, `ponte/chamada.dart` | `descoberta/sonda.dart`, `dados/`, `tela/`, `ponte/ponte_web.dart` |

O núcleo recebe o efeito como parâmetro — `correr(candidatos, sonda)` — pelo mesmo motivo que
`tailscaleAddress(nets = …)` no hub: teste sem rede.

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

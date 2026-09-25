# Graph Report - claude-local-session  (2026-09-25)

## Corpus Check
- 163 files · ~90,086 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 26 file(s) not represented in the graph (top: .xml 14, (none) 5, .css 3)

## Summary
- 2143 nodes · 4147 edges · 107 communities (88 shown, 19 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 122 edges (avg confidence: 0.86)
- Token cost: 295,205 input · 0 output

## Community Hubs (Navigation)
- xterm.js: núcleo e encoding
- Página web: app.js
- xterm.js: sequências de controle
- Pacote .deb e plugin desatualizado
- Instalação sem curva
- Electron: núcleo e main
- App Android: raiz
- Deploy local (update)
- xterm.js: API pública
- xterm.js: handlers de parser
- Diagnóstico de status
- xterm.js: acessibilidade e protocolos
- xterm.js: scroll e parâmetros
- CLI e servidor MCP
- Setup e managed settings
- xterm.js: opções
- xterm.js: atributos de célula
- xterm.js: cores e resize
- Hub daemon
- Android: fila de compartilhados
- xterm.js: unicode e agendamento
- Android: serviço de avisos
- Protocolo e contrato
- xterm.js: buffer de células
- Registro de sessões (hub-state)
- xterm.js: registro de handlers
- Arquivos e fronteiras de segurança
- Android: escuta e envio de imagem
- Android: candidatos e modo de rede
- xterm.js: seleção e logs
- Ícones do app
- Android: tela de ajustes
- Android: preferências e anexos
- Histórico persistente
- Painel de terminal web
- xterm.js: eventos de opções
- xterm.js: seleção por mouse
- Dependências npm
- xterm.js: links
- Hook de atividade
- Página web: nós do feed
- Notificações ntfy
- Build e testes de integração
- Release do APK
- Controle do tmux pelo hub
- Config e rede
- Cliente Android: descoberta
- Android: tela de sessão
- xterm.js: foco e composição
- Página web: menus e confirmações
- xterm.js: reset e ESC
- Tailscale e acesso remoto
- Perguntas e teclas do tmux
- Electron: renderer
- Android: sonda do hub
- hub-state: sessões e perguntas
- Android: ponte WebView
- Upload de imagem
- Conexão WebSocket da página
- Página web: navegador de arquivos
- Android: WebView e ponte
- Serviço systemd
- Confiança de pasta (trust)
- Conferência de tag de release
- tsconfig
- xterm.js: marcadores
- xterm.js: renderização
- Documentação e Electron
- Android: MainActivity nativa
- Android: cofre do token
- Android: pareamento por QR
- Endpoints de descoberta
- Assets embutidos da web
- Declarações de assets
- Android: item compartilhado
- Android: nome do download
- Android: parser ntfy
- Mudanças git e arquivos
- Núcleo do navegador de arquivos
- Página web: composer
- xterm.js: scroll por toque
- Android: main
- Android: leitura do link
- xterm.js: reflow de buffer
- xterm.js: buffer e readonly
- Ponto de entrada único
- Três camadas do canal
- Workflow de release
- Relatório de contexto
- Android: memória de avisos
- Markdown da página
- xterm.js: decorações
- Autenticação por token
- xterm.js: contraste de cor
- Android: baixar arquivos
- xterm.js: acessibilidade de seleção
- xterm.js: decoração DOM
- Config MCP
- Android: navegação restrita
- Página web: diff do git
- Build JVM IPv4
- Precedência de recursos Android

## God Nodes (most connected - your core abstractions)
1. `k` - 105 edges
2. `d` - 65 edges
3. `constructor()` - 63 edges
4. `P` - 54 edges
5. `i()` - 45 edges
6. `s()` - 43 edges
7. `c()` - 40 edges
8. `n()` - 39 edges
9. `h()` - 32 edges
10. `onBrowserMessage()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `Aprovar pela notificação (nonce por pedido)` --semantically_similar_to--> `Fronteiras de segurança (token 404, realpath, allowlists)`  [INFERRED] [semantically similar]
  ROADMAP.md → CLAUDE.md
- `Android Legacy Launcher Icon (hdpi)` --semantically_similar_to--> `App Icon Source (desktop/icon.svg)`  [INFERRED] [semantically similar]
  mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png → desktop/icon.svg
- `Android Legacy Launcher Icon (mdpi)` --semantically_similar_to--> `App Icon Source (desktop/icon.svg)`  [INFERRED] [semantically similar]
  mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png → desktop/icon.svg
- `Android Legacy Launcher Icon (xhdpi)` --semantically_similar_to--> `App Icon Source (desktop/icon.svg)`  [INFERRED] [semantically similar]
  mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png → desktop/icon.svg
- `Android Legacy Launcher Icon (xxhdpi)` --semantically_similar_to--> `App Icon Source (desktop/icon.svg)`  [INFERRED] [semantically similar]
  mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png → desktop/icon.svg

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Arquitetura de três processos e um navegador** — src_hub, src_server, hooks_report, hooks_context_report, web_app, src_protocol [EXTRACTED 1.00]
- **Configuração das três camadas do canal** — claude_three_channel_layers, managed_settings_json, claude_channels_flag_alias, readme_reply_tool, src_setup_core, install, commands_setup [EXTRACTED 1.00]
- **Pipeline de release por tag** — _github_workflows_release, scripts_conferir_tag, src_release_core, scripts_release_apk, readme_tag_release_flow [EXTRACTED 1.00]
- **Arquitetura de três processos: hub, server MCP e hook report** — src_hub, src_server, hooks_report, src_protocol, docs_superpowers_specs_2026_08_07_claude_local_session_design_hub_daemon [EXTRACTED 1.00]
- **Abertura do app: pareamento QR, corrida por /_endpoints e WebView com token** — docs_superpowers_specs_2026_09_21_cliente_android_flutter_design_pareamento_qr, docs_superpowers_specs_2026_09_21_cliente_android_flutter_design_corrida_descoberta, docs_superpowers_specs_2026_09_21_cliente_android_flutter_design_endpoints_route, docs_superpowers_specs_2026_09_21_cliente_android_flutter_design_montarcandidatos, docs_superpowers_specs_2026_09_21_cliente_android_flutter_design_casca_webview [EXTRACTED 1.00]
- **Aplicação do managed-settings: merge só-acrescenta reusado por setup e postinst** — docs_superpowers_specs_2026_08_07_instalacao_sem_curva_design_mergemanagedsettings, docs_superpowers_specs_2026_08_07_instalacao_sem_curva_design_setup_ts, docs_superpowers_specs_2026_09_21_pacote_deb_design_postinst, docs_superpowers_specs_2026_09_21_pacote_deb_design_managed_settings_subcomando, docs_superpowers_specs_2026_08_07_instalacao_sem_curva_design_managed_settings_json [INFERRED 0.85]
- **Android legacy launcher icon rasters from desktop/icon.svg** — desktop_icon, mobile_android_app_src_main_res_mipmap_mdpi_ic_launcher, mobile_android_app_src_main_res_mipmap_hdpi_ic_launcher, mobile_android_app_src_main_res_mipmap_xhdpi_ic_launcher, mobile_android_app_src_main_res_mipmap_xxhdpi_ic_launcher, mobile_android_app_src_main_res_mipmap_xxxhdpi_ic_launcher [INFERRED 0.85]
- **Android adaptive foreground rasters from frente.svg** — mobile_icone_frente, mobile_android_app_src_main_res_mipmap_mdpi_ic_launcher_foreground, mobile_android_app_src_main_res_mipmap_hdpi_ic_launcher_foreground, mobile_android_app_src_main_res_mipmap_xhdpi_ic_launcher_foreground, mobile_android_app_src_main_res_mipmap_xxhdpi_ic_launcher_foreground, mobile_android_app_src_main_res_mipmap_xxxhdpi_ic_launcher_foreground [INFERRED 0.85]

## Communities (107 total, 19 thin omitted)

### Community 0 - "xterm.js: núcleo e encoding"
Cohesion: 0.03
Nodes (31): addDecoration(), _addLineToZone(), addOscHandler(), areSelectionValuesReversed(), compositionend(), compositionupdate(), _finalizeComposition(), finalSelectionEnd() (+23 more)

### Community 1 - "Página web: app.js"
Cohesion: 0.03
Nodes (66): actsClosed, actsOpened, app, attachBtn, attachInput, attachState, browseCrumbs, browseEmpty (+58 more)

### Community 3 - "Pacote .deb e plugin desatualizado"
Cohesion: 0.05
Nodes (34): Aviso de plugin desatualizado (tarja #outdated), Depends: tmux, Duas árvores: sistema pesada e plugin leve, Executável único (bun build --compile, 92 MB), pluginMismatch, Shim bin/local-session (dist, PATH, fonte), Painel ⑂ mudanças (git status/diff), Barra de janela de contexto (+26 more)

### Community 4 - "Instalação sem curva"
Cohesion: 0.06
Nodes (48): Protocolo de canal nativo do Claude Code (claude/channel), Plugin oficial do Telegram (referência), Instalação sem curva — design (2026-08-07), Alias que sobrepõe claude com --channels, /local-session:setup (commands/setup.md), Elevação adaptativa sudo/pkexec, ensureAliasBlock, Etapas idempotentes do instalador (+40 more)

### Community 5 - "Electron: núcleo e main"
Cohesion: 0.07
Nodes (45): actionIds(), actionLabel(), ACTIONS, aptInstallCommand(), autostartCommand(), autostartEntry(), citar(), HEALTH_LABEL (+37 more)

### Community 6 - "App Android: raiz"
Cohesion: 0.04
Nodes (44): Candidato?, dart:io, _abrirAjustes, aoAbrirAjustes, aoTentar, _avisos, _avisosLigados, build (+36 more)

### Community 7 - "Deploy local (update)"
Cohesion: 0.07
Nodes (31): A dança do deploy local, /local-session:update, ref_bun_test, ref_node_fs, ref_node_path, BINARIO_REPO, cacheRoot, die() (+23 more)

### Community 10 - "Diagnóstico de status"
Cohesion: 0.09
Nodes (32): claude_plugin_marketplace, claude_plugin_plugin, Action, answering(), collect(), HOME, MARK, readJson() (+24 more)

### Community 11 - "xterm.js: acessibilidade e protocolos"
Cohesion: 0.08
Nodes (38): addEncoding(), addProtocol(), _clearLiveRegion(), clearRange(), clearTextureAtlas(), constructor(), _createAccessibilityTreeNode(), createInstance() (+30 more)

### Community 13 - "CLI e servidor MCP"
Cohesion: 0.10
Nodes (23): MCP config fora de .mcp.json na raiz, Tool MCP reply, mergeUserPermissions, cmd, Command, COMMANDS, DESCRIPTIONS, hubSpawnArgs() (+15 more)

### Community 14 - "Setup e managed settings"
Cohesion: 0.13
Nodes (32): detectPluginIdentity, rcPathFor, managedMode, runManaged(), corruptJson(), did(), elevator(), HOME (+24 more)

### Community 18 - "Hub daemon"
Cohesion: 0.08
Nodes (30): Hub como daemon separado e desanexado, broadcastConfig(), browserSockets, cfg, cleanEnv(), configMsg(), favorites, handleActivity() (+22 more)

### Community 19 - "Android: fila de compartilhados"
Cohesion: 0.07
Nodes (27): int get, composer, entregar, _entregarUm, _espera, FilaDeCompartilhados, pendentes, receber (+19 more)

### Community 20 - "xterm.js: unicode e agendamento"
Cohesion: 0.09
Nodes (3): charProperties(), n(), _removeIntersectingLinks()

### Community 21 - "Android: serviço de avisos"
Cohesion: 0.07
Nodes (28): @pragma, dart:async, _agendarReconexao, _canal, _chaveTopico, _conectar, desligar, iniciarEscuta (+20 more)

### Community 22 - "Protocolo e contrato"
Cohesion: 0.10
Nodes (27): FeedEvent (prompt/reply/activity/permission), Ring buffer MAX_EVENTS=200 por sessão, SessionSummary, Casca em volta da UI web (abordagem escolhida), ActivityStatus, BrowserToHub, clip(), DEFAULT_QUICK_PROMPTS (+19 more)

### Community 23 - "xterm.js: buffer de células"
Cohesion: 0.15
Nodes (6): _convertViewportColToCharacterIndex(), _getWordAt(), h(), _isCharWordSeparator(), provideLinks(), _reflowSmaller()

### Community 24 - "Registro de sessões (hub-state)"
Cohesion: 0.12
Nodes (6): firstOpenPermission(), Registry, urgency(), HubToBrowser, PermissionBehavior, SessionSummary

### Community 25 - "xterm.js: registro de handlers"
Cohesion: 0.10
Nodes (12): createRow(), fire(), getBufferElements(), getJoinedCharacters(), _getJoinedRanges(), _mergeRanges(), registerHandler(), scroll() (+4 more)

### Community 26 - "Arquivos e fronteiras de segurança"
Cohesion: 0.13
Nodes (25): Fronteiras de segurança (token 404, realpath, allowlists), contentDisposition(), copyTarget(), DirChild, DirReader, findDirs(), fold(), Found (+17 more)

### Community 27 - "Android: escuta e envio de imagem"
Cohesion: 0.08
Nodes (20): dart:typed_data, enviarImagem, uri, conexao, escutarNtfy, lembrados, linhas, resposta (+12 more)

### Community 28 - "Android: candidatos e modo de rede"
Cohesion: 0.08
Nodes (24): Modo de rede (automático / só LAN / só VPN), baseUrl, brutos, _cabeNoModo, Candidato, candidatosDoPayload, correr, fila (+16 more)

### Community 29 - "xterm.js: seleção e logs"
Cohesion: 0.09
Nodes (15): _cancelCallback(), clear(), debug(), error(), _evalLazyOptionalParams(), _getCorrectBufferLength(), _handleSelectionChange(), info() (+7 more)

### Community 30 - "Ícones do app"
Cohesion: 0.09
Nodes (22): App Icon Source (desktop/icon.svg), Desktop Icon PNG (256px raster), Android Legacy Launcher Icon (hdpi), Android Adaptive Foreground (hdpi), Android Legacy Launcher Icon (mdpi), Android Adaptive Foreground (mdpi), Android Legacy Launcher Icon (xhdpi), Android Adaptive Foreground (xhdpi) (+14 more)

### Community 31 - "Android: tela de ajustes"
Cohesion: 0.09
Nodes (22): ModoRede, _Ajustes, _AjustesState, aoParearOutro, aoProcurarDeNovo, _avisos, avisosLigados, build (+14 more)

### Community 32 - "Android: preferências e anexos"
Cohesion: 0.09
Nodes (19): dart:convert, caminhoDoUpload, mensagemDeAnexo, _campoDaDescoberta, _chaveDescoberta, _chaveModo, _chaveVencedor, lerCandidatos (+11 more)

### Community 33 - "Histórico persistente"
Cohesion: 0.15
Nodes (10): foldEvents(), HistoryStore, Line, MetaLine, parseLines(), PersistedSession, onSessionMessage(), RegisterInfo (+2 more)

### Community 34 - "Painel de terminal web"
Cohesion: 0.13
Nodes (16): asTerminalText(), CONTROL_KEYS, createTerminalPanel(), available(), build(), close(), isOpen(), measure() (+8 more)

### Community 35 - "xterm.js: eventos de opções"
Cohesion: 0.10
Nodes (18): addCsiHandler(), addDcsHandler(), addRefreshCallback(), delete(), _equalEvents(), forEachByKey(), getKeyIterator(), _innerRefresh() (+10 more)

### Community 36 - "xterm.js: seleção por mouse"
Cohesion: 0.11
Nodes (21): _addMouseDownListeners(), _areCoordsInSelection(), _dragScroll(), _getMouseBufferCoords(), _getMouseEventScrollAmount(), getWrappedRangeForLine(), _handleDoubleClick(), _handleIncrementalClick() (+13 more)

### Community 37 - "Dependências npm"
Cohesion: 0.10
Nodes (20): dependencies, @modelcontextprotocol/sdk, zod, devDependencies, @types/bun, name, private, scripts (+12 more)

### Community 38 - "xterm.js: links"
Cohesion: 0.13
Nodes (19): _askForLink(), _checkLinkProviderResult(), _clearCurrentLink(), clearSelection(), _createLinkUnderlineEvent(), _fireEventIfSelectionChanged(), _fireOnSelectionChange(), _fireUnderlineEvent() (+11 more)

### Community 39 - "Hook de atividade"
Cohesion: 0.14
Nodes (17): claude-local-session design (2026-08-07), Rota POST /_activity, Hook com timeout de 300ms e falha silenciosa, main(), Auto mode (aprovação automática por sessão), Card de permissão (preview PreToolUse), Permissão por ferramenta (planejado), describe() (+9 more)

### Community 40 - "Página web: nós do feed"
Cohesion: 0.14
Nodes (20): actsNode(), askNode(), askQuestionBlock(), closeMenu(), ctxLevel(), current(), draftFor(), draftValid() (+12 more)

### Community 42 - "Notificações ntfy"
Cohesion: 0.17
Nodes (11): Avisos por ntfy (notifyUrl), Aprovar pela notificação (nonce por pedido), clip(), Notification, notificationFor(), Notifier, postToNtfy(), splitNtfyUrl() (+3 more)

### Community 43 - "Build e testes de integração"
Cohesion: 0.12
Nodes (12): ref_bun, ref_node_child_process, inicio, mb, OUT, REPO, base(), Collector (+4 more)

### Community 44 - "Release do APK"
Cohesion: 0.12
Nodes (15): acharFlutter(), apk, apkBruto, die(), DRY, LOCAL, mb, miss() (+7 more)

### Community 45 - "Controle do tmux pelo hub"
Cohesion: 0.17
Nodes (19): ancestorsOf(), answerQuestion(), broadcastBrowsers(), claudeAncestorOf(), findPane(), interruptSession(), killSession(), onBrowserMessage() (+11 more)

### Community 46 - "Config e rede"
Cohesion: 0.20
Nodes (16): ref_node_dgram, ref_node_os, Config, Iface, isCgnat(), isConfig(), loadConfig(), readConfig() (+8 more)

### Community 47 - "Cliente Android: descoberta"
Cohesion: 0.15
Nodes (17): Cliente Android em Flutter — design (2026-09-21), Corrida de descoberta de candidatos, Rota /_endpoints, montarCandidatos (src/endpoints.ts), Notificação por ntfy em foreground service, Pareamento único por QR code, pubspec versiona independente do hub, mobile/analysis_options.yaml (flutter_lints) (+9 more)

### Community 48 - "Android: tela de sessão"
Cohesion: 0.12
Nodes (16): aoAbrirAjustes, aoCarregarPagina, aoPerderOHub, _baixar, build, _controle, createState, dispose (+8 more)

### Community 50 - "Página web: menus e confirmações"
Cohesion: 0.23
Nodes (16): askTrust(), buildMenu(), confirmKill(), decide(), handle(), menuItem(), openSheet(), parseChanges() (+8 more)

### Community 51 - "xterm.js: reset e ESC"
Cohesion: 0.12
Nodes (12): addEscHandler(), disable(), end(), _handleBufferActivate(), handleTrim(), hook(), put(), registerEscHandler() (+4 more)

### Community 53 - "Tailscale e acesso remoto"
Cohesion: 0.20
Nodes (11): Núcleo puro vs. casca de I/O, tool link (URL LAN + tailnet MagicDNS), HTTPS pelo tailscale serve (planejado), Tailscale opt-in detectado, nunca instalado, parseStatus(), probeTailscale(), selfHost(), setupSteps() (+3 more)

### Community 54 - "Perguntas e teclas do tmux"
Cohesion: 0.18
Nodes (13): Controles que só funcionam dentro de tmux (send-keys no pane), Troca de modelo (/model via tmux), Card de pergunta (AskUserQuestion), Limitações do protocolo de canal, Comandos de barra pela página (/compact, slashCommand), QuestionAnswer, keySequenceFor(), KeyStep (+5 more)

### Community 55 - "Electron: renderer"
Cohesion: 0.28
Nodes (14): abas, carregar(), comOcupado(), el(), itemCheck(), MARCA, paineis, render() (+6 more)

### Community 56 - "Android: sonda do hub"
Cohesion: 0.13
Nodes (13): Duration, Map, esquema, limite, payloadDe, _payloads, Sonda, testar (+5 more)

### Community 57 - "hub-state: sessões e perguntas"
Cohesion: 0.14
Nodes (9): SessionEntry, Sink, DEAD_SESSION_TTL_MS, HubToSession, PendingPermission, QuestionSpec, question(), INFO (+1 more)

### Community 58 - "Android: ponte WebView"
Cohesion: 0.14
Nodes (12): InAppWebViewController?, _carregada, _controle, desligar, inserir, ligar, marcarCarregada, pronto (+4 more)

### Community 59 - "Upload de imagem"
Cohesion: 0.20
Nodes (9): configDir(), handleUpload(), ImageKind, MAX_UPLOAD_BYTES, RIFF, sniffImage(), starts(), uploadName() (+1 more)

### Community 60 - "Conexão WebSocket da página"
Cohesion: 0.25
Nodes (12): connect(), ping(), reconnectNow(), startPing(), stopPing(), wake(), INITIAL_BACKOFF_MS, MAX_BACKOFF_MS (+4 more)

### Community 61 - "Página web: navegador de arquivos"
Cohesion: 0.29
Nodes (14): confirmSpawn(), copyButton(), el(), entryRow(), findRow(), humanSize(), iconButton(), lastSegment() (+6 more)

### Community 62 - "Android: WebView e ponte"
Cohesion: 0.17
Nodes (13): Tool MCP link, network_security_config.xml (cleartext liberado), Compartilhamento ACTION_SEND (texto e imagem), flutter_inappwebview (onShowFileChooser), Divisão núcleo puro / casca no app, Ponte window.localSession (inserirNoComposer, sessaoAtual), Rota /_upload, dep flutter_inappwebview ^6.1.5 (+5 more)

### Community 63 - "Serviço systemd"
Cohesion: 0.22
Nodes (12): /usr/lib/systemd/user/local-session-hub.service, did(), HOME, miss(), ok(), runService(), serviceMode, systemctl() (+4 more)

### Community 64 - "Confiança de pasta (trust)"
Cohesion: 0.21
Nodes (9): Nova sessão pelo celular (projects/projectsRoot), acceptTrustPrompt(), paneOfSession(), dirIsTrusted(), isTrustPrompt(), TRUST_KEYS, trustAccepted(), TELA_PRONTA (+1 more)

### Community 65 - "Conferência de tag de release"
Cohesion: 0.24
Nodes (9): r, REPO, Conferencia, conferirTag(), jaPublicada(), nomeDoApk(), tagDaVersao(), versaoDoPubspec() (+1 more)

### Community 66 - "tsconfig"
Cohesion: 0.15
Nodes (12): compilerOptions, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck, strict (+4 more)

### Community 67 - "xterm.js: marcadores"
Cohesion: 0.18
Nodes (11): addLineToLink(), addMarker(), clearAllMarkers(), clearListeners(), clearMarkers(), dispose(), _getEntryIdKey(), registerLink() (+3 more)

### Community 69 - "Documentação e Electron"
Cohesion: 0.18
Nodes (10): CLAUDE.md (guia do repositório), Pacote .deb (layout e postinst), Interface Electron (desktop/), desktop/renderer/index.html (janela de configuração), Painéis geral/acesso/dependências/serviço/canal, #qr-area (QR do link com token), Cliente Android Flutter (mobile/), Corrida de descoberta do hub (/_endpoints) (+2 more)

### Community 70 - "Android: MainActivity nativa"
Cohesion: 0.21
Nodes (9): context, cookiemanager, downloadmanager, environment, FlutterActivity, FlutterEngine, methodchannel, MainActivity (+1 more)

### Community 71 - "Android: cofre do token"
Cohesion: 0.17
Nodes (10): _armazenamento, _chave, Cofre, esquecer, guardar, ler, main, package:flutter_secure_storage/flutter_secure_storage.dart (+2 more)

### Community 72 - "Android: pareamento por QR"
Cohesion: 0.18
Nodes (11): _aoDetectar, build, _controle, createState, dispose, _jaPareou, _recusado, TelaPareamento (+3 more)

### Community 73 - "Endpoints de descoberta"
Cohesion: 0.26
Nodes (10): Candidato, comLocal(), Descoberta, Enderecos, EntradasDescoberta, INUTEIS, montarCandidatos(), montarDescoberta() (+2 more)

### Community 74 - "Assets embutidos da web"
Cohesion: 0.21
Nodes (8): EMBEDDED, EMBEDDED_FILES, arquivosDeWeb(), NAO_SERVIDOS, WEB, idleLabel(), sessionStatus(), web_style

### Community 75 - "Declarações de assets"
Cohesion: 0.18
Nodes (10): *.css, */vendor/addon-fit.js, */vendor/xterm.js, */web/app.js, */web/browse-core.js, */web/connection.js, */web/index.html, */web/markdown.js (+2 more)

### Community 76 - "Android: item compartilhado"
Cohesion: 0.20
Nodes (9): bool get, imagem, inserir, pronto, sessaoAtual, texto, tipo, TipoCompartilhado (+1 more)

### Community 77 - "Android: nome do download"
Cohesion: 0.20
Nodes (9): bruto, codificado, _doCabecalho, _doPath, nomeDoDownload, _padrao, _seguro, ultimo (+1 more)

### Community 78 - "Android: parser ntfy"
Cohesion: 0.20
Nodes (9): Aviso, avisoDoEvento, corpo, id, partes, replace, titulo, uri (+1 more)

### Community 79 - "Mudanças git e arquivos"
Cohesion: 0.24
Nodes (8): Arquivos pelo celular (browse/copy/find/download), Editor de arquivo pela página (descartado por ora), Navegador e visualizador de arquivos (prioridade), ChangeParts, formatChanges(), MAX_CHANGES, gitChanges(), aba browse (#browse-list, #clip-bar, #find-box)

### Community 80 - "Núcleo do navegador de arquivos"
Cohesion: 0.33
Nodes (7): byName, crumbs(), pad(), parseSort(), relativeTime(), SORT_OPTIONS, sortEntries()

### Community 81 - "Página web: composer"
Cohesion: 0.20
Nodes (10): clearAttach(), clock(), inserirNoComposer(), renderAttach(), resize(), sendPrompt(), submit(), turnNode() (+2 more)

### Community 82 - "xterm.js: scroll por toque"
Cohesion: 0.29
Nodes (10): _applyScrollModifier(), _bubbleScroll(), _clearSmoothScrollState(), getLinesScrolled(), _getPixelsScrolled(), handleTouchMove(), handleWheel(), scrollLines() (+2 more)

### Community 83 - "Android: main"
Cohesion: 0.22
Nodes (8): AppLocalSession, build, main, _Aviso, _SemHub, package:flutter/material.dart, package:local_session/tela/raiz.dart, StatelessWidget

### Community 84 - "Android: leitura do link"
Cohesion: 0.22
Nodes (8): esquema, host, lerLink, Pareamento, porta, portaPadrao, token, uri

### Community 85 - "xterm.js: reflow de buffer"
Cohesion: 0.28
Nodes (8): _batchedMemoryCleanup(), fillViewportRows(), getBlankLine(), getNullCell(), _reflow(), _reflowLarger(), _reflowLargerAdjustViewport(), resize()

### Community 87 - "Ponto de entrada único"
Cohesion: 0.29
Nodes (7): local-session script, Um ponto de entrada, oito subcomandos (src/cli.ts), /local-session:service, /local-session:setup, /etc/claude-code/managed-settings.json, Serviço systemd de usuário + linger, Binário único (bun build --compile)

### Community 88 - "Três camadas do canal"
Cohesion: 0.32
Nodes (7): flag --channels e função de shell claude(), As três camadas do canal, die(), say(), install.sh script, Diagnóstico 'Channel notifications skipped', tool reply

### Community 89 - "Workflow de release"
Cohesion: 0.38
Nodes (7): release.yml (GitHub Actions release workflow), job app (APK Flutter), job conferir (tag vs código), override de heap do Gradle em ~/.gradle, checagem SHA-256 do ANDROID_DEBUG_KEYSTORE, job plugin (build .deb e publica Latest), Lançamento por tag (v* e app-v*)

### Community 90 - "Relatório de contexto"
Cohesion: 0.43
Nodes (4): main(), toContextPost(), ContextPost, payload

### Community 91 - "Android: memória de avisos"
Cohesion: 0.29
Nodes (6): inedito, maximo, maximoLembrado, MemoriaDeAvisos, _ordem, _vistos

### Community 92 - "Markdown da página"
Cohesion: 0.62
Nodes (5): inlineWithBreaks(), parseInline(), parseMarkdown(), renderMarkdown(), renderSpans()

### Community 93 - "xterm.js: decorações"
Cohesion: 0.33
Nodes (7): _refreshCanvasDimensions(), _refreshColorZonePadding(), _refreshDecorations(), _refreshDrawConstants(), _refreshDrawHeightConstants(), _registerBufferChangeListeners(), _renderColorZone()

### Community 94 - "Autenticação por token"
Cohesion: 0.33
Nodes (6): Capability claude/channel/permission, Fluxo de permissão pelo navegador, Cookie ls_token, Autenticação por token (404 nunca 401), Falha ambígua (token errado = não é o hub), Origem por host:porta (LAN vs VPN)

### Community 95 - "xterm.js: contraste de cor"
Cohesion: 0.40
Nodes (5): _addStyle(), _applyMinimumContrast(), getColor(), _getContrastCache(), setColor()

### Community 96 - "Android: baixar arquivos"
Cohesion: 0.50
Nodes (3): baixarParaDownloads, _canal, package:flutter/services.dart

### Community 97 - "xterm.js: acessibilidade de seleção"
Cohesion: 0.50
Nodes (4): _announceCharacters(), _createSelectionElement(), handleSelectionChanged(), _renderRows()

### Community 98 - "xterm.js: decoração DOM"
Cohesion: 0.67
Nodes (4): _createElement(), _refreshStyle(), _refreshXPosition(), _renderDecoration()

### Community 101 - "Página web: diff do git"
Cohesion: 0.67
Nodes (3): fileRow(), hunkNode(), renderSheetBody()

## Ambiguous Edges - Review These
- `Cliente Android em Flutter — design (2026-09-21)` → `Publicação do APK (release-apk.ts, app-v<semver>, chave de debug)`  [AMBIGUOUS]
  mobile/README.md · relation: conceptually_related_to
- `Core library desugaring (desugar_jdk_libs)` → `dep flutter_inappwebview ^6.1.5`  [AMBIGUOUS]
  mobile/README.md · relation: rationale_for

## Knowledge Gaps
- **531 isolated node(s):** `sh`, `Action`, `ACTIONS`, `HEALTH_LABEL`, `{ app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage, clipboard }` (+526 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 851 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Cliente Android em Flutter — design (2026-09-21)` and `Publicação do APK (release-apk.ts, app-v<semver>, chave de debug)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Core library desugaring (desugar_jdk_libs)` and `dep flutter_inappwebview ^6.1.5`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **Why does `Rota /_endpoints` connect `Cliente Android: descoberta` to `Pacote .deb e plugin desatualizado`, `Hub daemon`, `Android: sonda do hub`, `Autenticação por token`, `Android: WebView e ponte`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `k` connect `xterm.js: sequências de controle` to `xterm.js: núcleo e encoding`, `xterm.js: apagar e deletar`, `xterm.js: handlers de parser`, `xterm.js: extended attrs`, `xterm.js: buffer de células`, `xterm.js: registro de handlers`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `info()` connect `xterm.js: seleção e logs` to `xterm.js: núcleo e encoding`, `Hub daemon`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **What connects `sh`, `Action`, `ACTIONS` to the rest of the system?**
  _531 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `xterm.js: núcleo e encoding` be split into smaller, more focused modules?**
  _Cohesion score 0.026998128842555466 - nodes in this community are weakly interconnected._
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:local_session/download/baixar.dart';
import 'package:local_session/download/nome.dart';
import 'package:local_session/ponte/ponte_web.dart';
import 'package:local_session/tela/navegacao.dart';

class TelaSessao extends StatefulWidget {
  const TelaSessao({
    super.key,
    required this.url,
    required this.host,
    required this.aoAbrirAjustes,
    required this.aoPerderOHub,
    required this.ponte,
    required this.aoCarregarPagina,
  });

  final String url;
  final String host;
  final VoidCallback aoAbrirAjustes;
  final VoidCallback aoPerderOHub;
  final PonteWeb ponte;
  final VoidCallback aoCarregarPagina;

  @override
  State<TelaSessao> createState() => _TelaSessaoState();
}

class _TelaSessaoState extends State<TelaSessao> {
  InAppWebViewController? _controle;

  @override
  void dispose() {
    widget.ponte.desligar();
    super.dispose();
  }

  Future<void> _voltar(bool jaSaiu) async {
    if (jaSaiu) return;
    final controle = _controle;
    if (controle != null && await controle.canGoBack()) {
      await controle.goBack();
      return;
    }
    if (mounted) Navigator.of(context).maybePop();
  }

  Future<void> _baixar(DownloadStartRequest pedido) async {
    if (!podeNavegar(widget.host, pedido.url)) return;
    final nome = nomeDoDownload(pedido.contentDisposition, pedido.url);
    final ok = await baixarParaDownloads(pedido.url, nome);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? 'baixando $nome para Downloads' : 'não consegui baixar $nome')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (jaSaiu, _) => _voltar(jaSaiu),
      child: Scaffold(
        body: SafeArea(
          child: InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri(widget.url)),
            initialUserScripts: UnmodifiableListView([
              UserScript(
                source: "document.documentElement.dataset.shell = 'app'",
                injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
              ),
            ]),
            initialSettings: InAppWebViewSettings(
              supportZoom: false,
              useHybridComposition: true,
              javaScriptCanOpenWindowsAutomatically: false,
              mediaPlaybackRequiresUserGesture: false,
              useOnDownloadStart: true,
            ),
            onDownloadStartRequest: (_, pedido) => _baixar(pedido),
            shouldOverrideUrlLoading: (_, acao) async =>
                podeNavegar(widget.host, acao.request.url)
                    ? NavigationActionPolicy.ALLOW
                    : NavigationActionPolicy.CANCEL,
            onWebViewCreated: (controle) {
              _controle = controle;
              widget.ponte.ligar(controle);
              controle.addJavaScriptHandler(
                handlerName: 'abrirAjustes',
                callback: (_) => widget.aoAbrirAjustes(),
              );
            },
            // A ponte JS nasce no fim de app.js: antes do load, entregar
            // compartilhamento cairia no vazio.
            onLoadStop: (_, url) {
              widget.ponte.marcarCarregada();
              widget.aoCarregarPagina();
            },
            onReceivedError: (_, requisicao, erro) {
              if (requisicao.isForMainFrame ?? false) widget.aoPerderOHub();
            },
          ),
        ),
      ),
    );
  }
}

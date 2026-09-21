import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:local_session/compartilhamento/item.dart';
import 'package:local_session/ponte/chamada.dart';

/// Braço do lado nativo dentro da página.
///
/// `pronto` exige a página **carregada**, não só a WebView criada: o
/// `window.localSession` nasce no fim de `app.js`, então entre `onWebViewCreated`
/// e `onLoadStop` a chamada devolveria null e o texto seria perdido.
class PonteWeb implements Composer {
  InAppWebViewController? _controle;
  bool _carregada = false;

  @override
  bool get pronto => _controle != null && _carregada;

  void ligar(InAppWebViewController controle) {
    _controle = controle;
    _carregada = false;
  }

  void marcarCarregada() => _carregada = true;

  void desligar() {
    _controle = null;
    _carregada = false;
  }

  @override
  Future<bool> inserir(String texto) async {
    final controle = _controle;
    if (controle == null) return false;
    final resposta = await controle.evaluateJavascript(source: chamadaInserir(texto));
    return resposta == true;
  }

  @override
  Future<String?> sessaoAtual() async {
    final controle = _controle;
    if (controle == null) return null;
    final resposta = await controle.evaluateJavascript(source: chamadaSessaoAtual);
    return resposta is String && resposta.isNotEmpty ? resposta : null;
  }
}

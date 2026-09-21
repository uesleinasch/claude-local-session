import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:local_session/ponte/chamada.dart';

/// Braço do lado nativo dentro da página. Fica sem controle enquanto a WebView
/// não existe — o que acontece de verdade quando o Android acorda o app por um
/// compartilhamento antes de a tela montar.
class PonteWeb {
  InAppWebViewController? _controle;

  void ligar(InAppWebViewController controle) => _controle = controle;

  void desligar() => _controle = null;

  Future<bool> inserirNoComposer(String texto) async {
    final controle = _controle;
    if (controle == null) return false;
    final resposta = await controle.evaluateJavascript(source: chamadaInserir(texto));
    return resposta == true;
  }

  Future<String?> sessaoAtual() async {
    final controle = _controle;
    if (controle == null) return null;
    final resposta = await controle.evaluateJavascript(source: chamadaSessaoAtual);
    return resposta is String && resposta.isNotEmpty ? resposta : null;
  }
}

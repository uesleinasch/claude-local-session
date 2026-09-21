import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/tela/navegacao.dart';

void main() {
  group('podeNavegar', () {
    test('a própria página do hub é permitida', () {
      expect(podeNavegar('192.168.0.10', Uri.parse('http://192.168.0.10:7777/')), isTrue);
      expect(
        podeNavegar('192.168.0.10', Uri.parse('http://192.168.0.10:7777/app.js')),
        isTrue,
      );
    });

    /// Dentro do app não existe barra de endereço: um link para fora tiraria a
    /// pessoa do hub sem nenhum sinal na tela.
    test('outro host é barrado', () {
      expect(podeNavegar('192.168.0.10', Uri.parse('https://exemplo.com/')), isFalse);
      expect(podeNavegar('192.168.0.10', Uri.parse('http://192.168.0.11:7777/')), isFalse);
    });

    test('esquema que não é http nem https é barrado', () {
      expect(podeNavegar('192.168.0.10', Uri.parse('javascript:alert(1)')), isFalse);
      expect(
        podeNavegar('192.168.0.10', Uri.parse('intent://x#Intent;scheme=http;end')),
        isFalse,
      );
    });

    test('about:blank passa — a própria WebView usa', () {
      expect(podeNavegar('192.168.0.10', Uri.parse('about:blank')), isTrue);
    });

    test('sem destino, não navega', () {
      expect(podeNavegar('192.168.0.10', null), isFalse);
    });
  });
}

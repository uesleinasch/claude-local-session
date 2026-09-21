import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/compartilhamento/anexo.dart';

void main() {
  group('caminhoDoUpload', () {
    test('lê o caminho que o hub devolveu', () {
      expect(
        caminhoDoUpload('{"path":"/home/eu/.claude/local-session/uploads/1.png"}'),
        '/home/eu/.claude/local-session/uploads/1.png',
      );
    });

    test('resposta sem caminho não vira anexo', () {
      expect(caminhoDoUpload('{"erro":"nope"}'), isNull);
      expect(caminhoDoUpload('não é json'), isNull);
      expect(caminhoDoUpload('{"path":""}'), isNull);
    });
  });

  group('mensagemDeAnexo', () {
    /// Texto idêntico ao que `withAttachment` monta em `web/app.js`: é ele que o
    /// Claude lê para saber que existe imagem e onde ela está.
    test('repete a frase que a página usa', () {
      expect(mensagemDeAnexo('/tmp/foto.png'), 'imagem anexada: /tmp/foto.png');
    });
  });
}

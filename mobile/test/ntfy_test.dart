import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/notificacao/ntfy.dart';

void main() {
  group('avisoDoEvento', () {
    test('mensagem do hub vira aviso com título e corpo', () {
      final aviso = avisoDoEvento({
        'id': 'kE8fzXyz',
        'event': 'message',
        'title': 'claude-local-session',
        'message': 'Permissão — Bash: git push',
      });
      expect(aviso, isNotNull);
      expect(aviso!.id, 'kE8fzXyz');
      expect(aviso.titulo, 'claude-local-session');
      expect(aviso.corpo, 'Permissão — Bash: git push');
    });

    /// O ntfy manda `open` ao abrir o stream e `keepalive` a cada ~45s; notificar
    /// esses dois encheria a barra de notificação de nada.
    test('open e keepalive não viram aviso', () {
      expect(avisoDoEvento({'id': 'a', 'event': 'open'}), isNull);
      expect(avisoDoEvento({'id': 'b', 'event': 'keepalive'}), isNull);
    });

    test('mensagem sem corpo não vira aviso', () {
      expect(avisoDoEvento({'id': 'c', 'event': 'message', 'title': 'x'}), isNull);
      expect(avisoDoEvento({'id': 'c', 'event': 'message', 'message': ''}), isNull);
    });

    test('sem título o aviso usa o nome do app', () {
      final aviso = avisoDoEvento({'id': 'd', 'event': 'message', 'message': 'oi'});
      expect(aviso!.titulo, 'Local Session');
    });

    test('evento sem id é descartado — sem ele não há como não repetir', () {
      expect(avisoDoEvento({'event': 'message', 'message': 'oi'}), isNull);
    });
  });

  group('urlDoStream', () {
    test('o tópico configurado no hub vira o stream JSON', () {
      expect(
        urlDoStream('https://ntfy.sh/meu-topico').toString(),
        'https://ntfy.sh/meu-topico/json',
      );
    });

    test('barra no fim não duplica', () {
      expect(
        urlDoStream('https://ntfy.sh/meu-topico/').toString(),
        'https://ntfy.sh/meu-topico/json',
      );
    });

    test('servidor próprio funciona igual', () {
      expect(
        urlDoStream('http://192.168.0.5:8080/avisos').toString(),
        'http://192.168.0.5:8080/avisos/json',
      );
    });

    test('lixo não vira stream', () {
      expect(urlDoStream(''), isNull);
      expect(urlDoStream('meu-topico'), isNull);
      expect(urlDoStream('https://ntfy.sh/'), isNull);
    });
  });
}

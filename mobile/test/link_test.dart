import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/pareamento/link.dart';

void main() {
  group('lerLink', () {
    test('extrai host, porta e token da URL que o QR carrega', () {
      final pareamento = lerLink('http://192.168.0.10:7777/?t=abc123');
      expect(pareamento, isNotNull);
      expect(pareamento!.host, '192.168.0.10');
      expect(pareamento.porta, 7777);
      expect(pareamento.token, 'abc123');
    });

    test('o nome do MagicDNS também serve de host', () {
      final pareamento = lerLink('http://estacao.tailnet.ts.net:7777/?t=abc');
      expect(pareamento!.host, 'estacao.tailnet.ts.net');
    });

    test('preserva o esquema, para o dia em que o hub servir https', () {
      expect(lerLink('https://estacao.tailnet.ts.net/?t=abc')!.esquema, 'https');
      expect(lerLink('http://192.168.0.10:7777/?t=abc')!.esquema, 'http');
    });

    /// Sem token o app só veria 404: parear assim seria prometer o que não funciona.
    test('URL sem token não pareia', () {
      expect(lerLink('http://192.168.0.10:7777/'), isNull);
    });

    test('token vazio não pareia', () {
      expect(lerLink('http://192.168.0.10:7777/?t='), isNull);
    });

    test('QR de outra coisa não pareia', () {
      expect(lerLink('receita de bolo'), isNull);
      expect(lerLink(''), isNull);
      expect(lerLink('ftp://192.168.0.10:7777/?t=abc'), isNull);
    });

    test('espaço em volta não atrapalha', () {
      expect(lerLink('  http://192.168.0.10:7777/?t=abc  ')!.token, 'abc');
    });

    test('sem porta explícita assume a do hub', () {
      expect(lerLink('http://192.168.0.10/?t=abc')!.porta, 7777);
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/descoberta/candidatos.dart';

Candidato lan(String host) => Candidato(rotulo: Rotulo.lan, host: host, porta: 7777);
Candidato vpn(String host) => Candidato(rotulo: Rotulo.vpn, host: host, porta: 7777);

void main() {
  group('candidatosDoPayload', () {
    test('lê o que o hub respondeu e carimba a porta dele em cada candidato', () {
      final lista = candidatosDoPayload({
        'versao': '0.12.1',
        'porta': 7777,
        'candidatos': [
          {'rotulo': 'lan', 'host': '192.168.0.10'},
          {'rotulo': 'vpn', 'host': 'estacao.tailnet.ts.net'},
        ],
      });
      expect(lista, hasLength(2));
      expect(lista.first.rotulo, Rotulo.lan);
      expect(lista.first.host, '192.168.0.10');
      expect(lista.first.porta, 7777);
      expect(lista.last.rotulo, Rotulo.vpn);
    });

    /// Hub mais novo pode inventar rótulo; o app velho ignora em vez de quebrar.
    test('entrada malformada é descartada sem derrubar o resto', () {
      final lista = candidatosDoPayload({
        'porta': 7777,
        'candidatos': [
          {'rotulo': 'quantico', 'host': 'x'},
          {'rotulo': 'lan'},
          {'rotulo': 'lan', 'host': 42},
          'nem objeto é',
          {'rotulo': 'lan', 'host': '192.168.0.10'},
        ],
      });
      expect(lista, hasLength(1));
      expect(lista.single.host, '192.168.0.10');
    });

    test('payload sem candidatos devolve lista vazia', () {
      expect(candidatosDoPayload({'porta': 7777}), isEmpty);
      expect(candidatosDoPayload({'candidatos': 'nada disso'}), isEmpty);
    });

    test('sem porta no payload cai na porta do hub', () {
      final lista = candidatosDoPayload({
        'candidatos': [
          {'rotulo': 'lan', 'host': '192.168.0.10'},
        ],
      });
      expect(lista.single.porta, 7777);
    });
  });

  group('rotuloDoHost', () {
    /// Mesma faixa CGNAT que `isCgnat` reconhece em `src/config.ts`.
    test('endereço da tailnet é VPN', () {
      expect(rotuloDoHost('100.101.102.103'), Rotulo.vpn);
      expect(rotuloDoHost('estacao.tailnet.ts.net'), Rotulo.vpn);
    });

    test('resto é rede local', () {
      expect(rotuloDoHost('192.168.0.10'), Rotulo.lan);
      expect(rotuloDoHost('10.0.0.5'), Rotulo.lan);
      expect(rotuloDoHost('estacao.local'), Rotulo.lan);
    });

    test('100.x fora da faixa CGNAT não é tailnet', () {
      expect(rotuloDoHost('100.200.0.1'), Rotulo.lan);
      expect(rotuloDoHost('100.5.0.1'), Rotulo.lan);
    });
  });

  group('paraTentar', () {
    final conhecidos = [lan('192.168.0.10'), lan('estacao.local'), vpn('estacao.ts.net')];

    test('no automático tenta todo mundo', () {
      expect(paraTentar(conhecidos: conhecidos, modo: ModoRede.automatico), hasLength(3));
    });

    test('só rede local deixa a VPN de fora', () {
      final lista = paraTentar(conhecidos: conhecidos, modo: ModoRede.apenasLan);
      expect(lista.every((c) => c.rotulo == Rotulo.lan), isTrue);
      expect(lista, hasLength(2));
    });

    test('só VPN deixa a LAN de fora', () {
      final lista = paraTentar(conhecidos: conhecidos, modo: ModoRede.apenasVpn);
      expect(lista.single.host, 'estacao.ts.net');
    });

    /// Quem funcionou da última vez costuma funcionar de novo: economiza a espera.
    test('o último vencedor abre a fila', () {
      final lista = paraTentar(
        conhecidos: conhecidos,
        modo: ModoRede.automatico,
        ultimoVencedor: vpn('estacao.ts.net'),
      );
      expect(lista.first.host, 'estacao.ts.net');
      expect(lista, hasLength(3));
    });

    test('vencedor que o modo exclui não volta pela porta dos fundos', () {
      final lista = paraTentar(
        conhecidos: conhecidos,
        modo: ModoRede.apenasLan,
        ultimoVencedor: vpn('estacao.ts.net'),
      );
      expect(lista.any((c) => c.rotulo == Rotulo.vpn), isFalse);
    });

    test('o mesmo host duas vezes é tentado uma só', () {
      final lista = paraTentar(
        conhecidos: [lan('192.168.0.10'), lan('192.168.0.10')],
        modo: ModoRede.automatico,
      );
      expect(lista, hasLength(1));
    });
  });

  group('correr', () {
    test('devolve quem respondeu, não quem estava na frente', () async {
      final vencedor = await correr(
        [lan('mudo'), vpn('responde')],
        (c) async => c.host == 'responde',
      );
      expect(vencedor?.host, 'responde');
    });

    test('ninguém responde, ninguém vence', () async {
      expect(await correr([lan('mudo')], (_) async => false), isNull);
    });

    test('lista vazia não trava', () async {
      expect(await correr([], (_) async => true), isNull);
    });

    /// A sonda joga quando a rede recusa a conexão — isso é resposta negativa,
    /// não erro do app.
    test('sonda que explode conta como não respondeu', () async {
      final vencedor = await correr(
        [lan('explode'), vpn('responde')],
        (c) async {
          if (c.host == 'explode') throw Exception('sem rota');
          return true;
        },
      );
      expect(vencedor?.host, 'responde');
    });

    test('não espera o lento quando o rápido já respondeu', () async {
      final vencedor = await correr(
        [lan('lento'), vpn('rapido')],
        (c) async {
          if (c.host == 'lento') {
            await Future<void>.delayed(const Duration(seconds: 30));
          }
          return true;
        },
        limite: const Duration(seconds: 2),
      );
      expect(vencedor?.host, 'rapido');
    });

    test('todos lentos: o limite encerra a corrida sem vencedor', () async {
      final vencedor = await correr(
        [lan('lento')],
        (_) async {
          await Future<void>.delayed(const Duration(seconds: 30));
          return true;
        },
        limite: const Duration(milliseconds: 50),
      );
      expect(vencedor, isNull);
    });
  });
}

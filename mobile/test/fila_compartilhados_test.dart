import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/compartilhamento/fila.dart';
import 'package:local_session/compartilhamento/item.dart';

class ComposerFalso implements Composer {
  ComposerFalso({this.pronto = true});

  @override
  bool pronto;

  final inseridos = <String>[];
  String? sessao = 'sessao-1';

  @override
  Future<bool> inserir(String texto) async {
    if (!pronto) return false;
    inseridos.add(texto);
    return true;
  }

  @override
  Future<String?> sessaoAtual() async => pronto ? sessao : null;
}

void main() {
  group('FilaDeCompartilhados', () {
    test('texto compartilhado chega ao composer', () async {
      final composer = ComposerFalso();
      final fila = FilaDeCompartilhados(composer: composer, subirImagem: (_) async => null);

      await fila.receber([const ItemCompartilhado.texto('olha isso')]);

      expect(composer.inseridos, ['olha isso']);
      expect(fila.pendentes, isZero);
    });

    /// O Android acorda o app por um compartilhamento antes de a WebView carregar:
    /// entregar nessa hora perderia o texto em silêncio.
    test('com a página ainda fechada o item espera na fila', () async {
      final composer = ComposerFalso(pronto: false);
      final fila = FilaDeCompartilhados(composer: composer, subirImagem: (_) async => null);

      await fila.receber([const ItemCompartilhado.texto('olha isso')]);

      expect(composer.inseridos, isEmpty);
      expect(fila.pendentes, 1);
    });

    test('quando a página carrega, o que esperava é entregue', () async {
      final composer = ComposerFalso(pronto: false);
      final fila = FilaDeCompartilhados(composer: composer, subirImagem: (_) async => null);
      await fila.receber([const ItemCompartilhado.texto('primeiro')]);

      composer.pronto = true;
      await fila.entregar();

      expect(composer.inseridos, ['primeiro']);
      expect(fila.pendentes, isZero);
    });

    test('imagem sobe pelo hub e só o caminho vai para o composer', () async {
      final composer = ComposerFalso();
      final enviadas = <String>[];
      final fila = FilaDeCompartilhados(
        composer: composer,
        subirImagem: (caminho) async {
          enviadas.add(caminho);
          return '/home/eu/.claude/local-session/uploads/7.png';
        },
      );

      await fila.receber([const ItemCompartilhado.imagem('/sdcard/foto.jpg')]);

      expect(enviadas, ['/sdcard/foto.jpg']);
      expect(composer.inseridos, [
        'imagem anexada: /home/eu/.claude/local-session/uploads/7.png',
      ]);
    });

    /// Upload que falhou não pode sumir: a foto volta para a fila e tenta na
    /// próxima entrega, quando a rede talvez esteja de volta.
    test('imagem que não subiu continua pendente', () async {
      final composer = ComposerFalso();
      final fila = FilaDeCompartilhados(composer: composer, subirImagem: (_) async => null);

      await fila.receber([const ItemCompartilhado.imagem('/sdcard/foto.jpg')]);

      expect(composer.inseridos, isEmpty);
      expect(fila.pendentes, 1);
    });

    test('entregar sem nada pendente não faz nada', () async {
      final composer = ComposerFalso();
      final fila = FilaDeCompartilhados(composer: composer, subirImagem: (_) async => null);

      await fila.entregar();

      expect(composer.inseridos, isEmpty);
    });
  });
}

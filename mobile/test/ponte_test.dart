import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/ponte/chamada.dart';

void main() {
  group('chamadaInserir', () {
    test('chama a função que a página expõe', () {
      expect(
        chamadaInserir('oi'),
        'window.localSession?.inserirNoComposer("oi")',
      );
    });

    /// O texto vem de outro app e a página roda com o token do hub: concatenar
    /// sem escapar seria injeção de JS na origem autenticada.
    test('aspas e quebras de linha viram literal, não código', () {
      expect(
        chamadaInserir('a"); alert(1); ("'),
        r'window.localSession?.inserirNoComposer("a\"); alert(1); (\"")',
      );
      expect(chamadaInserir('linha1\nlinha2'), contains(r'linha1\nlinha2'));
    });

    test('barra invertida não escapa do literal', () {
      expect(chamadaInserir(r'fim\" ); alert(1)'), endsWith(r'alert(1)")'));
      expect(chamadaInserir(r'c:\temp'), contains(r'c:\\temp'));
    });
  });
}

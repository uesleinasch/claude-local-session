import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/download/nome.dart';

void main() {
  group('nomeDoDownload', () {
    test('prefere o filename* codificado do hub', () {
      expect(
        nomeDoDownload(
          "attachment; filename=\"relat_rio.pdf\"; filename*=UTF-8''relat%C3%B3rio.pdf",
          Uri.parse('http://h:7777/_download?path=%2Fx%2Fy.pdf'),
        ),
        'relatório.pdf',
      );
    });

    test('sem filename*, usa o filename entre aspas', () {
      expect(nomeDoDownload('attachment; filename="a.txt"', Uri.parse('http://h/_download')), 'a.txt');
    });

    test('sem cabeçalho, cai no último pedaço do path pedido', () {
      expect(
        nomeDoDownload(null, Uri.parse('http://h:7777/_download?path=%2Fhome%2Feu%2Fnota.md')),
        'nota.md',
      );
    });

    test('barra e nome vazio nunca viram caminho fora de Downloads', () {
      expect(
        nomeDoDownload("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fx", Uri.parse('http://h/_download')),
        'x',
      );
      expect(nomeDoDownload("attachment; filename*=UTF-8''..", Uri.parse('http://h/_download')), 'download');
      expect(nomeDoDownload(null, Uri.parse('http://h/_download')), 'download');
    });

    test('codificação quebrada não derruba', () {
      expect(nomeDoDownload("attachment; filename*=UTF-8''%E0%A4%A", Uri.parse('http://h/')), 'download');
    });
  });
}

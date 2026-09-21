import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/notificacao/memoria.dart';

void main() {
  group('MemoriaDeAvisos', () {
    test('aviso inédito passa', () {
      expect(MemoriaDeAvisos().inedito('abc'), isTrue);
    });

    /// Reconectar no ntfy relê as mensagens recentes; sem memória, cada retomada
    /// de rede repetiria toda a fila na barra de notificação.
    test('o mesmo aviso não passa duas vezes', () {
      final memoria = MemoriaDeAvisos();
      expect(memoria.inedito('abc'), isTrue);
      expect(memoria.inedito('abc'), isFalse);
    });

    test('esquece o mais antigo ao encher, como o MAX_SEEN do hub', () {
      final memoria = MemoriaDeAvisos(maximo: 2);
      memoria.inedito('a');
      memoria.inedito('b');
      memoria.inedito('c');
      expect(memoria.inedito('a'), isTrue);
      expect(memoria.inedito('c'), isFalse);
    });
  });
}

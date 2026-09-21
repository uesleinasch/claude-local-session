import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_session/pareamento/link.dart';

/// O token dá `Bash` na máquina do hub: fica no armazenamento cifrado do
/// Android, nunca em `SharedPreferences`.
class Cofre {
  const Cofre();

  static const _armazenamento = FlutterSecureStorage();

  static const _chave = 'pareamento';

  Future<Pareamento?> ler() async {
    final bruto = await _armazenamento.read(key: _chave);
    return bruto == null ? null : lerLink(bruto);
  }

  Future<void> guardar(Pareamento pareamento) async {
    final url =
        '${pareamento.esquema}://${pareamento.host}:${pareamento.porta}/?t=${pareamento.token}';
    await _armazenamento.write(key: _chave, value: url);
  }

  Future<void> esquecer() => _armazenamento.delete(key: _chave);
}

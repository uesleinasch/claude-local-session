/// Mesmo teto do `MAX_SEEN` em `src/notify.ts`.
const maximoLembrado = 1000;

/// O ntfy reentrega mensagens recentes quando o stream reconecta; sem esta
/// memória, toda retomada de rede repetiria a fila inteira na barra.
class MemoriaDeAvisos {
  MemoriaDeAvisos({this.maximo = maximoLembrado});

  final int maximo;
  final _vistos = <String>{};
  final _ordem = <String>[];

  bool inedito(String id) {
    if (!_vistos.add(id)) return false;
    _ordem.add(id);
    if (_ordem.length > maximo) _vistos.remove(_ordem.removeAt(0));
    return true;
  }
}

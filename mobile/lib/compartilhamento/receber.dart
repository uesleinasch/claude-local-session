import 'package:local_session/compartilhamento/fila.dart';
import 'package:local_session/compartilhamento/item.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

/// Casca do plugin de compartilhamento: traduz o que o Android entregou para a
/// fila, que é quem decide quando dá para entregar à página.
class ReceptorDeCompartilhamento {
  const ReceptorDeCompartilhamento({required this.fila});

  final FilaDeCompartilhados fila;

  Future<void> processar(List<SharedMediaFile> midias) async {
    final itens = midias.map(_converter).whereType<ItemCompartilhado>().toList();
    if (itens.isEmpty) return;

    await fila.receber(itens);
    // Sem o reset, reabrir o app reprocessaria o mesmo compartilhamento.
    ReceiveSharingIntent.instance.reset();
  }

  ItemCompartilhado? _converter(SharedMediaFile midia) => switch (midia.type) {
    // Em texto e link, `path` carrega o próprio conteúdo, não um arquivo.
    SharedMediaType.text || SharedMediaType.url => ItemCompartilhado.texto(midia.path),
    SharedMediaType.image => ItemCompartilhado.imagem(midia.path),
    SharedMediaType.video || SharedMediaType.file => null,
  };
}

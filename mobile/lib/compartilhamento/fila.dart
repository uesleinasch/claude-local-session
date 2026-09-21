import 'package:local_session/compartilhamento/anexo.dart';
import 'package:local_session/compartilhamento/item.dart';

/// Sobe a imagem e devolve o caminho dela no hub, ou null se não subiu.
typedef SubirImagem = Future<String?> Function(String caminhoNoAparelho);

/// O Android entrega o compartilhamento assim que acorda o app, antes de a página
/// carregar — e a ponte só existe depois disso. Quem não pôde ser entregue espera
/// aqui em vez de virar silêncio.
class FilaDeCompartilhados {
  FilaDeCompartilhados({required this.composer, required this.subirImagem});

  final Composer composer;
  final SubirImagem subirImagem;

  final _espera = <ItemCompartilhado>[];

  int get pendentes => _espera.length;

  Future<void> receber(List<ItemCompartilhado> itens) async {
    _espera.addAll(itens);
    await entregar();
  }

  Future<void> entregar() async {
    if (_espera.isEmpty || !composer.pronto) return;

    final fila = List<ItemCompartilhado>.from(_espera);
    _espera.clear();

    for (final item in fila) {
      if (!await _entregarUm(item)) _espera.add(item);
    }
  }

  Future<bool> _entregarUm(ItemCompartilhado item) async {
    switch (item.tipo) {
      case TipoCompartilhado.texto:
        return composer.inserir(item.valor);
      case TipoCompartilhado.imagem:
        final caminhoNoHub = await subirImagem(item.valor);
        if (caminhoNoHub == null) return false;
        return composer.inserir(mensagemDeAnexo(caminhoNoHub));
    }
  }
}

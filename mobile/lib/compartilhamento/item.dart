enum TipoCompartilhado { texto, imagem }

class ItemCompartilhado {
  const ItemCompartilhado.texto(this.valor) : tipo = TipoCompartilhado.texto;

  const ItemCompartilhado.imagem(this.valor) : tipo = TipoCompartilhado.imagem;

  final TipoCompartilhado tipo;

  /// Texto compartilhado, ou o caminho do arquivo no aparelho.
  final String valor;
}

/// O que a fila precisa da página, sem saber que existe WebView — é o que deixa a
/// entrega testável sem Android.
abstract interface class Composer {
  bool get pronto;

  Future<bool> inserir(String texto);

  Future<String?> sessaoAtual();
}

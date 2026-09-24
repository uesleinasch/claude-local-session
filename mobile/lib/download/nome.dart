const _padrao = 'download';

String nomeDoDownload(String? disposicao, Uri url) {
  final bruto = _doCabecalho(disposicao) ?? _doPath(url);
  return _seguro(bruto);
}

String? _doCabecalho(String? disposicao) {
  if (disposicao == null) return null;
  final codificado = RegExp(r"filename\*=UTF-8''([^;\s]+)", caseSensitive: false).firstMatch(disposicao);
  if (codificado != null) {
    try {
      return Uri.decodeComponent(codificado.group(1)!);
    } on ArgumentError {
      return null;
    } on FormatException {
      return null;
    }
  }
  return RegExp(r'filename="([^"]*)"', caseSensitive: false).firstMatch(disposicao)?.group(1);
}

String? _doPath(Uri url) => url.queryParameters['path'];

String _seguro(String? nome) {
  if (nome == null) return _padrao;
  final ultimo = nome.split('/').last.replaceAll(RegExp(r'[\x00-\x1f]'), '').trim();
  if (ultimo.isEmpty || ultimo == '.' || ultimo == '..') return _padrao;
  return ultimo;
}

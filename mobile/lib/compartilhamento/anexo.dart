import 'dart:convert';

String? caminhoDoUpload(String corpo) {
  try {
    final json = jsonDecode(corpo);
    if (json is! Map) return null;
    final caminho = json['path'];
    return caminho is String && caminho.isNotEmpty ? caminho : null;
  } catch (_) {
    return null;
  }
}

/// Mesma frase que `withAttachment` monta em `web/app.js` — é por ela que o
/// Claude sabe que há imagem e onde ela está. Mudar de um lado só quebra o outro.
String mensagemDeAnexo(String caminho) => 'imagem anexada: $caminho';

import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:local_session/compartilhamento/anexo.dart';

/// Sobe a imagem pela mesma rota que o clipe da página usa. O hub reconhece
/// imagem pelos bytes, então nome e content-type não importam aqui.
Future<String?> enviarImagem({
  required String baseUrl,
  required String token,
  required String sessao,
  required Uint8List bytes,
}) async {
  final uri = Uri.parse(
    '$baseUrl/_upload',
  ).replace(queryParameters: {'session': sessao, 't': token});

  try {
    final resposta = await http.post(uri, body: bytes);
    if (resposta.statusCode != 200) return null;
    return caminhoDoUpload(resposta.body);
  } catch (_) {
    return null;
  }
}

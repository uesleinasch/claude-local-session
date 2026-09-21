import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:local_session/descoberta/candidatos.dart';

/// Bate no `/_endpoints` de cada candidato. Guarda o payload de quem respondeu
/// para o app renovar a lista de endereços sem uma segunda requisição.
class Sonda {
  Sonda({
    required this.token,
    required this.esquema,
    this.limite = const Duration(milliseconds: 1500),
  });

  final String token;
  final String esquema;
  final Duration limite;

  final Map<String, Map<String, dynamic>> _payloads = {};

  Future<bool> testar(Candidato candidato) async {
    final uri = Uri.parse(
      '${candidato.baseUrl(esquema)}/_endpoints',
    ).replace(queryParameters: {'t': token});

    final resposta = await http.get(uri).timeout(limite);
    if (resposta.statusCode != 200) return false;

    final payload = jsonDecode(resposta.body);
    if (payload is! Map<String, dynamic>) return false;

    _payloads[candidato.host] = payload;
    return true;
  }

  Map<String, dynamic>? payloadDe(Candidato candidato) => _payloads[candidato.host];
}

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:local_session/notificacao/memoria.dart';
import 'package:local_session/notificacao/ntfy.dart';

/// Stream de eventos do ntfy: uma linha JSON por evento, conexão aberta até cair.
/// Quem decide o que vira notificação é `avisoDoEvento`; aqui só entra I/O.
Stream<Aviso> escutarNtfy(Uri stream, {http.Client? cliente, MemoriaDeAvisos? memoria}) async* {
  final conexao = cliente ?? http.Client();
  final lembrados = memoria ?? MemoriaDeAvisos();

  final resposta = await conexao.send(http.Request('GET', stream));
  if (resposta.statusCode != 200) return;

  final linhas = resposta.stream.transform(utf8.decoder).transform(const LineSplitter());
  await for (final linha in linhas) {
    if (linha.trim().isEmpty) continue;

    Object? evento;
    try {
      evento = jsonDecode(linha);
    } catch (_) {
      continue;
    }
    if (evento is! Map<String, dynamic>) continue;

    final aviso = avisoDoEvento(evento);
    if (aviso != null && lembrados.inedito(aviso.id)) yield aviso;
  }
}

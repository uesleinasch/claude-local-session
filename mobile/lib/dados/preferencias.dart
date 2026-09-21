import 'dart:convert';

import 'package:local_session/descoberta/candidatos.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Preferencias {
  const Preferencias();

  static const _chaveModo = 'modo_rede';
  static const _chaveDescoberta = 'ultima_descoberta';
  static const _chaveVencedor = 'ultimo_vencedor';

  Future<ModoRede> lerModo() async {
    final prefs = await SharedPreferences.getInstance();
    final nome = prefs.getString(_chaveModo);
    return ModoRede.values.firstWhere(
      (m) => m.name == nome,
      orElse: () => ModoRede.automatico,
    );
  }

  Future<void> salvarModo(ModoRede modo) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_chaveModo, modo.name);
  }

  /// Guarda o payload cru do `/_endpoints` para relê-lo com a mesma função pura
  /// que interpreta a resposta do hub.
  Future<void> salvarDescoberta(Map<String, dynamic> payload) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_chaveDescoberta, jsonEncode(payload));
  }

  Future<List<Candidato>> lerCandidatos() async {
    final prefs = await SharedPreferences.getInstance();
    final bruto = prefs.getString(_chaveDescoberta);
    if (bruto == null) return const [];
    try {
      final payload = jsonDecode(bruto);
      return payload is Map<String, dynamic> ? candidatosDoPayload(payload) : const [];
    } catch (_) {
      return const [];
    }
  }

  Future<String?> lerVersaoDoHub() async {
    final prefs = await SharedPreferences.getInstance();
    final bruto = prefs.getString(_chaveDescoberta);
    if (bruto == null) return null;
    try {
      final payload = jsonDecode(bruto);
      final versao = payload is Map<String, dynamic> ? payload['versao'] : null;
      return versao is String ? versao : null;
    } catch (_) {
      return null;
    }
  }

  Future<Candidato?> lerVencedor() async {
    final prefs = await SharedPreferences.getInstance();
    final bruto = prefs.getString(_chaveVencedor);
    if (bruto == null) return null;
    try {
      final json = jsonDecode(bruto);
      if (json is! Map<String, dynamic>) return null;
      final lista = candidatosDoPayload({
        'porta': json['porta'],
        'candidatos': [json],
      });
      return lista.isEmpty ? null : lista.single;
    } catch (_) {
      return null;
    }
  }

  Future<void> salvarVencedor(Candidato candidato) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _chaveVencedor,
      jsonEncode({
        'rotulo': candidato.rotulo.name,
        'host': candidato.host,
        'porta': candidato.porta,
      }),
    );
  }
}

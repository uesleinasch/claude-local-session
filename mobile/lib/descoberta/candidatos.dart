import 'dart:async';

import 'package:local_session/pareamento/link.dart';

enum Rotulo { lan, vpn }

enum ModoRede { automatico, apenasLan, apenasVpn }

class Candidato {
  const Candidato({required this.rotulo, required this.host, required this.porta});

  final Rotulo rotulo;
  final String host;
  final int porta;

  String baseUrl(String esquema) => '$esquema://$host:$porta';

  @override
  bool operator ==(Object other) =>
      other is Candidato && other.host == host && other.porta == porta;

  @override
  int get hashCode => Object.hash(host, porta);
}

/// 100.64.0.0/10 é a faixa CGNAT das tailnets — a mesma que `isCgnat` usa em
/// `src/config.ts`. Sem isto, o endereço pareado por QR entraria como LAN e o
/// modo "só VPN" descartaria justamente ele.
Rotulo rotuloDoHost(String host) {
  if (host.endsWith('.ts.net')) return Rotulo.vpn;
  final partes = host.split('.');
  if (partes.length == 4) {
    final primeiro = int.tryParse(partes[0]);
    final segundo = int.tryParse(partes[1]);
    if (primeiro == 100 && segundo != null && segundo >= 64 && segundo <= 127) {
      return Rotulo.vpn;
    }
  }
  return Rotulo.lan;
}

Rotulo? _rotulo(Object? bruto) => switch (bruto) {
  'lan' => Rotulo.lan,
  'vpn' => Rotulo.vpn,
  _ => null,
};

List<Candidato> candidatosDoPayload(Map<String, dynamic> payload) {
  final brutos = payload['candidatos'];
  if (brutos is! List) return const [];

  final porta = payload['porta'];
  final portaHub = porta is int ? porta : portaPadrao;

  final lista = <Candidato>[];
  for (final bruto in brutos) {
    if (bruto is! Map) continue;
    final rotulo = _rotulo(bruto['rotulo']);
    final host = bruto['host'];
    if (rotulo == null || host is! String || host.isEmpty) continue;
    lista.add(Candidato(rotulo: rotulo, host: host, porta: portaHub));
  }
  return lista;
}

bool _cabeNoModo(Candidato candidato, ModoRede modo) => switch (modo) {
  ModoRede.automatico => true,
  ModoRede.apenasLan => candidato.rotulo == Rotulo.lan,
  ModoRede.apenasVpn => candidato.rotulo == Rotulo.vpn,
};

List<Candidato> paraTentar({
  required List<Candidato> conhecidos,
  required ModoRede modo,
  Candidato? ultimoVencedor,
}) {
  final fila = [
    ?ultimoVencedor,
    ...conhecidos,
  ].where((c) => _cabeNoModo(c, modo));

  final vistos = <Candidato>{};
  return fila.where(vistos.add).toList();
}

/// Dispara todos de uma vez e fica com o primeiro que responder. Sonda entra como
/// parâmetro para o teste correr sem rede.
Future<Candidato?> correr(
  List<Candidato> candidatos,
  Future<bool> Function(Candidato) sonda, {
  Duration limite = const Duration(milliseconds: 1500),
}) {
  if (candidatos.isEmpty) return Future.value(null);

  final vencedor = Completer<Candidato?>();
  var pendentes = candidatos.length;

  for (final candidato in candidatos) {
    unawaited(() async {
      var respondeu = false;
      try {
        respondeu = await sonda(candidato);
      } catch (_) {
        respondeu = false;
      }
      if (vencedor.isCompleted) return;
      if (respondeu) {
        vencedor.complete(candidato);
        return;
      }
      pendentes--;
      if (pendentes == 0) vencedor.complete(null);
    }());
  }

  return vencedor.future.timeout(limite, onTimeout: () => null);
}

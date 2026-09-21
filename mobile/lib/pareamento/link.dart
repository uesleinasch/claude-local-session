/// Porta do hub quando o QR não traz uma — espelha `DEFAULT_PORT` de `src/protocol.ts`.
const portaPadrao = 7777;

class Pareamento {
  const Pareamento({
    required this.esquema,
    required this.host,
    required this.porta,
    required this.token,
  });

  final String esquema;
  final String host;
  final int porta;
  final String token;
}

Pareamento? lerLink(String bruto) {
  final uri = Uri.tryParse(bruto.trim());
  if (uri == null) return null;
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;
  if (uri.host.isEmpty) return null;

  final token = uri.queryParameters['t'] ?? '';
  if (token.isEmpty) return null;

  return Pareamento(
    esquema: uri.scheme,
    host: uri.host,
    porta: uri.hasPort ? uri.port : portaPadrao,
    token: token,
  );
}

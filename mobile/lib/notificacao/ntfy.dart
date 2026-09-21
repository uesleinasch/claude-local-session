class Aviso {
  const Aviso({required this.id, required this.titulo, required this.corpo});

  final String id;
  final String titulo;
  final String corpo;
}

Aviso? avisoDoEvento(Map<String, dynamic> evento) {
  if (evento['event'] != 'message') return null;

  final id = evento['id'];
  if (id is! String || id.isEmpty) return null;

  final corpo = evento['message'];
  if (corpo is! String || corpo.isEmpty) return null;

  final titulo = evento['title'];
  return Aviso(
    id: id,
    titulo: titulo is String && titulo.isNotEmpty ? titulo : 'Local Session',
    corpo: corpo,
  );
}

/// `notifyUrl` no config do hub aponta para o tópico; o stream de eventos é o
/// mesmo endereço com `/json`.
Uri? urlDoStream(String notifyUrl) {
  final uri = Uri.tryParse(notifyUrl.trim());
  if (uri == null) return null;
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;

  final partes = uri.pathSegments.where((p) => p.isNotEmpty).toList();
  if (partes.isEmpty) return null;

  return uri.replace(pathSegments: [...partes, 'json'], query: null);
}

import 'package:flutter/services.dart';

const _canal = MethodChannel('local_session/download');

Future<bool> baixarParaDownloads(Uri url, String nome) async {
  try {
    await _canal.invokeMethod<int>('baixar', {'url': url.toString(), 'nome': nome});
    return true;
  } on PlatformException {
    return false;
  }
}

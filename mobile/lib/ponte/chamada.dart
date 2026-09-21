import 'dart:convert';

/// `window.localSession` é definido no fim de `web/app.js`. O `?.` evita explodir
/// num hub antigo, que ainda não expõe a ponte.
///
/// O texto vem de outro app do Android e a página roda autenticada com o token
/// do hub: ele entra como literal JSON, nunca concatenado no código.
String chamadaInserir(String texto) =>
    'window.localSession?.inserirNoComposer(${jsonEncode(texto)})';

const chamadaSessaoAtual = 'window.localSession?.sessaoAtual() ?? null';

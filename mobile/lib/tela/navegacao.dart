/// A WebView não tem barra de endereço: sair do hub por um link do feed tiraria a
/// pessoa da sessão sem nenhum sinal na tela. Só o host pareado navega aqui.
bool podeNavegar(String hostDoHub, Uri? destino) {
  if (destino == null) return false;
  if (destino.toString() == 'about:blank') return true;
  if (destino.scheme != 'http' && destino.scheme != 'https') return false;
  return destino.host == hostDoHub;
}

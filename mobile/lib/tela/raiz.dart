import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:local_session/compartilhamento/enviar_imagem.dart';
import 'package:local_session/compartilhamento/fila.dart';
import 'package:local_session/compartilhamento/receber.dart';
import 'package:local_session/dados/cofre.dart';
import 'package:local_session/dados/preferencias.dart';
import 'package:local_session/descoberta/candidatos.dart';
import 'package:local_session/descoberta/sonda.dart';
import 'package:local_session/notificacao/servico.dart';
import 'package:local_session/pareamento/link.dart';
import 'package:local_session/ponte/ponte_web.dart';
import 'package:local_session/tela/ajustes.dart';
import 'package:local_session/tela/pareamento.dart';
import 'package:local_session/tela/sessao.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

enum _Fase { carregando, semPareamento, procurando, conectado, semHub }

class TelaRaiz extends StatefulWidget {
  const TelaRaiz({super.key});

  @override
  State<TelaRaiz> createState() => _TelaRaizState();
}

class _TelaRaizState extends State<TelaRaiz> with WidgetsBindingObserver {
  final _ponte = PonteWeb();
  late final _fila = FilaDeCompartilhados(composer: _ponte, subirImagem: _subirImagem);
  late final _receptor = ReceptorDeCompartilhamento(fila: _fila);
  StreamSubscription<List<SharedMediaFile>>? _compartilhados;

  static const _cofre = Cofre();
  static const _prefs = Preferencias();
  static const _avisos = ServicoDeAvisos();

  _Fase _fase = _Fase.carregando;
  Pareamento? _pareamento;
  ModoRede _modo = ModoRede.automatico;
  Candidato? _vencedor;
  String? _versaoDoHub;
  String? _topicoNtfy;
  bool _avisosLigados = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _comecar();
    _ouvirCompartilhamentos();
  }

  @override
  void dispose() {
    _compartilhados?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// O Android pode acordar o app por um compartilhamento antes de a WebView
  /// existir; a ponte devolve `false` nesse caso e nada é perdido em silêncio.
  void _ouvirCompartilhamentos() {
    _compartilhados = ReceiveSharingIntent.instance.getMediaStream().listen(
      _receptor.processar,
      onError: (_) {},
    );
    unawaited(
      ReceiveSharingIntent.instance.getInitialMedia().then(_receptor.processar),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    // Voltar para o app depois de trocar de rede é o caso mais comum de o
    // endereço antigo não valer mais.
    if (estado == AppLifecycleState.resumed && _fase == _Fase.semHub) _procurar();
  }

  Future<void> _comecar() async {
    await _avisos.preparar();
    final pareamento = await _cofre.ler();
    final modo = await _prefs.lerModo();
    final versao = await _prefs.lerVersaoDoHub();
    final topico = await _prefs.lerTopicoNtfy();
    final avisosLigados = await _avisos.ligado();
    if (!mounted) return;

    setState(() {
      _pareamento = pareamento;
      _modo = modo;
      _versaoDoHub = versao;
      _topicoNtfy = topico;
      _avisosLigados = avisosLigados;
    });

    if (pareamento == null) {
      setState(() => _fase = _Fase.semPareamento);
      return;
    }
    await _procurar();
  }

  Future<void> _procurar() async {
    final pareamento = _pareamento;
    if (pareamento == null) return;

    setState(() => _fase = _Fase.procurando);

    final doQr = Candidato(
      rotulo: rotuloDoHost(pareamento.host),
      host: pareamento.host,
      porta: pareamento.porta,
    );
    final fila = paraTentar(
      conhecidos: [doQr, ...await _prefs.lerCandidatos()],
      modo: _modo,
      ultimoVencedor: await _prefs.lerVencedor(),
    );

    final sonda = Sonda(token: pareamento.token, esquema: pareamento.esquema);
    final vencedor = await correr(fila, sonda.testar);
    if (!mounted) return;

    if (vencedor == null) {
      setState(() => _fase = _Fase.semHub);
      return;
    }

    final payload = sonda.payloadDe(vencedor);
    if (payload != null) await _prefs.salvarDescoberta(payload);
    await _prefs.salvarVencedor(vencedor);
    final versao = await _prefs.lerVersaoDoHub();
    final topico = await _prefs.lerTopicoNtfy();
    if (!mounted) return;

    setState(() {
      _vencedor = vencedor;
      _versaoDoHub = versao;
      _topicoNtfy = topico;
      _fase = _Fase.conectado;
    });
  }

  Future<String?> _subirImagem(String caminhoNoAparelho) async {
    final pareamento = _pareamento;
    final vencedor = _vencedor;
    if (pareamento == null || vencedor == null) return null;

    final sessao = await _ponte.sessaoAtual();
    if (sessao == null) return null;

    final arquivo = File(caminhoNoAparelho);
    if (!arquivo.existsSync()) return null;

    return enviarImagem(
      baseUrl: vencedor.baseUrl(pareamento.esquema),
      token: pareamento.token,
      sessao: sessao,
      bytes: await arquivo.readAsBytes(),
    );
  }

  Future<void> _parear(Pareamento pareamento) async {
    await _cofre.guardar(pareamento);
    if (!mounted) return;
    setState(() => _pareamento = pareamento);
    await _procurar();
  }

  Future<void> _trocarModo(ModoRede modo) async {
    await _prefs.salvarModo(modo);
    if (!mounted) return;
    setState(() => _modo = modo);
  }

  Future<void> _parearOutro() async {
    await _cofre.esquecer();
    if (!mounted) return;
    setState(() {
      _pareamento = null;
      _vencedor = null;
      _fase = _Fase.semPareamento;
    });
  }

  void _abrirAjustes() {
    final vencedor = _vencedor;
    mostrarAjustes(
      context,
      modo: _modo,
      enderecoAtual: vencedor == null ? null : '${vencedor.host}:${vencedor.porta}',
      versaoDoHub: _versaoDoHub,
      aoTrocarModo: _trocarModo,
      aoProcurarDeNovo: _procurar,
      aoParearOutro: _parearOutro,
      avisosLigados: _avisosLigados,
      topicoNtfy: _topicoNtfy,
      aoTrocarAvisos: _trocarAvisos,
    );
  }

  Future<void> _trocarAvisos(bool ligar) async {
    final topico = _topicoNtfy;
    if (ligar && topico != null) {
      await _avisos.ligar(topico);
    } else {
      await _avisos.desligar();
    }
    final ligado = await _avisos.ligado();
    if (!mounted) return;
    setState(() => _avisosLigados = ligado);
  }

  @override
  Widget build(BuildContext context) {
    return switch (_fase) {
      _Fase.carregando => const _Aviso(texto: 'Abrindo…'),
      _Fase.semPareamento => TelaPareamento(aoParear: _parear),
      _Fase.procurando => const _Aviso(texto: 'Procurando o hub…', comProgresso: true),
      _Fase.semHub => _SemHub(modo: _modo, aoTentar: _procurar, aoAbrirAjustes: _abrirAjustes),
      _Fase.conectado => TelaSessao(
        url: _urlDaSessao()!,
        host: _vencedor!.host,
        aoAbrirAjustes: _abrirAjustes,
        aoPerderOHub: _procurar,
        ponte: _ponte,
        aoCarregarPagina: () => unawaited(_fila.entregar()),
      ),
    };
  }

  String? _urlDaSessao() {
    final pareamento = _pareamento;
    final vencedor = _vencedor;
    if (pareamento == null || vencedor == null) return null;
    return '${vencedor.baseUrl(pareamento.esquema)}/?t=${pareamento.token}';
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.texto, this.comProgresso = false});

  final String texto;
  final bool comProgresso;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (comProgresso) ...[
              const CircularProgressIndicator(),
              const SizedBox(height: 20),
            ],
            Text(texto),
          ],
        ),
      ),
    );
  }
}

class _SemHub extends StatelessWidget {
  const _SemHub({required this.modo, required this.aoTentar, required this.aoAbrirAjustes});

  final ModoRede modo;
  final VoidCallback aoTentar;
  final VoidCallback aoAbrirAjustes;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.wifi_find_outlined, size: 48),
              const SizedBox(height: 20),
              Text(
                'Não encontrei o hub',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              // O hub responde 404 a quem não tem o token certo, então "fora do ar"
              // e "token vencido" chegam aqui como a mesma coisa: o app diz os dois.
              const Text(
                'Ou a máquina está fora do ar, ou este aparelho não está na mesma '
                'rede, ou o token mudou — nesse caso, escaneie o QR de novo.',
                textAlign: TextAlign.center,
                style: TextStyle(height: 1.4),
              ),
              if (modo != ModoRede.automatico) ...[
                const SizedBox(height: 12),
                Text(
                  'A busca está limitada a "${modo == ModoRede.apenasLan ? 'só rede local' : 'só VPN'}".',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12),
                ),
              ],
              const SizedBox(height: 28),
              FilledButton(onPressed: aoTentar, child: const Text('Procurar de novo')),
              const SizedBox(height: 8),
              TextButton(onPressed: aoAbrirAjustes, child: const Text('Ajustes')),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:local_session/descoberta/candidatos.dart';

const _nomeDoModo = {
  ModoRede.automatico: 'Automático',
  ModoRede.apenasLan: 'Só rede local',
  ModoRede.apenasVpn: 'Só VPN',
};

const _explicacaoDoModo = {
  ModoRede.automatico: 'Tenta todos os endereços ao mesmo tempo e fica com o primeiro.',
  ModoRede.apenasLan: 'Ignora a tailnet — útil quando a VPN está lenta.',
  ModoRede.apenasVpn: 'Ignora a rede local — útil em Wi-Fi que isola os aparelhos.',
};

Future<void> mostrarAjustes(
  BuildContext context, {
  required ModoRede modo,
  required String? enderecoAtual,
  required String? versaoDoHub,
  required void Function(ModoRede) aoTrocarModo,
  required VoidCallback aoProcurarDeNovo,
  required VoidCallback aoParearOutro,
  required bool avisosLigados,
  required String? topicoNtfy,
  required Future<void> Function(bool) aoTrocarAvisos,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (contexto) => _Ajustes(
      modo: modo,
      enderecoAtual: enderecoAtual,
      versaoDoHub: versaoDoHub,
      aoTrocarModo: aoTrocarModo,
      aoProcurarDeNovo: aoProcurarDeNovo,
      aoParearOutro: aoParearOutro,
      avisosLigados: avisosLigados,
      topicoNtfy: topicoNtfy,
      aoTrocarAvisos: aoTrocarAvisos,
    ),
  );
}

class _Ajustes extends StatefulWidget {
  const _Ajustes({
    required this.modo,
    required this.enderecoAtual,
    required this.versaoDoHub,
    required this.aoTrocarModo,
    required this.aoProcurarDeNovo,
    required this.aoParearOutro,
    required this.avisosLigados,
    required this.topicoNtfy,
    required this.aoTrocarAvisos,
  });

  final ModoRede modo;
  final String? enderecoAtual;
  final String? versaoDoHub;
  final void Function(ModoRede) aoTrocarModo;
  final VoidCallback aoProcurarDeNovo;
  final VoidCallback aoParearOutro;
  final bool avisosLigados;
  final String? topicoNtfy;
  final Future<void> Function(bool) aoTrocarAvisos;

  @override
  State<_Ajustes> createState() => _AjustesState();
}

class _AjustesState extends State<_Ajustes> {
  late ModoRede _modo = widget.modo;
  late bool _avisos = widget.avisosLigados;

  @override
  Widget build(BuildContext context) {
    final endereco = widget.enderecoAtual;
    final versao = widget.versaoDoHub;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Por onde procurar', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            RadioGroup<ModoRede>(
              groupValue: _modo,
              onChanged: (escolhido) {
                if (escolhido == null) return;
                setState(() => _modo = escolhido);
                widget.aoTrocarModo(escolhido);
              },
              child: Column(
                children: [
                  for (final opcao in ModoRede.values)
                    RadioListTile<ModoRede>(
                      value: opcao,
                      contentPadding: EdgeInsets.zero,
                      title: Text(_nomeDoModo[opcao]!),
                      subtitle: Text(
                        _explicacaoDoModo[opcao]!,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 28),
            Text('Avisar com o app fechado', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            if (widget.topicoNtfy == null)
              const Text(
                'Só funciona com um tópico ntfy no hub: ponha "notifyUrl" no '
                '~/.claude/local-session/config.json e reinicie o hub.',
                style: TextStyle(fontSize: 12, height: 1.4),
              )
            else
              SwitchListTile(
                value: _avisos,
                contentPadding: EdgeInsets.zero,
                title: const Text('Escutar os avisos da sessão'),
                // Sem FCM, manter conexão com o app fechado exige serviço em
                // primeiro plano — e o Android cobra por isso um ícone fixo.
                subtitle: const Text(
                  'Deixa uma notificação permanente na barra, como o app do ntfy.',
                  style: TextStyle(fontSize: 12),
                ),
                onChanged: (ligar) async {
                  setState(() => _avisos = ligar);
                  await widget.aoTrocarAvisos(ligar);
                },
              ),
            const Divider(height: 28),
            if (endereco != null)
              Text('Conectado em $endereco', style: const TextStyle(fontSize: 12)),
            if (versao != null)
              Text('Hub versão $versao', style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () {
                Navigator.of(context).pop();
                widget.aoProcurarDeNovo();
              },
              child: const Text('Procurar o hub de novo'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                widget.aoParearOutro();
              },
              child: const Text('Escanear outro QR'),
            ),
          ],
        ),
      ),
    );
  }
}

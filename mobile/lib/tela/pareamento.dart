import 'package:flutter/material.dart';
import 'package:local_session/pareamento/link.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class TelaPareamento extends StatefulWidget {
  const TelaPareamento({super.key, required this.aoParear});

  final void Function(Pareamento) aoParear;

  @override
  State<TelaPareamento> createState() => _TelaPareamentoState();
}

class _TelaPareamentoState extends State<TelaPareamento> {
  final _controle = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _jaPareou = false;
  String? _recusado;

  @override
  void dispose() {
    _controle.dispose();
    super.dispose();
  }

  void _aoDetectar(BarcodeCapture captura) {
    if (_jaPareou) return;
    for (final codigo in captura.barcodes) {
      final pareamento = lerLink(codigo.rawValue ?? '');
      if (pareamento != null) {
        _jaPareou = true;
        widget.aoParear(pareamento);
        return;
      }
    }
    setState(() => _recusado = 'esse QR não é o do hub');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Parear com o hub')),
      body: Column(
        children: [
          Expanded(child: MobileScanner(controller: _controle, onDetect: _aoDetectar)),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Text(
                  _recusado ??
                      'Aponte para o QR code da janela do Local Session, na sua máquina.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _recusado == null ? null : Theme.of(context).colorScheme.error,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'O endereço muda de rede para rede; o token, não. Por isso ele é lido uma vez só.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

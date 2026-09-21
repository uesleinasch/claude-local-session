import 'dart:async';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:local_session/notificacao/escuta.dart';
import 'package:local_session/notificacao/ntfy.dart';

const _chaveTopico = 'ntfy_url';
const _canal = 'avisos-sessao';

/// O Android exige notificação persistente para manter conexão com o app fechado
/// — é o preço de não usar FCM. Por isso o serviço é opt-in nos ajustes.
class ServicoDeAvisos {
  const ServicoDeAvisos();

  Future<void> preparar() async {
    FlutterForegroundTask.initCommunicationPort();
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'local-session-servico',
        channelName: 'Conexão com o hub',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.nothing(),
        autoRunOnBoot: true,
        allowWakeLock: true,
      ),
    );
  }

  Future<bool> ligado() => FlutterForegroundTask.isRunningService;

  Future<void> ligar(String topico) async {
    await FlutterForegroundTask.saveData(key: _chaveTopico, value: topico);
    await _permissoes();
    await FlutterForegroundTask.startService(
      notificationTitle: 'Local Session',
      notificationText: 'Escutando os avisos da sessão',
      callback: iniciarEscuta,
    );
  }

  Future<void> desligar() => FlutterForegroundTask.stopService();

  Future<void> _permissoes() async {
    if (await FlutterForegroundTask.checkNotificationPermission() !=
        NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
    if (!await FlutterForegroundTask.isIgnoringBatteryOptimizations) {
      await FlutterForegroundTask.requestIgnoreBatteryOptimization();
    }
  }
}

@pragma('vm:entry-point')
void iniciarEscuta() => FlutterForegroundTask.setTaskHandler(_TarefaNtfy());

class _TarefaNtfy extends TaskHandler {
  final _notificacoes = FlutterLocalNotificationsPlugin();
  StreamSubscription<Aviso>? _inscricao;
  Timer? _religar;
  var _tentativa = 0;

  @override
  Future<void> onStart(DateTime hora, TaskStarter iniciador) async {
    await _notificacoes.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      ),
    );
    await _conectar();
  }

  Future<void> _conectar() async {
    final topico = await FlutterForegroundTask.getData<String>(key: _chaveTopico);
    final stream = topico == null ? null : urlDoStream(topico);
    if (stream == null) return;

    await _inscricao?.cancel();
    _inscricao = escutarNtfy(stream).listen(
      (aviso) {
        _tentativa = 0;
        unawaited(_mostrar(aviso));
      },
      onError: (_) => _agendarReconexao(),
      onDone: _agendarReconexao,
      cancelOnError: true,
    );
  }

  /// Rede de celular derruba conexão longa o tempo todo; sem religar, o serviço
  /// ficaria de pé sem escutar nada — pior que não existir.
  void _agendarReconexao() {
    _religar?.cancel();
    final segundos = [2, 5, 15, 30, 60][_tentativa.clamp(0, 4)];
    _tentativa++;
    _religar = Timer(Duration(seconds: segundos), _conectar);
  }

  Future<void> _mostrar(Aviso aviso) async {
    await _notificacoes.show(
      id: aviso.id.hashCode,
      title: aviso.titulo,
      body: aviso.corpo,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _canal,
          'Avisos da sessão',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }

  @override
  void onRepeatEvent(DateTime hora) {}

  @override
  Future<void> onDestroy(DateTime hora, bool porTimeout) async {
    _religar?.cancel();
    await _inscricao?.cancel();
  }
}

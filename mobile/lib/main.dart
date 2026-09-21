import 'package:flutter/material.dart';
import 'package:local_session/tela/raiz.dart';

void main() => runApp(const AppLocalSession());

class AppLocalSession extends StatelessWidget {
  const AppLocalSession({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Local Session',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF7C5CFF),
      ),
      home: const TelaRaiz(),
    );
  }
}

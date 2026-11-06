import 'package:flutter/material.dart';
import 'package:local_session/tela/raiz.dart';
import 'package:local_session/tema.dart';

void main() => runApp(const AppLocalSession());

class AppLocalSession extends StatelessWidget {
  const AppLocalSession({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Local Session',
      debugShowCheckedModeBanner: false,
      theme: temaDoApp(),
      home: const TelaRaiz(),
    );
  }
}

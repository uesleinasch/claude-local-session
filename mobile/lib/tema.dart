import 'package:flutter/material.dart';

// Os mesmos valores de web/tokens.css: a página na WebView e as telas nativas
// precisam ser o mesmo app. Mudar um lado sem o outro divide a identidade.
const esquemaDoApp = ColorScheme(
  brightness: Brightness.dark,
  primary: Color(0xFFFFC77F),
  onPrimary: Color(0xFF462B00),
  primaryContainer: Color(0xFFF5A524),
  onPrimaryContainer: Color(0xFF462B00),
  secondary: Color(0xFFECBF86),
  onSecondary: Color(0xFF462B00),
  secondaryContainer: Color(0xFF624315),
  onSecondaryContainer: Color(0xFFFFDDB4),
  tertiary: Color(0xFF9AD9FF),
  onTertiary: Color(0xFF003549),
  tertiaryContainer: Color(0xFF36C2FF),
  onTertiaryContainer: Color(0xFF004D69),
  error: Color(0xFFFFB4AB),
  onError: Color(0xFF690005),
  errorContainer: Color(0xFF93000A),
  onErrorContainer: Color(0xFFFFDAD6),
  surface: Color(0xFF151311),
  onSurface: Color(0xFFE8E1DD),
  onSurfaceVariant: Color(0xFFCEC5BD),
  surfaceDim: Color(0xFF151311),
  surfaceBright: Color(0xFF3C3936),
  surfaceContainerLowest: Color(0xFF100E0C),
  surfaceContainerLow: Color(0xFF1E1B19),
  surfaceContainer: Color(0xFF221F1D),
  surfaceContainerHigh: Color(0xFF2C2927),
  surfaceContainerHighest: Color(0xFF373432),
  outline: Color(0xFF978F88),
  outlineVariant: Color(0xFF4B4640),
  inverseSurface: Color(0xFFE8E1DD),
  onInverseSurface: Color(0xFF33302D),
  inversePrimary: Color(0xFF835400),
  scrim: Color(0xFF000000),
  shadow: Color(0xFF000000),
);

ThemeData temaDoApp() => ThemeData(
      useMaterial3: true,
      colorScheme: esquemaDoApp,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: esquemaDoApp.surface,
    );

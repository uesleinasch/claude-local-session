import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_session/tema.dart';

void main() {
  group('temaDoApp', () {
    test('usa o esquema âmbar do design system', () {
      final esquema = temaDoApp().colorScheme;
      expect(esquema.primary, const Color(0xFFFFC77F));
      expect(esquema.surface, const Color(0xFF151311));
      expect(esquema.tertiary, const Color(0xFF9AD9FF));
      expect(esquema.brightness, Brightness.dark);
    });

    test('texto em Inter', () {
      expect(temaDoApp().textTheme.bodyLarge?.fontFamily, 'Inter');
    });
  });
}

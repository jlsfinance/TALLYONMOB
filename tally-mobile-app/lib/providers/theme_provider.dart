import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../config/theme.dart';

/// Theme mode provider — persists user preference
class ThemeProvider extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.dark;

  ThemeMode get themeMode => _themeMode;
  bool get isDark => _themeMode == ThemeMode.dark;

  ThemeProvider() {
    _load();
  }

  void _load() {
    final box = Hive.box('settings');
    final stored = box.get('themeMode', defaultValue: 'dark');
    _themeMode = stored == 'light' ? ThemeMode.light : ThemeMode.dark;
  }

  void toggle() {
    _themeMode = isDark ? ThemeMode.light : ThemeMode.dark;
    final box = Hive.box('settings');
    box.put('themeMode', isDark ? 'dark' : 'light');
    notifyListeners();
  }

  ThemeData get theme => isDark ? AppTheme.darkTheme : AppTheme.lightTheme;
}

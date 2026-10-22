import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Singleton storage service wrapping SharedPreferences + FlutterSecureStorage.
class StorageService {
  static final StorageService _instance = StorageService._();
  factory StorageService() => _instance;
  StorageService._();

  final FlutterSecureStorage _secure = const FlutterSecureStorage();
  SharedPreferences? _prefs;

  /// Must be called once before any other method (e.g. in main()).
  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // ── Secure storage (auth tokens, secrets) ──

  Future<void> saveToken(String token) =>
      _secure.write(key: 'auth_token', value: token);

  Future<String?> getToken() => _secure.read(key: 'auth_token');

  Future<void> removeToken() => _secure.delete(key: 'auth_token');

  // ── Shared preferences (user-facing settings) ──

  String? getString(String key) => _prefs?.getString(key);

  Future<bool> setString(String key, String value) =>
      _prefs?.setString(key, value) ?? Future.value(false);

  bool? getBool(String key) => _prefs?.getBool(key);

  Future<bool> setBool(String key, bool value) =>
      _prefs?.setBool(key, value) ?? Future.value(false);

  String? get selectedCompanyId => getString('selected_company_id');

  Future<bool> setSelectedCompanyId(String id) =>
      setString('selected_company_id', id);

  Future<void> clear() async {
    await _secure.deleteAll();
    await _prefs?.clear();
  }
}

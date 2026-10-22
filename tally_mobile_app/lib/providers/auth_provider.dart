import 'package:flutter/foundation.dart';
import '../services/storage_service.dart';

/// Authentication state and methods for the TallyOnMobile app.
class AuthProvider extends ChangeNotifier {
  final StorageService _storage;

  bool _loading = true;
  bool _authenticated = false;
  String? _token;
  String? _userId;
  String? _email;
  String? _error;

  AuthProvider(this._storage);

  bool get loading => _loading;
  bool get authenticated => _authenticated;
  String? get token => _token;
  String? get userId => _userId;
  String? get email => _email;
  String? get error => _error;

  /// Restore session from stored token on app start.
  Future<void> restoreSession() async {
    _loading = true;
    notifyListeners();

    try {
      _token = await _storage.getToken();
      _userId = _storage.getString('user_id');
      _email = _storage.getString('user_email');
      _authenticated = _token != null && _token!.isNotEmpty;
    } catch (_) {
      _authenticated = false;
    }

    _loading = false;
    notifyListeners();
  }

  /// Authenticate with a token (from login or magic link).
  Future<void> authenticate({
    required String token,
    String? userId,
    String? email,
  }) async {
    await _storage.saveToken(token);
    if (userId != null) await _storage.setString('user_id', userId);
    if (email != null) await _storage.setString('user_email', email);

    _token = token;
    _userId = userId;
    _email = email;
    _authenticated = true;
    _error = null;
    notifyListeners();
  }

  /// Clear session and log out.
  Future<void> logout() async {
    await _storage.clear();
    _token = null;
    _userId = null;
    _email = null;
    _authenticated = false;
    _error = null;
    notifyListeners();
  }
}

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../services/biometric_service.dart';

/// Authentication provider using Supabase Auth
class AuthProvider extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;
  final Box _settingsBox = Hive.box('settings');

  bool _isLoading = true;
  bool _isAuthenticated = false;
  bool _isLocalLocked = false;
  User? _user;
  String? _selectedCompanyId;
  String? _selectedCompanyName;
  String? _error;

  bool get isLoading => _isLoading;
  bool get isAuthenticated => _isAuthenticated;
  bool get isLocalLocked => _isLocalLocked;
  User? get user => _user;
  String? get selectedCompanyId => _selectedCompanyId;
  String? get selectedCompanyName => _selectedCompanyName;
  String? get error => _error;

  AuthProvider() {
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      // Check current session
      final session = _supabase.auth.currentSession;
      if (session != null) {
        _user = session.user;
        _isAuthenticated = true;

        // Restore selected company
        _selectedCompanyId = _settingsBox.get('selectedCompanyId');
        _selectedCompanyName = _settingsBox.get('selectedCompanyName');

        // Check if biometric lock is enabled
        if (_settingsBox.get('biometricLockEnabled') == true) {
          _isLocalLocked = true;
        }
      }

      // Listen to auth changes
      _supabase.auth.onAuthStateChange.listen((data) {
        final AuthChangeEvent event = data.event;
        final Session? session = data.session;

        if (event == AuthChangeEvent.signedIn && session != null) {
          _user = session.user;
          _isAuthenticated = true;
        } else if (event == AuthChangeEvent.signedOut) {
          _user = null;
          _isAuthenticated = false;
          _selectedCompanyId = null;
          _selectedCompanyName = null;
          _settingsBox.delete('selectedCompanyId');
          _settingsBox.delete('selectedCompanyName');
        }
        notifyListeners();
      });
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Sign in with email and password
  Future<bool> signIn(String email, String password) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      if (response.session != null) {
        _user = response.user;
        _isAuthenticated = true;
        return true;
      }
      return false;
    } on AuthException catch (e) {
      _error = e.message;
      return false;
    } catch (e) {
      _error = 'Login failed: ${e.toString()}';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Sign up with email and password
  Future<bool> signUp(String email, String password, String? name) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase.auth.signUp(
        email: email,
        password: password,
        data: name != null ? {'display_name': name} : null,
      );

      if (response.user != null) {
        _user = response.user;
        _isAuthenticated = response.session != null;
        return true;
      }
      return false;
    } on AuthException catch (e) {
      _error = e.message;
      return false;
    } catch (e) {
      _error = 'Signup failed: ${e.toString()}';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Sign out
  Future<void> signOut() async {
    try {
      await _supabase.auth.signOut();
      _user = null;
      _isAuthenticated = false;
      _selectedCompanyId = null;
      _selectedCompanyName = null;

      await _settingsBox.delete('selectedCompanyId');
      await _settingsBox.delete('selectedCompanyName');
    } catch (e) {
      _error = e.toString();
    } finally {
      notifyListeners();
    }
  }

  /// Select a company
  Future<void> selectCompany(String companyId, String companyName) async {
    _selectedCompanyId = companyId;
    _selectedCompanyName = companyName;

    await _settingsBox.put('selectedCompanyId', companyId);
    await _settingsBox.put('selectedCompanyName', companyName);

    notifyListeners();
  }

  /// Clear selected company
  Future<void> clearSelectedCompany() async {
    _selectedCompanyId = null;
    _selectedCompanyName = null;

    await _settingsBox.delete('selectedCompanyId');
    await _settingsBox.delete('selectedCompanyName');

    notifyListeners();
  }

  /// Toggle biometric lock setting
  Future<void> setBiometricLock(bool enabled) async {
    await _settingsBox.put('biometricLockEnabled', enabled);
    notifyListeners();
  }

  /// Check if biometric lock is enabled in settings
  bool get isBiometricLockEnabled => _settingsBox.get('biometricLockEnabled') == true;

  /// Attempt to unlock using biometrics
  Future<bool> unlockWithBiometrics() async {
    try {
      final success = await BiometricService.authenticate();
      if (success) {
        _isLocalLocked = false;
        notifyListeners();
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }
}

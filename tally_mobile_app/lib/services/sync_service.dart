import 'dart:async';
import 'package:flutter/foundation.dart';
import 'api_service.dart';
import 'storage_service.dart';

/// Tracks sync state and provides sync triggers for Tally data.
class SyncService extends ChangeNotifier {
  final ApiService _api;
  final StorageService _storage;

  bool _isSyncing = false;
  DateTime? _lastSyncAt;
  String? _lastError;

  SyncService(this._api, this._storage);

  bool get isSyncing => _isSyncing;
  DateTime? get lastSyncAt => _lastSyncAt;
  String? get lastError => _lastError;

  /// Returns a human-readable sync status string.
  String get statusText {
    if (_isSyncing) return 'Syncing…';
    if (_lastError != null) return 'Sync failed: $_lastError';
    if (_lastSyncAt != null) {
      final ago = DateTime.now().difference(_lastSyncAt!);
      if (ago.inMinutes < 1) return 'Synced just now';
      if (ago.inMinutes < 60) return 'Synced ${ago.inMinutes}m ago';
      return 'Synced ${ago.inHours}h ago';
    }
    return 'Never synced';
  }

  /// Trigger a full sync for the given company.
  Future<bool> syncCompany(String companyId) async {
    if (_isSyncing) return false;
    _isSyncing = true;
    _lastError = null;
    notifyListeners();

    try {
      // Sync companies list
      await _api.getCompanies();

      // Sync dashboard data
      await _api.getDashboard(companyId);

      // Sync ledgers
      await _api.getLedgers(companyId);

      _lastSyncAt = DateTime.now();
      await _storage.setString(
        'last_sync_at_$companyId',
        _lastSyncAt!.toIso8601String(),
      );
      _isSyncing = false;
      notifyListeners();
      return true;
    } catch (e) {
      _lastError = e.toString();
      _isSyncing = false;
      notifyListeners();
      return false;
    }
  }

  /// Restore last sync timestamp from storage.
  Future<void> restoreLastSync(String companyId) async {
    final stored = await _storage.getString('last_sync_at_$companyId');
    if (stored != null) {
      _lastSyncAt = DateTime.tryParse(stored);
    }
  }
}

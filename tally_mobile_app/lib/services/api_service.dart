import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../models/app_models.dart';

class ApiService {
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static const String _configuredBaseUrl =
      String.fromEnvironment('API_BASE_URL', defaultValue: '');
  static const String _debugFallbackBaseUrl =
      'http://10.0.2.2:5000/api/v1/data';

  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) {
      return _configuredBaseUrl;
    }

    if (kDebugMode) {
      return _debugFallbackBaseUrl;
    }

    throw StateError('API_BASE_URL is not configured');
  }

  static Future<String?> _getToken() async {
    return _secureStorage.read(key: 'auth_token');
  }

  static Future<void> saveToken(String token) async {
    final normalized = token.trim();
    if (normalized.isEmpty) {
      await clearToken();
      return;
    }

    await _secureStorage.write(key: 'auth_token', value: normalized);
  }

  static Future<void> clearToken() async {
    await _secureStorage.delete(key: 'auth_token');
  }

  static Future<Map<String, String>> _getHeaders({bool requireAuth = true}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final token = await _getToken();

    if ((token == null || token.trim().isEmpty) && requireAuth) {
      throw StateError('auth_token is missing');
    }

    if (token != null && token.trim().isNotEmpty) {
      headers['Authorization'] = 'Bearer ${token.trim()}';
    }

    return headers;
  }

  static Future<List<Company>> getCompanies() async {
    final headers = await _getHeaders();
    final response =
        await http.get(Uri.parse('$baseUrl/companies'), headers: headers);

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => Company.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load companies');
    }
  }

  static Future<DashboardSummary> getDashboard(String companyId) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/dashboard'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data']['summary'];
      return DashboardSummary.fromJson(data);
    } else {
      throw Exception('Failed to load dashboard');
    }
  }

  static Future<List<Ledger>> getLedgers(String companyId,
      {String search = ''}) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/ledgers?search=$search&limit=50'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => Ledger.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load ledgers');
    }
  }
}

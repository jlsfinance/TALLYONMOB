import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/app_models.dart';

/// HTTP API client for the Tally sync backend.
///
/// The [_token] is injected by [setToken] (typically from AuthProvider).
class ApiService {
  static const String baseUrl = 'http://10.0.2.2:5000/api/v1/data';

  String? _token;

  /// Set the auth token (called by AuthProvider after login/restore).
  void setToken(String? token) {
    _token = token;
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  // ── Auth ──

  /// Verify the current token is still valid.
  Future<bool> verifyToken() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/me'),
        headers: _headers(),
      );
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ── Companies ──

  Future<List<Company>> getCompanies() async {
    final response =
        await http.get(Uri.parse('$baseUrl/companies'), headers: _headers());

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => Company.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load companies (${response.statusCode})');
    }
  }

  // ── Dashboard ──

  Future<DashboardSummary> getDashboard(String companyId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/dashboard'),
      headers: _headers(),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data']['summary'];
      return DashboardSummary.fromJson(data);
    } else {
      throw Exception('Failed to load dashboard (${response.statusCode})');
    }
  }

  // ── Ledgers ──

  Future<List<Ledger>> getLedgers(String companyId,
      {String search = ''}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/ledgers?search=$search&limit=50'),
      headers: _headers(),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => Ledger.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load ledgers (${response.statusCode})');
    }
  }

  // ── Stock Items ──

  Future<List<StockItem>> getStockItems(String companyId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/stock-items'),
      headers: _headers(),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => StockItem.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load stock items (${response.statusCode})');
    }
  }

  // ── Vouchers ──

  Future<List<Voucher>> getVouchers(String companyId,
      {String search = ''}) async {
    final response = await http.get(
      Uri.parse('$baseUrl/$companyId/vouchers?search=$search&limit=100'),
      headers: _headers(),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body)['data'] as List;
      return data.map((e) => Voucher.fromJson(e)).toList();
    } else {
      throw Exception('Failed to load vouchers (${response.statusCode})');
    }
  }
}

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/app_models.dart';

class ApiService {
  // Replace with your actual backend URL (use 10.0.2.2 for Android Emulator)
  static const String baseUrl = 'http://10.0.2.2:5000/api/v1/data';

  static Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  static Future<Map<String, String>> _getHeaders() async {
    final token = await _getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
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

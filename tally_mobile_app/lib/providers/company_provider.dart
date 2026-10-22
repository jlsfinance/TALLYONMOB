import 'package:flutter/foundation.dart';
import '../models/app_models.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

/// Manages company selection and company list state.
class CompanyProvider extends ChangeNotifier {
  final ApiService _api;
  final StorageService _storage;

  bool _loading = false;
  List<Company> _companies = [];
  Company? _selectedCompany;
  String? _error;

  CompanyProvider(this._api, this._storage);

  bool get loading => _loading;
  List<Company> get companies => _companies;
  Company? get selectedCompany => _selectedCompany;
  String? get error => _error;
  String? get selectedCompanyId => _selectedCompany?.id ?? _storage.selectedCompanyId;

  /// Fetch the company list from the API.
  Future<void> fetchCompanies() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _companies = await _api.getCompanies();
      // Try to restore the previously selected company
      final savedId = _storage.selectedCompanyId;
      if (savedId != null) {
        _selectedCompany = _companies.where((c) => c.id == savedId).firstOrNull;
      }
    } catch (e) {
      _error = e.toString();
    }

    _loading = false;
    notifyListeners();
  }

  /// Select a company and persist the choice.
  Future<void> selectCompany(Company company) async {
    _selectedCompany = company;
    await _storage.setSelectedCompanyId(company.id);
    notifyListeners();
  }
}

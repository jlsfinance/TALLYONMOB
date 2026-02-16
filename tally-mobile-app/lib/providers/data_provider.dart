import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/company.dart';
import '../models/ledger.dart';
import '../models/voucher.dart';
import '../models/sale.dart';

/// Data provider for fetching accounting data from Supabase
class DataProvider extends ChangeNotifier {
  final SupabaseClient _supabase = Supabase.instance.client;
  final Box _cacheBox = Hive.box('cache');

  bool _isLoading = false;
  String? _error;

  // Data
  List<Company> _companies = [];
  List<Ledger> _ledgers = [];
  List<Voucher> _vouchers = [];
  List<Sale> _sales = [];
  List<Purchase> _purchases = [];
  List<Stock> _stockItems = [];
  DashboardSummary? _dashboardSummary;

  // Getters
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<Company> get companies => _companies;
  List<Ledger> get ledgers => _ledgers;
  List<Voucher> get vouchers => _vouchers;
  List<Sale> get sales => _sales;
  List<Purchase> get purchases => _purchases;
  List<Stock> get stockItems => _stockItems;
  DashboardSummary? get dashboardSummary => _dashboardSummary;

  /// Fetch all companies
  Future<void> fetchCompanies() async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase
          .from('companies')
          .select()
          .order('created_at', ascending: false);

      _companies =
          (response as List).map((json) => Company.fromJson(json)).toList();
    } catch (e) {
      _error = 'Failed to load companies: $e';
      // Try loading from cache
      _loadFromCache('companies');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch dashboard summary for a company
  Future<void> fetchDashboard(String companyId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      // Fetch counts and totals in parallel
      final responses = await Future.wait([
        _supabase.from('ledgers').select('id').eq('company_id', companyId),
        _supabase.from('vouchers').select('id').eq('company_id', companyId),
        _supabase
            .from('sales')
            .select('net_amount')
            .eq('company_id', companyId),
        _supabase
            .from('purchases')
            .select('net_amount')
            .eq('company_id', companyId),
        _supabase
            .from('stock_items')
            .select('closing_value')
            .eq('company_id', companyId),
      ]);

      final ledgerCount = (responses[0] as List).length;
      final voucherCount = (responses[1] as List).length;

      final totalSales = (responses[2] as List).fold<double>(0,
          (sum, item) => sum + ((item['net_amount'] as num?)?.toDouble() ?? 0));

      final totalPurchases = (responses[3] as List).fold<double>(0,
          (sum, item) => sum + ((item['net_amount'] as num?)?.toDouble() ?? 0));

      final totalStock = (responses[4] as List).fold<double>(
          0,
          (sum, item) =>
              sum + ((item['closing_value'] as num?)?.toDouble() ?? 0));

      _dashboardSummary = DashboardSummary(
        totalLedgers: ledgerCount,
        totalVouchers: voucherCount,
        totalSalesAmount: totalSales,
        totalPurchasesAmount: totalPurchases,
        totalStockValue: totalStock,
        netSalesPurchase: totalSales - totalPurchases,
        syncStatus: 'healthy',
      );

      // Cache the data
      await _cacheBox.put('dashboard_$companyId', {
        'totalLedgers': ledgerCount,
        'totalVouchers': voucherCount,
        'totalSalesAmount': totalSales,
        'totalPurchasesAmount': totalPurchases,
        'totalStockValue': totalStock,
      });
    } catch (e) {
      _error = 'Failed to load dashboard: $e';
      _loadDashboardFromCache(companyId);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch ledgers for a company
  Future<void> fetchLedgers(String companyId,
      {String? group, String? search}) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      var query =
          _supabase.from('ledgers').select().eq('company_id', companyId);

      if (group != null && group.isNotEmpty) {
        query = query.eq('parent', group);
      }

      if (search != null && search.isNotEmpty) {
        query = query.ilike('name', '%$search%');
      }

      final response = await query.order('name');

      _ledgers =
          (response as List).map((json) => Ledger.fromJson(json)).toList();

      // Cache
      await _cacheBox.put('ledgers_$companyId', response);
    } catch (e) {
      _error = 'Failed to load ledgers: $e';
      _loadLedgersFromCache(companyId);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch vouchers for a company
  Future<void> fetchVouchers(String companyId,
      {String? type, DateTime? dateFrom, DateTime? dateTo}) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      var query =
          _supabase.from('vouchers').select().eq('company_id', companyId);

      if (type != null && type.isNotEmpty) {
        query = query.eq('voucher_type', type);
      }

      if (dateFrom != null) {
        query = query.gte('voucher_date', dateFrom.toIso8601String());
      }

      if (dateTo != null) {
        query = query.lte('voucher_date', dateTo.toIso8601String());
      }

      final response =
          await query.order('voucher_date', ascending: false).limit(100);

      _vouchers =
          (response as List).map((json) => Voucher.fromJson(json)).toList();

      // Cache
      await _cacheBox.put('vouchers_$companyId', response);
    } catch (e) {
      _error = 'Failed to load vouchers: $e';
      _loadVouchersFromCache(companyId);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch sales for a company
  Future<void> fetchSales(String companyId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase
          .from('sales')
          .select()
          .eq('company_id', companyId)
          .order('created_at', ascending: false)
          .limit(100);

      _sales = (response as List).map((json) => Sale.fromJson(json)).toList();
    } catch (e) {
      _error = 'Failed to load sales: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch purchases for a company
  Future<void> fetchPurchases(String companyId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase
          .from('purchases')
          .select()
          .eq('company_id', companyId)
          .order('created_at', ascending: false)
          .limit(100);

      _purchases =
          (response as List).map((json) => Purchase.fromJson(json)).toList();
    } catch (e) {
      _error = 'Failed to load purchases: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch stock items for a company
  Future<void> fetchStock(String companyId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final response = await _supabase
          .from('stock_items')
          .select()
          .eq('company_id', companyId)
          .order('name');

      _stockItems =
          (response as List).map((json) => Stock.fromJson(json)).toList();
    } catch (e) {
      _error = 'Failed to load stock: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Get unique ledger groups
  List<String> getLedgerGroups() {
    return _ledgers
        .map((l) => l.ledgerGroup ?? 'Uncategorized')
        .toSet()
        .toList()
      ..sort();
  }

  /// Get unique voucher types
  List<String> getVoucherTypes() {
    return _vouchers.map((v) => v.voucherType ?? 'Unknown').toSet().toList()
      ..sort();
  }

  // Cache helper methods
  void _loadFromCache(String key) {
    final cached = _cacheBox.get(key);
    if (cached != null && cached is List) {
      _companies = cached.map((json) => Company.fromJson(json)).toList();
    }
  }

  void _loadDashboardFromCache(String companyId) {
    final cached = _cacheBox.get('dashboard_$companyId');
    if (cached != null && cached is Map) {
      _dashboardSummary = DashboardSummary(
        totalLedgers: cached['totalLedgers'] ?? 0,
        totalVouchers: cached['totalVouchers'] ?? 0,
        totalSalesAmount: cached['totalSalesAmount'] ?? 0,
        totalPurchasesAmount: cached['totalPurchasesAmount'] ?? 0,
        totalStockValue: cached['totalStockValue'] ?? 0,
      );
    }
  }

  void _loadLedgersFromCache(String companyId) {
    final cached = _cacheBox.get('ledgers_$companyId');
    if (cached != null && cached is List) {
      _ledgers = cached.map((json) => Ledger.fromJson(json)).toList();
    }
  }

  void _loadVouchersFromCache(String companyId) {
    final cached = _cacheBox.get('vouchers_$companyId');
    if (cached != null && cached is List) {
      _vouchers = cached.map((json) => Voucher.fromJson(json)).toList();
    }
  }

  /// Clear all data
  void clear() {
    _companies = [];
    _ledgers = [];
    _vouchers = [];
    _sales = [];
    _purchases = [];
    _stockItems = [];
    _dashboardSummary = null;
    _error = null;
    notifyListeners();
  }

  /// Clear error
  void clearError() {
    _error = null;
    notifyListeners();
  }
}

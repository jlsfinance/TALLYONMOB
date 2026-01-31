class Company {
  final String id;
  final String name;
  final String? formalName;
  final String? currencySymbol;
  final DateTime? lastSyncAt;

  Company({
    required this.id,
    required this.name,
    this.formalName,
    this.currencySymbol,
    this.lastSyncAt,
  });

  factory Company.fromJson(Map<String, dynamic> json) {
    return Company(
      id: json['id'],
      name: json['name'],
      formalName: json['formal_name'],
      currencySymbol: json['currency_symbol'],
      lastSyncAt: json['last_sync_at'] != null
          ? DateTime.parse(json['last_sync_at'])
          : null,
    );
  }
}

class Ledger {
  final String id;
  final String name;
  final String? parentGroup;
  final double closingBalance;
  final String? phone;
  final String? email;

  Ledger({
    required this.id,
    required this.name,
    this.parentGroup,
    required this.closingBalance,
    this.phone,
    this.email,
  });

  factory Ledger.fromJson(Map<String, dynamic> json) {
    return Ledger(
      id: json['id'],
      name: json['name'],
      parentGroup: json['parent_group'],
      closingBalance: (json['closing_balance'] ?? 0).toDouble(),
      phone: json['phone'],
      email: json['email'],
    );
  }
}

class DashboardSummary {
  final double totalSales;
  final double totalPurchases;
  final double totalReceivables;
  final double totalPayables;
  final double netProfit;
  final int ledgerCount;

  DashboardSummary({
    required this.totalSales,
    required this.totalPurchases,
    required this.totalReceivables,
    required this.totalPayables,
    required this.netProfit,
    required this.ledgerCount,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    return DashboardSummary(
      totalSales: (json['totalSales'] ?? 0).toDouble(),
      totalPurchases: (json['totalPurchases'] ?? 0).toDouble(),
      totalReceivables: (json['totalReceivables'] ?? 0).toDouble(),
      totalPayables: (json['totalPayables'] ?? 0).toDouble(),
      netProfit: (json['netProfit'] ?? 0).toDouble(),
      ledgerCount: json['ledgerCount'] ?? 0,
    );
  }
}

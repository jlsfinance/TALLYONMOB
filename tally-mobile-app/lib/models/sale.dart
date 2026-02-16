/// Sale model
class Sale {
  final String id;
  final String companyId;
  final String? vchNumber;
  final String? partyLedger;
  final double? amount;
  final DateTime? syncedAt;
  final Map<String, dynamic>? rawData;

  Sale({
    required this.id,
    required this.companyId,
    this.vchNumber,
    this.partyLedger,
    this.amount,
    this.syncedAt,
    this.rawData,
  });

  factory Sale.fromJson(Map<String, dynamic> json) {
    return Sale(
      id: json['id'] as String,
      companyId: json['company_id'] as String,
      vchNumber: json['invoice_number'] as String?,
      partyLedger: json['party_ledger_name'] as String?,
      amount: (json['net_amount'] as num?)?.toDouble(),
      syncedAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : null,
      rawData: json,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'company_id': companyId,
      'invoice_number': vchNumber,
      'party_ledger_name': partyLedger,
      'net_amount': amount,
      'created_at': syncedAt?.toIso8601String(),
      'raw_data': rawData,
    };
  }
}

/// Purchase model
class Purchase {
  final String id;
  final String companyId;
  final String? vchNumber;
  final String? partyLedger;
  final double? amount;
  final DateTime? syncedAt;
  final Map<String, dynamic>? rawData;

  Purchase({
    required this.id,
    required this.companyId,
    this.vchNumber,
    this.partyLedger,
    this.amount,
    this.syncedAt,
    this.rawData,
  });

  factory Purchase.fromJson(Map<String, dynamic> json) {
    return Purchase(
      id: json['id'] as String,
      companyId: json['company_id'] as String,
      vchNumber: json['invoice_number'] as String?,
      partyLedger: json['party_ledger_name'] as String?,
      amount: (json['net_amount'] as num?)?.toDouble(),
      syncedAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : null,
      rawData: json,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'company_id': companyId,
      'invoice_number': vchNumber,
      'party_ledger_name': partyLedger,
      'net_amount': amount,
      'created_at': syncedAt?.toIso8601String(),
      'raw_data': rawData,
    };
  }
}

/// Stock model
class Stock {
  final String id;
  final String companyId;
  final String itemName;
  final double? closingStock;
  final double? closingValue;
  final String? baseUnit;
  final DateTime? syncedAt;
  final Map<String, dynamic>? rawData;

  Stock({
    required this.id,
    required this.companyId,
    required this.itemName,
    this.closingStock,
    this.closingValue,
    this.baseUnit,
    this.syncedAt,
    this.rawData,
  });

  factory Stock.fromJson(Map<String, dynamic> json) {
    return Stock(
      id: json['id'] as String,
      companyId: json['company_id'] as String,
      itemName: json['name'] as String,
      closingStock: (json['current_stock'] as num?)?.toDouble(),
      closingValue: (json['closing_value'] as num?)?.toDouble(),
      baseUnit: json['unit'] as String?,
      syncedAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : null,
      rawData: json,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'company_id': companyId,
      'name': itemName,
      'current_stock': closingStock,
      'closing_value': closingValue,
      'unit': baseUnit,
      'created_at': syncedAt?.toIso8601String(),
      'raw_data': rawData,
    };
  }
}

/// Dashboard summary model
class DashboardSummary {
  final int totalLedgers;
  final int totalVouchers;
  final double totalSalesAmount;
  final double totalPurchasesAmount;
  final double totalStockValue;
  final double netSalesPurchase;
  final DateTime? lastActivity;
  final String syncStatus;

  DashboardSummary({
    this.totalLedgers = 0,
    this.totalVouchers = 0,
    this.totalSalesAmount = 0,
    this.totalPurchasesAmount = 0,
    this.totalStockValue = 0,
    this.netSalesPurchase = 0,
    this.lastActivity,
    this.syncStatus = 'unknown',
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    final overview = json['overview'] as Map<String, dynamic>? ?? {};
    return DashboardSummary(
      totalLedgers: overview['totalLedgers'] as int? ?? 0,
      totalVouchers: overview['totalVouchers'] as int? ?? 0,
      totalSalesAmount: (overview['totalSalesAmount'] as num?)?.toDouble() ?? 0,
      totalPurchasesAmount:
          (overview['totalPurchasesAmount'] as num?)?.toDouble() ?? 0,
      totalStockValue: (overview['totalStockValue'] as num?)?.toDouble() ?? 0,
      netSalesPurchase: (overview['netSalesPurchase'] as num?)?.toDouble() ?? 0,
      lastActivity: json['lastActivity'] != null
          ? DateTime.parse(json['lastActivity'])
          : null,
      syncStatus: json['syncStatus'] as String? ?? 'unknown',
    );
  }
}

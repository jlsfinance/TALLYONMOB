/// Ledger model
class Ledger {
  final String id;
  final String companyId;
  final String name;
  final String? ledgerGroup;
  final double? openingBalance;
  final double? currentBalance;
  final DateTime? syncedAt;
  final Map<String, dynamic>? rawData;

  Ledger({
    required this.id,
    required this.companyId,
    required this.name,
    this.ledgerGroup,
    this.openingBalance,
    this.currentBalance,
    this.syncedAt,
    this.rawData,
  });

  factory Ledger.fromJson(Map<String, dynamic> json) {
    return Ledger(
      id: json['id'] as String,
      companyId: json['company_id'] as String,
      name: json['name'] as String,
      ledgerGroup: json['parent'] as String?,
      openingBalance: (json['opening_balance'] as num?)?.toDouble(),
      currentBalance: (json['current_balance'] as num?)?.toDouble(),
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
      'name': name,
      'parent': ledgerGroup,
      'opening_balance': openingBalance,
      'current_balance': currentBalance,
      'created_at': syncedAt?.toIso8601String(),
      'raw_data': rawData,
    };
  }

  /// Get balance color (positive = green, negative = red)
  bool get isDebit => (currentBalance ?? 0) > 0;
  bool get isCredit => (currentBalance ?? 0) < 0;
}

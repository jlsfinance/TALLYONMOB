/// Voucher model
class Voucher {
  final String id;
  final String companyId;
  final String? voucherNumber;
  final String? voucherType;
  final DateTime? vchDate;
  final double? amount;
  final String? narration;
  final DateTime? syncedAt;
  final Map<String, dynamic>? rawData;

  Voucher({
    required this.id,
    required this.companyId,
    this.voucherNumber,
    this.voucherType,
    this.vchDate,
    this.amount,
    this.narration,
    this.syncedAt,
    this.rawData,
  });

  factory Voucher.fromJson(Map<String, dynamic> json) {
    return Voucher(
      id: json['id'] as String,
      companyId: json['company_id'] as String,
      voucherNumber: json['voucher_number'] as String?,
      voucherType: json['voucher_type'] as String?,
      vchDate: json['vch_date'] != null
          ? DateTime.parse(json['vch_date'])
          : null,
      amount: (json['amount'] as num?)?.toDouble(),
      narration: json['narration'] as String?,
      syncedAt: json['synced_at'] != null
          ? DateTime.parse(json['synced_at'])
          : null,
      rawData: json['raw_data'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'company_id': companyId,
      'voucher_number': voucherNumber,
      'voucher_type': voucherType,
      'vch_date': vchDate?.toIso8601String(),
      'amount': amount,
      'narration': narration,
      'synced_at': syncedAt?.toIso8601String(),
      'raw_data': rawData,
    };
  }

  /// Get voucher type icon
  String get typeIcon {
    switch (voucherType?.toLowerCase()) {
      case 'sales':
        return '🛒';
      case 'purchase':
        return '📦';
      case 'payment':
        return '💸';
      case 'receipt':
        return '💰';
      case 'journal':
        return '📝';
      case 'contra':
        return '🔄';
      default:
        return '📄';
    }
  }
}

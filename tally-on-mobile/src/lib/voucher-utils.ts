export type VoucherAmountSource = {
  totalAmount?: unknown;
  grandTotal?: unknown;
  amount?: unknown;
  ledgerEntries?: Array<{ amount?: unknown }>;
  stockEntries?: Array<{ amount?: unknown }>;
};

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return numeric(String(value));
  }
  return 0;
}

/** Prefer the final invoice total, while supporting older imported records. */
export function getVoucherAmount(voucher: VoucherAmountSource): number {
  const grandTotal = numeric(voucher.grandTotal);
  if (grandTotal !== 0) return Math.abs(grandTotal);

  const totalAmount = numeric(voucher.totalAmount);
  if (totalAmount !== 0) return Math.abs(totalAmount);

  const amount = numeric(voucher.amount);
  if (amount !== 0) return Math.abs(amount);

  const stockTotal = (voucher.stockEntries ?? []).reduce((sum, entry) => sum + Math.abs(numeric(entry.amount)), 0);
  if (stockTotal !== 0) return stockTotal;
  return (voucher.ledgerEntries ?? []).reduce((sum, entry) => sum + Math.abs(numeric(entry.amount)), 0);
}

export function isVoucherType(voucherType: unknown, type: 'sales' | 'purchase'): boolean {
  const normalized = String(voucherType ?? '').trim().toLowerCase();
  return type === 'sales'
    ? normalized === 'sales' || normalized === 'sales invoice'
    : normalized === 'purchase' || normalized === 'purchase invoice';
}

export type BusinessPeriod = { from: string; to: string; label: string; startYear: number };
export type VoucherGroup = 'sales' | 'purchases' | 'receipts' | 'payments';

const SALES_TYPES = new Set(['sales', 'sales invoice']);
const PURCHASE_TYPES = new Set(['purchase', 'purchase invoice']);
const RECEIPT_TYPES = new Set(['receipt']);
const PAYMENT_TYPES = new Set(['payment']);

export const normalizeVoucherType = (value: unknown): string =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const getVoucherAmount = (row: any): number => {
  const grand = Number(row?.grand_total);
  if (Number.isFinite(grand) && grand !== 0) return Math.abs(grand);
  const total = Number(row?.total_amount);
  return Number.isFinite(total) ? Math.abs(total) : 0;
};

export const getFinancialYearRange = (startYear: number): BusinessPeriod => ({
  startYear,
  from: `${startYear}-04-01`,
  to: `${startYear + 1}-03-31`,
  label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
});

export const getCurrentFinancialYearStart = (date = new Date()): number => {
  const year = date.getFullYear();
  return date.getMonth() >= 3 ? year : year - 1;
};

export const getPreviousFinancialYearRange = (startYear: number): BusinessPeriod =>
  getFinancialYearRange(startYear - 1);

export const parseFinancialYearStart = (value: string | number | null | undefined): number => {
  const match = String(value ?? '').match(/(20\d{2})/);
  const parsed = match ? Number(match[1]) : getCurrentFinancialYearStart();
  return Number.isFinite(parsed) ? parsed : getCurrentFinancialYearStart();
};

export const isIncludedVoucher = (row: any, group: VoucherGroup): boolean => {
  const type = normalizeVoucherType(row?.voucher_type || row?.transaction_type);
  if (group === 'sales') return SALES_TYPES.has(type);
  if (group === 'purchases') return PURCHASE_TYPES.has(type);
  if (group === 'receipts') return RECEIPT_TYPES.has(type);
  return PAYMENT_TYPES.has(type);
};

export const sumVoucherAmounts = (rows: any[], group?: VoucherGroup): number =>
  rows.filter((row) => !group || isIncludedVoucher(row, group))
    .reduce((sum, row) => sum + getVoucherAmount(row), 0);

export const monthKey = (date: string): string => String(date || '').slice(0, 7);

export const financialYearMonths = (startYear: number) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = (3 + index) % 12;
    const year = startYear + (month < 3 ? 1 : 0);
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    return { key, label: new Date(year, month, 1).toLocaleString('en-IN', { month: 'short' }) };
  });

export const aggregateMonthlyTrend = (rows: any[], startYear: number) => {
  const months = financialYearMonths(startYear);
  const result = months.map((month) => ({ ...month, sales: 0, purchases: 0, salesCount: 0, purchaseCount: 0 }));
  const lookup = new Map(result.map((row) => [row.key, row]));
  rows.forEach((row) => {
    const target = lookup.get(monthKey(row?.voucher_date));
    if (!target) return;
    const amount = getVoucherAmount(row);
    if (isIncludedVoucher(row, 'sales')) {
      target.sales += amount;
      target.salesCount += 1;
    }
    if (isIncludedVoucher(row, 'purchases')) {
      target.purchases += amount;
      target.purchaseCount += 1;
    }
  });
  return result;
};

export const aggregateTopParties = (rows: any[], group: 'sales' | 'purchases', limit = 5) => {
  const map = new Map<string, { name: string; amount: number; count: number; lastDate: string | null }>();
  rows.filter((row) => isIncludedVoucher(row, group)).forEach((row) => {
    const rawName = String(row?.party_name || '').trim();
    const key = rawName.toLowerCase();
    if (!key) return;
    const current = map.get(key) || { name: rawName, amount: 0, count: 0, lastDate: null };
    current.amount += getVoucherAmount(row);
    current.count += 1;
    if (!current.lastDate || String(row.voucher_date) > current.lastDate) current.lastDate = row.voucher_date || null;
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount).slice(0, limit);
};

export const calculatePeriodComparison = (current: number, previous: number) => {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    percentage: previous === 0 ? null : (change / Math.abs(previous)) * 100,
  };
};

export const ageInDays = (date: string, asOnDate: string): number | null => {
  if (!date || !asOnDate) return null;
  const from = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(asOnDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.floor((to - from) / 86400000));
};

export const ageBucket = (days: number) => {
  if (days <= 30) return 'current';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  return '120+';
};

export type AgeingMode = 'receivable' | 'payable';
export type AgeingParty = {
  id: string;
  name: string;
  phone?: string;
  buckets: Record<'current' | '31-60' | '61-90' | '91-120' | '120+', number>;
  total: number;
  oldestDate: string | null;
};

const bucketKeys = ['current', '31-60', '61-90', '91-120', '120+'] as const;

export const calculateAgeing = (vouchers: any[], ledgers: any[], asOnDate: string, mode: AgeingMode) => {
  const isReceivable = mode === 'receivable';
  const eligibleParents = isReceivable ? ['sundry debtors'] : ['sundry creditors'];
  const parties: AgeingParty[] = [];
  const ledgerByName = new Map<string, any>();
  ledgers.forEach((ledger) => {
    const parent = String(ledger?.parent || ledger?.parent_group || '').trim().toLowerCase();
    if (eligibleParents.includes(parent)) ledgerByName.set(String(ledger.name || '').trim().toLowerCase(), ledger);
  });
  const relevant = new Map<string, any[]>();
  vouchers.forEach((voucher) => {
    const date = String(voucher?.voucher_date || '').slice(0, 10);
    if (!date || date > asOnDate) return;
    const name = String(voucher?.party_name || '').trim().toLowerCase();
    if (!name || !ledgerByName.has(name)) return;
    const list = relevant.get(name) || [];
    list.push(voucher);
    relevant.set(name, list);
  });

  ledgerByName.forEach((ledger, key) => {
    const buckets = { current: 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 } as AgeingParty['buckets'];
    const outstanding: Array<{ amount: number; date: string; age: number }> = [];
    const opening = Number(ledger?.opening_balance);
    if (Number.isFinite(opening) && opening > 0) outstanding.push({ amount: opening, date: '', age: 121 });
    const list = (relevant.get(key) || []).slice().sort((a, b) => String(a.voucher_date).localeCompare(String(b.voucher_date)));
    list.forEach((voucher) => {
      const type = normalizeVoucherType(voucher.voucher_type);
      const amount = getVoucherAmount(voucher);
      const isAddition = isReceivable ? type === 'sales' || type === 'sales invoice' || type === 'debit note' : type === 'purchase' || type === 'purchase invoice' || type === 'credit note';
      const isSettlement = isReceivable ? type === 'receipt' || type === 'credit note' : type === 'payment' || type === 'debit note';
      const age = ageInDays(voucher.voucher_date, asOnDate);
      if (isAddition && amount > 0 && age !== null) outstanding.push({ amount, date: String(voucher.voucher_date).slice(0, 10), age });
      if (isSettlement && amount > 0) {
        let remaining = amount;
        for (const item of outstanding) {
          if (remaining <= 0) break;
          const used = Math.min(item.amount, remaining);
          item.amount -= used;
          remaining -= used;
        }
      }
    });
    outstanding.filter((item) => item.amount > 0).forEach((item) => {
      const key = ageBucket(item.age) as keyof AgeingParty['buckets'];
      buckets[key] += item.amount;
    });
    const total = bucketKeys.reduce((sum, keyName) => sum + buckets[keyName], 0);
    if (total > 0) {
      const dates = outstanding.filter((item) => item.amount > 0 && item.date).map((item) => item.date).sort();
      parties.push({ id: String(ledger.id), name: ledger.name, phone: ledger.phone, buckets, total, oldestDate: dates[0] || null });
    }
  });
  parties.sort((a, b) => b.total - a.total);
  const totals = bucketKeys.reduce((acc, key) => ({ ...acc, [key]: parties.reduce((sum, party) => sum + party.buckets[key], 0) }), {} as AgeingParty['buckets']);
  return { parties, totals, grandTotal: bucketKeys.reduce((sum, key) => sum + totals[key], 0) };
};

export const getInventoryReliability = (stockItems: any[], stockEntries: any[]) => {
  const hasCurrentStock = stockItems.length > 0 && stockItems.some((row) => Number.isFinite(Number(row.current_stock)));
  const hasMovement = stockEntries.length > 0 && stockEntries.some((row) => Number(row.quantity) > 0);
  const hasThreshold = stockItems.length > 0 && stockItems.some((row) => Number.isFinite(Number(row.reorder_level)) || Number.isFinite(Number(row.minimum_level)) || Number.isFinite(Number(row.min_stock)));
  return { hasCurrentStock, hasMovement, hasThreshold, reliable: hasCurrentStock || hasMovement };
};

export const aggregateInventoryMovement = (stockItems: any[], entries: any[], vouchers: any[], startYear: number) => {
  const voucherMap = new Map(vouchers.map((voucher) => [String(voucher.id), voucher]));
  const items = new Map<string, any>();
  stockItems.forEach((item) => items.set(String(item.id || item.name).toLowerCase(), { id: item.id, name: item.name, unit: item.unit, currentStock: Number(item.current_stock) || 0, value: Number(item.closing_value) || 0, threshold: Number(item.reorder_level ?? item.minimum_level ?? item.min_stock), inward: 0, outward: 0, inwardValue: 0, outwardValue: 0 }));
  entries.forEach((entry) => {
    const voucher = voucherMap.get(String(entry.voucher_id));
    if (!voucher || !entry.stock_item_name) return;
    const date = String(voucher.voucher_date || '').slice(0, 10);
    if (!date || !date.startsWith(String(startYear)) && !(date >= `${startYear}-04-01` && date <= `${startYear + 1}-03-31`)) return;
    const key = String(entry.stock_item_id || entry.stock_item_name).toLowerCase();
    const current = items.get(key) || { id: entry.stock_item_id, name: entry.stock_item_name, unit: entry.unit, currentStock: 0, value: 0, threshold: NaN, inward: 0, outward: 0, inwardValue: 0, outwardValue: 0 };
    const qty = Math.abs(Number(entry.quantity) || 0);
    const value = Math.abs(Number(entry.amount) || qty * (Number(entry.rate) || 0));
    const inward = entry.is_inward === true || normalizeVoucherType(voucher.voucher_type).startsWith('purchase');
    if (inward) { current.inward += qty; current.inwardValue += value; } else { current.outward += qty; current.outwardValue += value; }
    items.set(key, current);
  });
  return Array.from(items.values()).filter((item) => item.inward > 0 || item.outward > 0 || item.currentStock !== 0).sort((a, b) => (b.outwardValue + b.outward) - (a.outwardValue + a.outward));
};

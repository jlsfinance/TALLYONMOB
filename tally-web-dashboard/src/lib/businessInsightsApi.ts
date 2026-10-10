import { supabase } from './insforge';
import type { BusinessPeriod } from './businessInsights';

const PAGE_SIZE = 500;

type QueryBuilder = (from: number, to: number) => any;

async function fetchAll(buildQuery: QueryBuilder) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const activeVouchers = (query: any) => query.or('is_deleted.is.null,is_deleted.eq.false');

export async function fetchVouchersForPeriod(companyId: string, period: BusinessPeriod) {
  return fetchAll((from, to) => activeVouchers(
    supabase.from('vouchers')
      .select('id, company_id, voucher_number, voucher_type, voucher_date, party_name, party_ledger_id, total_amount, grand_total, is_deleted')
      .eq('company_id', companyId)
      .gte('voucher_date', period.from)
      .lte('voucher_date', period.to)
      .order('voucher_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  ));
}

export async function fetchVouchersUntil(companyId: string, asOnDate: string) {
  return fetchAll((from, to) => activeVouchers(
    supabase.from('vouchers')
      .select('id, company_id, voucher_number, voucher_type, voucher_date, party_name, party_ledger_id, total_amount, grand_total, is_deleted')
      .eq('company_id', companyId)
      .lte('voucher_date', asOnDate)
      .order('voucher_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  ));
}

export async function fetchLedgers(companyId: string) {
  return fetchAll((from, to) => supabase.from('ledgers')
    .select('id, company_id, name, parent, opening_balance, current_balance, phone')
    .eq('company_id', companyId)
    .order('id', { ascending: true })
    .range(from, to));
}

export async function fetchStockItems(companyId: string) {
  return fetchAll((from, to) => supabase.from('stock_items')
    .select('id, company_id, name, unit, current_stock, rate, closing_value, opening_stock, reorder_level, minimum_level, min_stock')
    .eq('company_id', companyId)
    .order('id', { ascending: true })
    .range(from, to));
}

export async function fetchStockEntries(companyId: string) {
  return fetchAll((from, to) => supabase.from('voucher_stock_entries')
    .select('id, company_id, voucher_id, stock_item_id, stock_item_name, quantity, rate, amount, unit, is_inward')
    .eq('company_id', companyId)
    .order('id', { ascending: true })
    .range(from, to));
}

export async function fetchBusinessInsightsData(companyId: string, period: BusinessPeriod, comparison: BusinessPeriod, asOnDate = period.to) {
  const results = await Promise.allSettled([
    fetchVouchersForPeriod(companyId, period),
    fetchVouchersForPeriod(companyId, comparison),
    fetchVouchersUntil(companyId, asOnDate),
    fetchLedgers(companyId),
    fetchStockItems(companyId),
    fetchStockEntries(companyId),
  ]);
  const [current, previous, untilDate, ledgers, stockItems, stockEntries] = results;
  const unwrap = (result: PromiseSettledResult<any[]>) => result.status === 'fulfilled' ? result.value : [];
  const errors = results.map((result, index) => result.status === 'rejected' ? { section: ['current', 'previous', 'untilDate', 'ledgers', 'stockItems', 'stockEntries'][index], message: String(result.reason?.message || result.reason || 'Query failed') } : null).filter(Boolean);
  return {
    current: unwrap(current),
    previous: unwrap(previous),
    untilDate: unwrap(untilDate),
    ledgers: unwrap(ledgers),
    stockItems: unwrap(stockItems),
    stockEntries: unwrap(stockEntries),
    errors,
    partial: errors.length > 0,
  };
}

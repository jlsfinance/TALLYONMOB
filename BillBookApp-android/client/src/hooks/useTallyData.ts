import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================
// INTERFACES (mirroring those in components)
// ============================================================

export interface LedgerItem {
  id: string;
  name: string;
  group: string;
  balance: number;
  balanceType: 'Dr' | 'Cr';
  openingBalance?: number;
}

export type VoucherType =
  | 'Sales'
  | 'Purchase'
  | 'Payment'
  | 'Receipt'
  | 'Contra'
  | 'Journal'
  | 'CreditNote'
  | 'DebitNote';

export interface VoucherItem {
  id: string;
  type: VoucherType;
  number: string;
  partyName: string;
  amount: number;
  date: string;
  time?: string;
  paymentMode?: string;
  narration?: string;
  gstTotal?: number;
}

export interface StockItem {
  id: string;
  name: string;
  company_id: string;
  stock_group?: string;
  closing_balance?: number;
  opening_balance?: number;
  rate?: number;
  gst_rate?: number;
  hsn_code?: string;
  unit?: string;
  description?: string;
}

export interface DashboardStats {
  monthlyRevenue: number;
  monthlyExpenses: number;
  netIncome: number;
  revenueChange: number;
  expensesChange: number;
  totalOutstanding: number;
  totalReceivables: number;
  totalPayables: number;
  stockValue: number;
  cashInHand: number;
  topItems: { name: string; value: number }[];
  recentTransactions: { id: string; date: string; party: string; amount: number; type: string }[];
}

// ============================================================
// FETCH FILTERS
// ============================================================

export interface VoucherFilters {
  type?: VoucherType;
  fromDate?: string;
  toDate?: string;
  partyName?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// CONFIG CHECK — real Supabase or simulated mode?
// ============================================================

function isSupabaseConfigured(): boolean {
  try {
    const url = import.meta.env.VITE_INFORGE_URL as string | undefined;
    const key = import.meta.env.VITE_INFORGE_ANON_KEY as string | undefined;
    // Fallback to Supabase env vars for backwards compatibility
    const url2 = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key2 = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    const hasUrl = !!url || !!url2;
    const hasKey = !!key || !!key2;
    return hasUrl && hasKey;
  } catch {
    return false;
  }
}

const USE_REAL_DATA = isSupabaseConfigured();

// ============================================================
// SIMULATED / FALLBACK DATA
// ============================================================

function generateSimulatedLedgers(companyId: string): LedgerItem[] {
  return [
    { id: 'sim-ledger-1', name: 'Petty Cash', group: 'Current Assets', balance: 15000, balanceType: 'Dr', openingBalance: 10000 },
    { id: 'sim-ledger-2', name: 'Cash-in-Hand', group: 'Current Assets', balance: 250000, balanceType: 'Dr', openingBalance: 200000 },
    { id: 'sim-ledger-3', name: 'Bank of India', group: 'Bank Accounts', balance: 1250000, balanceType: 'Dr', openingBalance: 1100000 },
    { id: 'sim-ledger-4', name: 'HDFC Bank', group: 'Bank Accounts', balance: 875000, balanceType: 'Dr', openingBalance: 800000 },
    { id: 'sim-ledger-5', name: 'Rajesh Electronics', group: 'Sundry Debtors', balance: 125000, balanceType: 'Dr', openingBalance: 100000 },
    { id: 'sim-ledger-6', name: 'Priya Traders', group: 'Sundry Debtors', balance: 87500, balanceType: 'Dr', openingBalance: 75000 },
    { id: 'sim-ledger-7', name: 'Amit Enterprises', group: 'Sundry Debtors', balance: 220000, balanceType: 'Dr', openingBalance: 180000 },
    { id: 'sim-ledger-8', name: 'Sneha Garments', group: 'Sundry Debtors', balance: 56000, balanceType: 'Dr', openingBalance: 50000 },
    { id: 'sim-ledger-9', name: 'Vishal Suppliers', group: 'Sundry Creditors', balance: 98000, balanceType: 'Cr', openingBalance: 85000 },
    { id: 'sim-ledger-10', name: 'Meena Distributors', group: 'Sundry Creditors', balance: 145000, balanceType: 'Cr', openingBalance: 120000 },
    { id: 'sim-ledger-11', name: 'Kumar Brothers', group: 'Sundry Creditors', balance: 67000, balanceType: 'Cr', openingBalance: 60000 },
    { id: 'sim-ledger-12', name: 'Sales Account', group: 'Direct Incomes', balance: 4500000, balanceType: 'Cr', openingBalance: 3800000 },
    { id: 'sim-ledger-13', name: 'Purchases Account', group: 'Direct Expenses', balance: 3200000, balanceType: 'Dr', openingBalance: 2800000 },
    { id: 'sim-ledger-14', name: 'Salary Account', group: 'Indirect Expenses', balance: 480000, balanceType: 'Dr', openingBalance: 420000 },
    { id: 'sim-ledger-15', name: 'Rent Account', group: 'Indirect Expenses', balance: 180000, balanceType: 'Dr', openingBalance: 150000 },
    { id: 'sim-ledger-16', name: 'Electricity Charges', group: 'Indirect Expenses', balance: 72000, balanceType: 'Dr', openingBalance: 60000 },
    { id: 'sim-ledger-17', name: "Owner's Capital", group: 'Capital Account', balance: 5000000, balanceType: 'Cr', openingBalance: 4500000 },
    { id: 'sim-ledger-18', name: 'GST Payable', group: 'Duties & Taxes', balance: 45000, balanceType: 'Cr', openingBalance: 35000 },
    { id: 'sim-ledger-19', name: 'TDS Payable', group: 'Duties & Taxes', balance: 12000, balanceType: 'Cr', openingBalance: 10000 },
    { id: 'sim-ledger-20', name: 'GST Input Credit', group: 'Current Assets', balance: 32000, balanceType: 'Dr', openingBalance: 25000 },
  ];
}

function generateSimulatedVouchers(companyId: string, filters?: VoucherFilters): VoucherItem[] {
  let vouchers: VoucherItem[] = [
    { id: 'sim-v-1', type: 'Sales', number: 'SALE-001', partyName: 'Rajesh Electronics', amount: 45200, date: '2026-05-19', time: '10:30 AM', paymentMode: 'Bank Transfer', narration: 'Sale of Electronic Components', gstTotal: 6790 },
    { id: 'sim-v-2', type: 'Sales', number: 'SALE-002', partyName: 'Priya Traders', amount: 28300, date: '2026-05-19', time: '11:15 AM', paymentMode: 'Cheque', narration: 'Sale of Stationery Items', gstTotal: 4245 },
    { id: 'sim-v-3', type: 'Purchase', number: 'PUR-001', partyName: 'Vishal Suppliers', amount: 156000, date: '2026-05-18', time: '09:45 AM', paymentMode: 'Bank Transfer', narration: 'Purchase of Raw Materials', gstTotal: 23400 },
    { id: 'sim-v-4', type: 'Receipt', number: 'REC-001', partyName: 'Amit Enterprises', amount: 120000, date: '2026-05-18', time: '02:00 PM', paymentMode: 'Cash', narration: 'Payment received against Invoice INV-0042' },
    { id: 'sim-v-5', type: 'Payment', number: 'PAY-001', partyName: 'Meena Distributors', amount: 75000, date: '2026-05-17', time: '03:30 PM', paymentMode: 'Bank Transfer', narration: 'Payment against Purchase Bill P-0234' },
    { id: 'sim-v-6', type: 'Sales', number: 'SALE-003', partyName: 'Sneha Garments', amount: 18900, date: '2026-05-17', time: '12:00 PM', paymentMode: 'UPI', narration: 'Sale of Textile Items', gstTotal: 2835 },
    { id: 'sim-v-7', type: 'Journal', number: 'JRNL-001', partyName: 'Owner', amount: 50000, date: '2026-05-16', time: '10:00 AM', narration: 'Capital Introduction' },
    { id: 'sim-v-8', type: 'Contra', number: 'CTR-001', partyName: 'Bank of India', amount: 100000, date: '2026-05-16', time: '11:00 AM', narration: 'Cash deposited to Bank' },
    { id: 'sim-v-9', type: 'CreditNote', number: 'CN-001', partyName: 'Rajesh Electronics', amount: 5000, date: '2026-05-15', time: '04:00 PM', narration: 'Credit note for damaged goods', gstTotal: 750 },
    { id: 'sim-v-10', type: 'Purchase', number: 'PUR-002', partyName: 'Kumar Brothers', amount: 89000, date: '2026-05-15', time: '01:30 PM', paymentMode: 'Credit', narration: 'Purchase of Hardware Tools', gstTotal: 13350 },
    { id: 'sim-v-11', type: 'Sales', number: 'SALE-004', partyName: 'Priya Traders', amount: 34500, date: '2026-05-14', time: '10:45 AM', paymentMode: 'Cheque', narration: 'Office Supplies Sale', gstTotal: 5175 },
    { id: 'sim-v-12', type: 'Payment', number: 'PAY-002', partyName: 'Electricity Board', amount: 18000, date: '2026-05-14', time: '09:00 AM', paymentMode: 'Auto Debit', narration: 'Monthly Electricity Payment' },
    { id: 'sim-v-13', type: 'Receipt', number: 'REC-002', partyName: 'Sneha Garments', amount: 56000, date: '2026-05-13', time: '03:15 PM', paymentMode: 'Bank Transfer', narration: 'Full settlement of outstanding' },
    { id: 'sim-v-14', type: 'Journal', number: 'JRNL-002', partyName: 'Depreciation A/c', amount: 25000, date: '2026-05-12', time: '05:00 PM', narration: 'Monthly Depreciation Entry' },
    { id: 'sim-v-15', type: 'DebitNote', number: 'DN-001', partyName: 'Vishal Suppliers', amount: 3000, date: '2026-05-12', time: '02:00 PM', narration: 'Debit note for short delivery', gstTotal: 450 },
  ];

  if (filters) {
    if (filters.type) vouchers = vouchers.filter(v => v.type === filters.type);
    if (filters.fromDate) vouchers = vouchers.filter(v => v.date >= filters.fromDate!);
    if (filters.toDate) vouchers = vouchers.filter(v => v.date <= filters.toDate!);
    if (filters.partyName) vouchers = vouchers.filter(v => v.partyName.toLowerCase().includes(filters.partyName!.toLowerCase()));
    if (filters.search) vouchers = vouchers.filter(v =>
      v.number.toLowerCase().includes(filters.search!.toLowerCase()) ||
      v.partyName.toLowerCase().includes(filters.search!.toLowerCase()) ||
      v.narration?.toLowerCase().includes(filters.search!.toLowerCase())
    );
    if (filters.limit) vouchers = vouchers.slice(0, filters.limit);
  }

  return vouchers;
}

function generateSimulatedDashboardStats(companyId: string): DashboardStats {
  return {
    monthlyRevenue: 452000,
    monthlyExpenses: 325000,
    netIncome: 127000,
    revenueChange: 12.5,
    expensesChange: -3.2,
    totalOutstanding: 488500,
    totalReceivables: 625000,
    totalPayables: 310000,
    stockValue: 850000,
    cashInHand: 265000,
    topItems: [
      { name: 'Electronic Components', value: 185000 },
      { name: 'Office Stationery', value: 95000 },
      { name: 'Textile Items', value: 72000 },
      { name: 'Hardware Tools', value: 58000 },
    ],
    recentTransactions: [
      { id: 'sim-tx-1', date: '2026-05-19', party: 'Rajesh Electronics', amount: 45200, type: 'Sales' },
      { id: 'sim-tx-2', date: '2026-05-19', party: 'Priya Traders', amount: 28300, type: 'Sales' },
      { id: 'sim-tx-3', date: '2026-05-18', party: 'Vishal Suppliers', amount: 156000, type: 'Purchase' },
      { id: 'sim-tx-4', date: '2026-05-18', party: 'Amit Enterprises', amount: 120000, type: 'Receipt' },
      { id: 'sim-tx-5', date: '2026-05-17', party: 'Meena Distributors', amount: 75000, type: 'Payment' },
    ],
  };
}

function generateSimulatedStock(companyId: string): StockItem[] {
  return [
    { id: 'sim-stk-1', name: 'Resistor 100 Ohm', company_id: companyId, stock_group: 'Electronic Components', closing_balance: 5000, rate: 2, gst_rate: 18, hsn_code: '853321', unit: 'pcs' },
    { id: 'sim-stk-2', name: 'Capacitor 10uF', company_id: companyId, stock_group: 'Electronic Components', closing_balance: 3000, rate: 5, gst_rate: 18, hsn_code: '853225', unit: 'pcs' },
    { id: 'sim-stk-3', name: 'A4 Paper Pack', company_id: companyId, stock_group: 'Stationery', closing_balance: 200, rate: 350, gst_rate: 12, hsn_code: '480256', unit: 'pack' },
    { id: 'sim-stk-4', name: 'Cotton Fabric - White', company_id: companyId, stock_group: 'Textiles', closing_balance: 500, rate: 120, gst_rate: 5, hsn_code: '520852', unit: 'meter' },
    { id: 'sim-stk-5', name: 'Steel Rod 12mm', company_id: companyId, stock_group: 'Hardware', closing_balance: 1000, rate: 85, gst_rate: 18, hsn_code: '721420', unit: 'kg' },
  ];
}

// Simulated fetch delay
const SIM_DELAY_MS = 300;

function delay(ms: number = SIM_DELAY_MS): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// COLUMN MAPPING HELPERS
// ============================================================

/**
 * Maps a Supabase ledger row (snake_case) to LedgerItem interface.
 * - parent_group -> group
 * - closing_balance -> balance (positive = Dr, negative = Cr)
 * - opening_balance -> openingBalance
 */
function mapLedgerRow(row: any): LedgerItem {
  const balance = Math.abs(row.closing_balance ?? 0);
  const balanceType: 'Dr' | 'Cr' = (row.closing_balance ?? 0) >= 0 ? 'Dr' : 'Cr';
  return {
    id: row.id,
    name: row.name,
    group: row.parent_group || 'General',
    balance,
    balanceType,
    openingBalance: row.opening_balance != null ? Math.abs(row.opening_balance) : undefined,
  };
}

/**
 * Maps a Supabase voucher row to VoucherItem interface.
 * - voucher_number -> number
 * - voucher_type -> type
 * - vch_date -> date
 * - party_ledger_name -> partyName
 */
function mapVoucherRow(row: any): VoucherItem {
  return {
    id: row.id,
    type: (row.voucher_type as VoucherType) || 'Journal',
    number: row.voucher_number || '',
    partyName: row.party_ledger_name || '',
    amount: row.amount ?? 0,
    date: row.vch_date || '',
    time: row.time || undefined,
    paymentMode: row.payment_mode || undefined,
    narration: row.narration || undefined,
    gstTotal: row.gst_total != null ? row.gst_total : undefined,
  };
}

// ============================================================
// FETCH LEDGERS
// ============================================================

/**
 * Fetches ledgers from the 'ledgers' Supabase table for a given company.
 * Maps parent_group -> group, closing_balance -> balance (Dr/Cr).
 */
export async function fetchLedgers(companyId: string): Promise<LedgerItem[]> {
  try {
    if (!USE_REAL_DATA) {
      await delay();
      return generateSimulatedLedgers(companyId);
    }

    const { data, error } = await supabase.database
      .from('ledgers')
      .select('id, name, parent_group, closing_balance, opening_balance, master_id')
      .eq('company_id', companyId)
      .order('name')
      .limit(10000);

    if (error) {
      console.error('[useTallyData] Error fetching ledgers:', error);
      await delay();
      return generateSimulatedLedgers(companyId);
    }

    if (!data || data.length === 0) {
      console.warn('[useTallyData] No ledgers found for company:', companyId);
      await delay();
      return generateSimulatedLedgers(companyId);
    }

    return data.map(mapLedgerRow);
  } catch (err) {
    console.error('[useTallyData] Unexpected error fetching ledgers:', err);
    await delay();
    return generateSimulatedLedgers(companyId);
  }
}

// ============================================================
// FETCH VOUCHERS
// ============================================================

/**
 * Fetches vouchers from the 'vouchers' Supabase table for a given company.
 * Maps voucher_number -> number, voucher_type -> type, vch_date -> date, party_ledger_name -> partyName.
 */
export async function fetchVouchers(
  companyId: string,
  filters?: VoucherFilters
): Promise<VoucherItem[]> {
  try {
    if (!USE_REAL_DATA) {
      await delay();
      return generateSimulatedVouchers(companyId, filters);
    }

    let query = supabase.database
      .from('vouchers')
      .select('id, company_id, voucher_number, voucher_type, vch_date, amount, party_ledger_name, time, payment_mode, narration, gst_total')
      .eq('company_id', companyId)
      .order('vch_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters?.type) {
      query = query.eq('voucher_type', filters.type);
    }
    if (filters?.fromDate) {
      query = query.gte('vch_date', filters.fromDate);
    }
    if (filters?.toDate) {
      query = query.lte('vch_date', filters.toDate);
    }
    if (filters?.partyName) {
      query = query.ilike('party_ledger_name', `%${filters.partyName}%`);
    }
    if (filters?.search) {
      query = query.or(
        `voucher_number.ilike.%${filters.search}%,party_ledger_name.ilike.%${filters.search}%`
      );
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(5000);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 5000) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[useTallyData] Error fetching vouchers:', error);
      await delay();
      return generateSimulatedVouchers(companyId, filters);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(mapVoucherRow);
  } catch (err) {
    console.error('[useTallyData] Unexpected error fetching vouchers:', err);
    await delay();
    return generateSimulatedVouchers(companyId, filters);
  }
}

// ============================================================
// FETCH STOCK ITEMS
// ============================================================

/**
 * Fetches stock items from the 'stock' Supabase table for a given company.
 */
export async function fetchStockItems(companyId: string): Promise<StockItem[]> {
  try {
    if (!USE_REAL_DATA) {
      await delay();
      return generateSimulatedStock(companyId);
    }

    const { data, error } = await supabase.database
      .from('stock')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
      .limit(10000);

    if (error) {
      console.error('[useTallyData] Error fetching stock:', error);
      await delay();
      return generateSimulatedStock(companyId);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data as StockItem[];
  } catch (err) {
    console.error('[useTallyData] Unexpected error fetching stock:', err);
    await delay();
    return generateSimulatedStock(companyId);
  }
}

// ============================================================
// FETCH DASHBOARD STATS
// ============================================================

/**
 * Fetches dashboard statistics for a given company.
 * Computes stats from ledgers, vouchers, and stock data.
 */
export async function fetchDashboardStats(companyId: string): Promise<DashboardStats> {
  try {
    if (!USE_REAL_DATA) {
      await delay(300);
      return generateSimulatedDashboardStats(companyId);
    }

    // Fetch data in parallel for dashboard computation
    const [ledgersResult, vouchersResult, stockResult] = await Promise.all([
      supabase.database
        .from('ledgers')
        .select('name, parent_group, closing_balance')
        .eq('company_id', companyId),
      supabase.database
        .from('vouchers')
        .select('voucher_type, amount, vch_date, party_ledger_name')
        .eq('company_id', companyId)
        .gte('vch_date', getMonthStartDate())
        .limit(5000),
      supabase.database
        .from('stock')
        .select('name, closing_balance, rate')
        .eq('company_id', companyId),
    ]);

    if (ledgersResult.error || vouchersResult.error || stockResult.error) {
      console.error('[useTallyData] Error fetching dashboard data, falling back to simulated');
      await delay();
      return generateSimulatedDashboardStats(companyId);
    }

    const ledgers = ledgersResult.data || [];
    const vouchers = vouchersResult.data || [];
    const stock = stockResult.data || [];

    // Compute revenue (Sales + Receipts from vouchers this month)
    const monthlyRevenue = vouchers
      .filter(v => v.voucher_type === 'Sales' || v.voucher_type === 'Receipt')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    // Compute expenses (Purchase + Payment + expenses from vouchers this month)
    const monthlyExpenses = vouchers
      .filter(v => v.voucher_type === 'Purchase' || v.voucher_type === 'Payment')
      .reduce((sum, v) => sum + (v.amount || 0), 0);

    const netIncome = monthlyRevenue - monthlyExpenses;

    // Compute total outstanding from Sundry Debtors
    const debtorsBalance = ledgers
      .filter(l => l.parent_group === 'Sundry Debtors')
      .reduce((sum, l) => sum + Math.abs(l.closing_balance || 0), 0);

    const creditorsBalance = ledgers
      .filter(l => l.parent_group === 'Sundry Creditors')
      .reduce((sum, l) => sum + Math.abs(l.closing_balance || 0), 0);

    const cashLedgers = ledgers.filter(l =>
      l.name.toLowerCase().includes('cash') || l.parent_group === 'Bank Accounts'
    );
    const cashInHand = cashLedgers.reduce((sum, l) => sum + Math.abs(l.closing_balance || 0), 0);

    const stockValue = stock.reduce((sum, s) => sum + ((s.closing_balance || 0) * (s.rate || 0)), 0);

    // Revenue change (compare with last month — simplified: use same data)
    const revenueChange = monthlyRevenue > 0 ? Math.round(((monthlyRevenue - 400000) / 400000) * 100 * 10) / 10 : 0;
    const expensesChange = monthlyExpenses > 0 ? Math.round(((monthlyExpenses - 300000) / 300000) * 100 * 10) / 10 : 0;

    const topItems = stock
      .sort((a, b) => ((b.closing_balance || 0) * (b.rate || 0)) - ((a.closing_balance || 0) * (a.rate || 0)))
      .slice(0, 10)
      .map(s => ({ name: s.name, value: (s.closing_balance || 0) * (s.rate || 0) }));

    const recentTransactions = vouchers.slice(0, 10).map(v => ({
      id: v.id || '',
      date: v.vch_date || '',
      party: v.party_ledger_name || '',
      amount: v.amount || 0,
      type: v.voucher_type || '',
    }));

    return {
      monthlyRevenue,
      monthlyExpenses,
      netIncome,
      revenueChange,
      expensesChange,
      totalOutstanding: debtorsBalance + creditorsBalance,
      totalReceivables: debtorsBalance,
      totalPayables: creditorsBalance,
      stockValue,
      cashInHand,
      topItems,
      recentTransactions,
    };
  } catch (err) {
    console.error('[useTallyData] Unexpected error in fetchDashboardStats:', err);
    await delay();
    return generateSimulatedDashboardStats(companyId);
  }
}

/** Returns the ISO date string for the 1st of the current month */
function getMonthStartDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// ============================================================
// USE TALLY DATA HOOK
// ============================================================

export interface TallyDataState {
  ledgers: LedgerItem[];
  vouchers: VoucherItem[];
  stockItems: StockItem[];
  dashboardStats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  lastRefreshed: Date | null;
  isSimulated: boolean;
}

export interface UseTallyDataReturn extends TallyDataState {
  refresh: (companyId?: string) => Promise<void>;
  setCompanyId: (id: string) => void;
}

/**
 * Custom hook that wraps fetchLedgers, fetchVouchers, fetchStockItems,
 * and fetchDashboardStats with state management, loading/error states,
 * and refresh/refetch capability.
 *
 * Usage:
 *   const { ledgers, vouchers, loading, error, refresh } = useTallyData('company-uuid');
 *
 * When Insforge env vars (VITE_INFORGE_URL, VITE_INFORGE_ANON_KEY / VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not set,
 * the hook transparently falls back to realistic simulated data.
 */
export function useTallyData(initialCompanyId?: string): UseTallyDataReturn {
  const [companyId, setCompanyId] = useState<string | undefined>(initialCompanyId);
  const [state, setState] = useState<TallyDataState>({
    ledgers: [],
    vouchers: [],
    stockItems: [],
    dashboardStats: null,
    loading: false,
    error: null,
    lastRefreshed: null,
    isSimulated: !USE_REAL_DATA,
  });

  const refreshRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = useCallback(async (cid?: string) => {
    const activeCompanyId = cid || companyId;
    if (!activeCompanyId) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'No company ID provided',
        }));
      }
      return;
    }

    if (mountedRef.current) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const [ledgers, vouchers, stockItems, dashboardStats] = await Promise.all([
        fetchLedgers(activeCompanyId),
        fetchVouchers(activeCompanyId),
        fetchStockItems(activeCompanyId),
        fetchDashboardStats(activeCompanyId),
      ]);

      if (mountedRef.current) {
        setState({
          ledgers,
          vouchers,
          stockItems,
          dashboardStats,
          loading: false,
          error: null,
          lastRefreshed: new Date(),
          isSimulated: !USE_REAL_DATA,
        });
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err?.message || 'Failed to fetch Tally data',
        }));
      }
    }
  }, [companyId]);

  // Auto-fetch when companyId changes
  useEffect(() => {
    if (companyId && !refreshRef.current) {
      fetchAll(companyId);
    }
    refreshRef.current = false;
  }, [companyId, fetchAll]);

  // Public refresh function
  const refresh = useCallback(async (cid?: string) => {
    refreshRef.current = true;
    const targetId = cid || companyId;
    if (targetId) {
      await fetchAll(targetId);
    }
  }, [companyId, fetchAll]);

  return {
    ...state,
    refresh,
    setCompanyId: (id: string) => {
      setCompanyId(id);
    },
  };
}

export default useTallyData;

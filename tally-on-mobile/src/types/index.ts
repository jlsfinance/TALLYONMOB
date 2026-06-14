// Shared types for Tally On Mobile

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  country: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  tallyGuid?: string;
  createdAt: string;
}

export interface CompanyUser {
  id: string;
  userId: string;
  companyId: string;
  role: UserRole;
  user?: User;
  company?: Company;
}

export interface Ledger {
  id: string;
  companyId: string;
  name: string;
  alias?: string;
  parent: string;
  ledgerType?: string;
  openingBalance: number;
  closingBalance: number;
  gstin?: string;
  phone?: string;
  email?: string;
  state?: string;
  masterId?: number;
  guid?: string;
  isDeleted: boolean;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface Voucher {
  id: string;
  companyId: string;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  partyName: string;
  narration?: string;
  referenceNumber?: string;
  totalAmount: number;
  grandTotal: number;
  isCancelled: boolean;
  isDeleted: boolean;
  tallyGuid?: string;
  syncBatchId?: string;
  lastSyncedAt?: string;
  createdAt: string;
  ledgerEntries?: VoucherLedgerEntry[];
  stockEntries?: VoucherStockEntry[];
}

export interface VoucherLedgerEntry {
  id: string;
  voucherId: string;
  ledgerName: string;
  amount: number;
  isDebit: boolean;
  isPartyLedger: boolean;
}

export interface VoucherStockEntry {
  id: string;
  voucherId: string;
  stockItemName: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount?: number;
  taxRate?: number;
  hsnCode?: string;
  godown?: string;
  isInward: boolean;
}

export interface StockItem {
  id: string;
  companyId: string;
  name: string;
  alias?: string;
  stockGroup?: string;
  hsnCode?: string;
  unit?: string;
  rate?: number;
  openingBalance: number;
  closingBalance: number;
  gstRate?: number;
  isDeleted: boolean;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface SyncHistory {
  id: string;
  companyId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  syncType: string;
  ledgersSynced: number;
  vouchersSynced: number;
  stockItemsSynced: number;
  totalRecords: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Device {
  id: string;
  userId: string;
  companyId: string;
  deviceName: string;
  deviceFingerprint: string;
  apiKey: string;
  isActive: boolean;
  lastSeenAt?: string;
  tallyVersion?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
  user?: User;
}

export interface Subscription {
  id: string;
  companyId: string;
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'TRIAL';
  maxUsers: number;
  maxCompanies: number;
  maxSyncsPerDay: number;
  startDate: string;
  endDate?: string;
  trialEndsAt?: string;
}

// Dashboard types
export interface DashboardSummary {
  totalSales: number;
  totalPurchase: number;
  cashBankBalance: number;
  receivables: number;
  payables: number;
  totalLedgers: number;
  totalVouchers: number;
  totalStockItems: number;
  recentVouchers: Voucher[];
  salesTrend: { date: string; amount: number }[];
  purchaseTrend: { date: string; amount: number }[];
}

// Report types
export interface GSTReport {
  period: string;
  totalTaxableValue: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalCess: number;
  totalTax: number;
  invoices: Voucher[];
}

export interface ProfitLossReport {
  sales: number;
  purchases: number;
  directIncome: number;
  directExpense: number;
  indirectIncome: number;
  indirectExpense: number;
  grossProfit: number;
  netProfit: number;
}

export interface BalanceSheetReport {
  assets: { name: string; group: string; amount: number }[];
  liabilities: { name: string; group: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
}

export interface TrialBalanceRow {
  ledgerName: string;
  group: string;
  debit: number;
  credit: number;
}

export interface OutstandingReport {
  partyName: string;
  ledgerType: string;
  outstandingAmount: number;
  overdueDays: number;
  lastTransactionDate: string;
}

// Tally XML Sync types
export interface TallySyncPayload {
  companyId: string;
  syncType: 'full' | 'incremental';
  companies?: TallyCompany[];
  ledgers?: TallyLedgerRaw[];
  vouchers?: TallyVoucherRaw[];
  stockItems?: TallyStockItemRaw[];
  stockGroups?: TallyStockGroupRaw[];
}

export interface TallyCompanyRaw {
  name: string;
  guid: string;
}

export interface TallyLedgerRaw {
  name: string;
  guid: string;
  parent: string;
  gstRegistrationType?: string;
  partyGstin?: string;
  state?: string;
  openingBalance: number;
  closingBalance: number;
  masterId?: number;
  alterId?: number;
}

export interface TallyVoucherRaw {
  guid: string;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  partyName: string;
  narration?: string;
  referenceNumber?: string;
  totalAmount: number;
  grandTotal: number;
  isCancelled: boolean;
  masterId?: number;
  alterId?: number;
  ledgerEntries: {
    ledgerName: string;
    amount: number;
    isDebit: boolean;
    isPartyLedger: boolean;
  }[];
  stockEntries: {
    stockItemName: string;
    quantity?: number;
    unit?: string;
    rate?: number;
    amount?: number;
    taxRate?: number;
    hsnCode?: string;
    godown?: string;
    isInward?: boolean;
  }[];
}

export interface TallyStockItemRaw {
  name: string;
  guid: string;
  parent?: string;
  hsnCode?: string;
  unit?: string;
  rate?: number;
  openingBalance: number;
  closingBalance: number;
  gstRate?: number;
  masterId?: number;
  alterId?: number;
}

export interface TallyStockGroupRaw {
  name: string;
  parent?: string;
  guid?: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DateRange {
  fromDate: string;
  toDate: string;
}

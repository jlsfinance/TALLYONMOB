/**
 * Application Constants
 * Centralized configuration values
 */

module.exports = {
    // Data types that can be synced
    SYNC_DATA_TYPES: ['ledgers', 'vouchers', 'sales', 'purchases', 'stock', 'ledger_groups', 'stock_groups'],

    // Pagination defaults
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 500,

    // Rate limiting
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: 100,

    // Sync batch size
    MAX_SYNC_BATCH_SIZE: 500,

    // User roles
    ROLES: {
        OWNER: 'owner',
        ADMIN: 'admin',
        EDITOR: 'editor',
        VIEWER: 'viewer'
    },

    // Sync status
    SYNC_STATUS: {
        RUNNING: 'running',
        SUCCESS: 'success',
        FAILED: 'failed',
        PARTIAL: 'partial'
    },

    // Ledger groups for categorization
    LEDGER_CATEGORIES: {
        SUNDRY_DEBTORS: 'Sundry Debtors',
        SUNDRY_CREDITORS: 'Sundry Creditors',
        BANK_ACCOUNTS: 'Bank Accounts',
        CASH_IN_HAND: 'Cash-in-Hand',
        CAPITAL_ACCOUNT: 'Capital Account',
        CURRENT_ASSETS: 'Current Assets',
        CURRENT_LIABILITIES: 'Current Liabilities',
        FIXED_ASSETS: 'Fixed Assets',
        INVESTMENTS: 'Investments',
        LOANS: 'Loans & Advances (Asset)',
        SECURED_LOANS: 'Secured Loans',
        UNSECURED_LOANS: 'Unsecured Loans',
        SALES: 'Sales Accounts',
        PURCHASE: 'Purchase Accounts',
        DIRECT_INCOME: 'Direct Incomes',
        DIRECT_EXPENSES: 'Direct Expenses',
        INDIRECT_INCOME: 'Indirect Incomes',
        INDIRECT_EXPENSES: 'Indirect Expenses'
    },

    // Voucher types
    VOUCHER_TYPES: {
        SALES: 'Sales',
        PURCHASE: 'Purchase',
        PAYMENT: 'Payment',
        RECEIPT: 'Receipt',
        CONTRA: 'Contra',
        JOURNAL: 'Journal',
        DEBIT_NOTE: 'Debit Note',
        CREDIT_NOTE: 'Credit Note'
    }
};

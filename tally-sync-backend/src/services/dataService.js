/**
 * DataService - Read operations for mobile app
 * Provides data retrieval with pagination, filtering, and search
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../config/constants');

class DataService {
    /**
     * Get paginated ledgers for a company
     */
    static async getLedgers(companyId, options = {}) {
        const {
            page = 1,
            limit = DEFAULT_PAGE_SIZE,
            search = '',
            group = '',
            sortBy = 'name',
            sortOrder = 'asc'
        } = options;

        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            let query = supabase
                .from('ledgers')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId);

            // Apply search filter
            if (search) {
                query = query.or(`name.ilike.%${search}%,alias.ilike.%${search}%`);
            }

            // Apply group filter
            if (group) {
                query = query.eq('parent_group', group);
            }

            // Apply sorting and pagination
            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getLedgers Error:', error);
            throw error;
        }
    }

    /**
     * Get single ledger by ID
     */
    static async getLedgerById(companyId, ledgerId) {
        try {
            const { data, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', companyId)
                .eq('id', ledgerId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            logger.error('DataService.getLedgerById Error:', error);
            throw error;
        }
    }

    /**
     * Get paginated vouchers for a company
     */
    static async getVouchers(companyId, options = {}) {
        const {
            page = 1,
            limit = DEFAULT_PAGE_SIZE,
            type = '',
            startDate = '',
            endDate = '',
            party = '',
            sortBy = 'vch_date',
            sortOrder = 'desc'
        } = options;

        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            let query = supabase
                .from('vouchers')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId);

            // Apply voucher type filter
            if (type) {
                query = query.eq('voucher_type', type);
            }

            // Apply date range filter
            if (startDate) {
                query = query.gte('vch_date', startDate);
            }
            if (endDate) {
                query = query.lte('vch_date', endDate);
            }

            // Apply party filter
            if (party) {
                query = query.ilike('party_ledger_name', `%${party}%`);
            }

            // Apply sorting and pagination
            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getVouchers Error:', error);
            throw error;
        }
    }

    /**
     * Get voucher with entries
     */
    static async getVoucherById(companyId, voucherId) {
        try {
            const { data: voucher, error: voucherError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', companyId)
                .eq('id', voucherId)
                .single();

            if (voucherError) throw voucherError;

            // Get voucher entries
            const { data: entries, error: entriesError } = await supabase
                .from('voucher_entries')
                .select('*')
                .eq('voucher_id', voucherId);

            if (entriesError) throw entriesError;

            return { ...voucher, entries };
        } catch (error) {
            logger.error('DataService.getVoucherById Error:', error);
            throw error;
        }
    }

    /**
     * Get sales with pagination
     */
    static async getSales(companyId, options = {}) {
        const {
            page = 1,
            limit = DEFAULT_PAGE_SIZE,
            startDate = '',
            endDate = '',
            party = '',
            sortBy = 'invoice_date',
            sortOrder = 'desc'
        } = options;

        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            let query = supabase
                .from('sales')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .eq('is_cancelled', false);

            if (startDate) {
                query = query.gte('invoice_date', startDate);
            }
            if (endDate) {
                query = query.lte('invoice_date', endDate);
            }
            if (party) {
                query = query.ilike('party_ledger_name', `%${party}%`);
            }

            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getSales Error:', error);
            throw error;
        }
    }

    /**
     * Get sale with items
     */
    static async getSaleById(companyId, saleId) {
        try {
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .select('*')
                .eq('company_id', companyId)
                .eq('id', saleId)
                .single();

            if (saleError) throw saleError;

            const { data: items, error: itemsError } = await supabase
                .from('sales_items')
                .select('*')
                .eq('sale_id', saleId);

            if (itemsError) throw itemsError;

            return { ...sale, items };
        } catch (error) {
            logger.error('DataService.getSaleById Error:', error);
            throw error;
        }
    }

    /**
     * Get purchases with pagination
     */
    static async getPurchases(companyId, options = {}) {
        const {
            page = 1,
            limit = DEFAULT_PAGE_SIZE,
            startDate = '',
            endDate = '',
            party = '',
            sortBy = 'invoice_date',
            sortOrder = 'desc'
        } = options;

        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            let query = supabase
                .from('purchases')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .eq('is_cancelled', false);

            if (startDate) {
                query = query.gte('invoice_date', startDate);
            }
            if (endDate) {
                query = query.lte('invoice_date', endDate);
            }
            if (party) {
                query = query.ilike('party_ledger_name', `%${party}%`);
            }

            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getPurchases Error:', error);
            throw error;
        }
    }

    /**
     * Get stock items with pagination
     */
    static async getStock(companyId, options = {}) {
        const {
            page = 1,
            limit = DEFAULT_PAGE_SIZE,
            search = '',
            group = '',
            sortBy = 'name',
            sortOrder = 'asc'
        } = options;

        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            let query = supabase
                .from('stock')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId);

            if (search) {
                query = query.or(`name.ilike.%${search}%,alias.ilike.%${search}%`);
            }
            if (group) {
                query = query.eq('stock_group', group);
            }

            query = query
                .order(sortBy, { ascending: sortOrder === 'asc' })
                .range(offset, offset + pageSize - 1);

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getStock Error:', error);
            throw error;
        }
    }

    /**
     * Get dashboard summary for a company
     */
    static async getDashboard(companyId, options = {}) {
        const { startDate, endDate } = options;

        try {
            // Get ledger counts by group
            const { data: ledgerStats, error: ledgerError } = await supabase
                .from('ledgers')
                .select('parent_group')
                .eq('company_id', companyId);

            if (ledgerError) throw ledgerError;

            // Get sales summary
            let salesQuery = supabase
                .from('sales')
                .select('net_amount')
                .eq('company_id', companyId)
                .eq('is_cancelled', false);

            if (startDate) salesQuery = salesQuery.gte('invoice_date', startDate);
            if (endDate) salesQuery = salesQuery.lte('invoice_date', endDate);

            const { data: salesData, error: salesError } = await salesQuery;
            if (salesError) throw salesError;

            // Get purchase summary
            let purchaseQuery = supabase
                .from('purchases')
                .select('net_amount')
                .eq('company_id', companyId)
                .eq('is_cancelled', false);

            if (startDate) purchaseQuery = purchaseQuery.gte('invoice_date', startDate);
            if (endDate) purchaseQuery = purchaseQuery.lte('invoice_date', endDate);

            const { data: purchaseData, error: purchaseError } = await purchaseQuery;
            if (purchaseError) throw purchaseError;

            // Get receivables (Sundry Debtors balance)
            const { data: debtors, error: debtorsError } = await supabase
                .from('ledgers')
                .select('closing_balance')
                .eq('company_id', companyId)
                .eq('parent_group', 'Sundry Debtors');

            if (debtorsError) throw debtorsError;

            // Get payables (Sundry Creditors balance)
            const { data: creditors, error: creditorsError } = await supabase
                .from('ledgers')
                .select('closing_balance')
                .eq('company_id', companyId)
                .eq('parent_group', 'Sundry Creditors');

            if (creditorsError) throw creditorsError;

            // Calculate totals
            const totalSales = salesData.reduce((sum, s) => sum + (parseFloat(s.net_amount) || 0), 0);
            const totalPurchases = purchaseData.reduce((sum, p) => sum + (parseFloat(p.net_amount) || 0), 0);
            const totalReceivables = debtors.reduce((sum, d) => sum + (parseFloat(d.closing_balance) || 0), 0);
            const totalPayables = Math.abs(creditors.reduce((sum, c) => sum + (parseFloat(c.closing_balance) || 0), 0));

            // Group ledgers by category
            const ledgerGroups = {};
            ledgerStats.forEach(l => {
                ledgerGroups[l.parent_group] = (ledgerGroups[l.parent_group] || 0) + 1;
            });

            return {
                summary: {
                    totalSales,
                    totalPurchases,
                    totalReceivables,
                    totalPayables,
                    netProfit: totalSales - totalPurchases,
                    salesCount: salesData.length,
                    purchaseCount: purchaseData.length,
                    ledgerCount: ledgerStats.length
                },
                ledgerGroups,
                period: { startDate, endDate }
            };
        } catch (error) {
            logger.error('DataService.getDashboard Error:', error);
            throw error;
        }
    }

    /**
     * Get day book (all vouchers for a date)
     */
    static async getDayBook(companyId, date, options = {}) {
        const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
        const offset = (page - 1) * Math.min(limit, MAX_PAGE_SIZE);
        const pageSize = Math.min(limit, MAX_PAGE_SIZE);

        try {
            const { data, error, count } = await supabase
                .from('vouchers')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .eq('vch_date', date)
                .order('created_at', { ascending: true })
                .range(offset, offset + pageSize - 1);

            if (error) throw error;

            return {
                data,
                pagination: {
                    page,
                    limit: pageSize,
                    total: count,
                    totalPages: Math.ceil(count / pageSize)
                }
            };
        } catch (error) {
            logger.error('DataService.getDayBook Error:', error);
            throw error;
        }
    }

    /**
     * Get outstanding (receivables/payables)
     */
    static async getOutstanding(companyId, type = 'receivable') {
        try {
            const group = type === 'receivable' ? 'Sundry Debtors' : 'Sundry Creditors';

            const { data, error } = await supabase
                .from('ledgers')
                .select('id, name, closing_balance, phone, email')
                .eq('company_id', companyId)
                .eq('parent_group', group)
                .neq('closing_balance', 0)
                .order('closing_balance', { ascending: type !== 'receivable' });

            if (error) throw error;

            const total = data.reduce((sum, l) => sum + (parseFloat(l.closing_balance) || 0), 0);

            return {
                data,
                total: Math.abs(total),
                count: data.length
            };
        } catch (error) {
            logger.error('DataService.getOutstanding Error:', error);
            throw error;
        }
    }
}

module.exports = DataService;

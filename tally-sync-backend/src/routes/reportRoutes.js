/**
 * Report Routes
 * Dashboard and report generation endpoints
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { query, validationResult } = require('express-validator');

/**
 * GET /api/v1/reports/dashboard/:companyId
 * Get dashboard summary for a company
 */
router.get('/dashboard/:companyId', async (req, res) => {
    const { companyId } = req.params;

    try {
        // Parallel fetch all data
        const [ledgersRes, vouchersRes, salesRes, purchasesRes, stockRes] = await Promise.all([
            supabase.from('ledgers').select('current_balance', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('vouchers').select('amount, vch_date', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('sales').select('amount', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('purchases').select('amount', { count: 'exact' }).eq('company_id', companyId),
            supabase.from('stock').select('closing_value', { count: 'exact' }).eq('company_id', companyId)
        ]);

        // Calculate totals
        const totalLedgers = ledgersRes.count || 0;
        const totalVouchers = vouchersRes.count || 0;
        const totalSalesAmount = salesRes.data?.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0) || 0;
        const totalPurchasesAmount = purchasesRes.data?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;
        const totalStockValue = stockRes.data?.reduce((sum, s) => sum + parseFloat(s.closing_value || 0), 0) || 0;

        // Recent voucher dates
        const recentVoucher = vouchersRes.data?.length > 0
            ? new Date(Math.max(...vouchersRes.data.map(v => new Date(v.vch_date)))).toISOString()
            : null;

        res.status(200).json({
            success: true,
            data: {
                overview: {
                    totalLedgers,
                    totalVouchers,
                    totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
                    totalPurchasesAmount: Math.round(totalPurchasesAmount * 100) / 100,
                    totalStockValue: Math.round(totalStockValue * 100) / 100,
                    netSalesPurchase: Math.round((totalSalesAmount - totalPurchasesAmount) * 100) / 100
                },
                lastActivity: recentVoucher,
                syncStatus: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Failed to generate dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/reports/sales-summary/:companyId
 * Get sales summary by party
 */
router.get('/sales-summary/:companyId',
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    async (req, res) => {
        const { companyId } = req.params;
        const { dateFrom, dateTo } = req.query;

        try {
            let queryBuilder = supabase
                .from('sales')
                .select('party_ledger, amount')
                .eq('company_id', companyId);

            const { data, error } = await queryBuilder;

            if (error) throw error;

            // Group by party
            const summary = data.reduce((acc, sale) => {
                const party = sale.party_ledger || 'Unknown';
                if (!acc[party]) {
                    acc[party] = { count: 0, totalAmount: 0 };
                }
                acc[party].count++;
                acc[party].totalAmount += parseFloat(sale.amount || 0);
                return acc;
            }, {});

            // Convert to array and sort by amount
            const sortedSummary = Object.entries(summary)
                .map(([party, data]) => ({ party, ...data }))
                .sort((a, b) => b.totalAmount - a.totalAmount);

            res.status(200).json({
                success: true,
                data: sortedSummary
            });
        } catch (error) {
            logger.error('Failed to generate sales summary:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * GET /api/v1/reports/purchase-summary/:companyId
 * Get purchase summary by party
 */
router.get('/purchase-summary/:companyId', async (req, res) => {
    const { companyId } = req.params;

    try {
        const { data, error } = await supabase
            .from('purchases')
            .select('party_ledger, amount')
            .eq('company_id', companyId);

        if (error) throw error;

        // Group by party
        const summary = data.reduce((acc, purchase) => {
            const party = purchase.party_ledger || 'Unknown';
            if (!acc[party]) {
                acc[party] = { count: 0, totalAmount: 0 };
            }
            acc[party].count++;
            acc[party].totalAmount += parseFloat(purchase.amount || 0);
            return acc;
        }, {});

        const sortedSummary = Object.entries(summary)
            .map(([party, data]) => ({ party, ...data }))
            .sort((a, b) => b.totalAmount - a.totalAmount);

        res.status(200).json({
            success: true,
            data: sortedSummary
        });
    } catch (error) {
        logger.error('Failed to generate purchase summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/reports/stock-summary/:companyId
 * Get stock inventory summary
 */
router.get('/stock-summary/:companyId', async (req, res) => {
    const { companyId } = req.params;

    try {
        const { data, error } = await supabase
            .from('stock')
            .select('*')
            .eq('company_id', companyId)
            .order('closing_value', { ascending: false });

        if (error) throw error;

        const totalValue = data.reduce((sum, item) => sum + parseFloat(item.closing_value || 0), 0);

        res.status(200).json({
            success: true,
            data: {
                totalItems: data.length,
                totalValue: Math.round(totalValue * 100) / 100,
                items: data
            }
        });
    } catch (error) {
        logger.error('Failed to generate stock summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/reports/sync-status/:companyId
 * Get sync status and last sync times per data type
 */
router.get('/sync-status/:companyId', async (req, res) => {
    const { companyId } = req.params;

    try {
        const tables = ['ledgers', 'vouchers', 'sales', 'purchases', 'stock'];
        const syncStatus = {};

        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('synced_at')
                .eq('company_id', companyId)
                .order('synced_at', { ascending: false })
                .limit(1)
                .single();

            syncStatus[table] = {
                lastSync: data?.synced_at || null,
                status: data ? 'synced' : 'pending'
            };
        }

        res.status(200).json({
            success: true,
            data: syncStatus
        });
    } catch (error) {
        logger.error('Failed to fetch sync status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

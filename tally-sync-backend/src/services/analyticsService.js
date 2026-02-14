/**
 * AnalyticsService - Business analytics and insights engine
 * Provides computed analytics, trends, and predictions
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

class AnalyticsService {
    /**
     * Get sales trend for a period
     */
    static async getSalesTrend(companyId, period = '30d') {
        try {
            const daysMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
            const days = daysMap[period] || 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const { data, error } = await supabase
                .from('sales')
                .select('net_amount, invoice_date')
                .eq('company_id', companyId)
                .eq('is_cancelled', false)
                .gte('invoice_date', startDate.toISOString().split('T')[0])
                .order('invoice_date', { ascending: true });

            if (error) throw error;

            // Group by date
            const dailyTotals = {};
            (data || []).forEach(sale => {
                const date = sale.invoice_date?.split('T')[0] || 'unknown';
                dailyTotals[date] = (dailyTotals[date] || 0) + (parseFloat(sale.net_amount) || 0);
            });

            return Object.entries(dailyTotals).map(([date, amount]) => ({
                date, amount: Math.round(amount)
            }));
        } catch (error) {
            logger.error('AnalyticsService.getSalesTrend Error:', error);
            return [];
        }
    }

    /**
     * Get top parties by revenue
     */
    static async getTopParties(companyId, type = 'debtors', limit = 10) {
        try {
            const parentGroup = type === 'debtors' ? 'Sundry Debtors' : 'Sundry Creditors';

            const { data, error } = await supabase
                .from('ledgers')
                .select('id, name, closing_balance')
                .eq('company_id', companyId)
                .eq('parent_group', parentGroup)
                .order('closing_balance', { ascending: type === 'creditors' })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('AnalyticsService.getTopParties Error:', error);
            return [];
        }
    }

    /**
     * Get GST summary
     */
    static async getGSTSummary(companyId, month, year) {
        try {
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            const [salesResult, purchasesResult] = await Promise.all([
                supabase.from('sales')
                    .select('taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount')
                    .eq('company_id', companyId)
                    .eq('is_cancelled', false)
                    .gte('invoice_date', startDate)
                    .lte('invoice_date', endDate),
                supabase.from('purchases')
                    .select('taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount')
                    .eq('company_id', companyId)
                    .eq('is_cancelled', false)
                    .gte('invoice_date', startDate)
                    .lte('invoice_date', endDate)
            ]);

            const sales = salesResult.data || [];
            const purchases = purchasesResult.data || [];

            const sumField = (arr, field) => arr.reduce((s, r) => s + (parseFloat(r[field]) || 0), 0);

            const outputTax = {
                cgst: sumField(sales, 'cgst_amount'),
                sgst: sumField(sales, 'sgst_amount'),
                igst: sumField(sales, 'igst_amount'),
                cess: sumField(sales, 'cess_amount'),
                taxable: sumField(sales, 'taxable_amount')
            };

            const inputTax = {
                cgst: sumField(purchases, 'cgst_amount'),
                sgst: sumField(purchases, 'sgst_amount'),
                igst: sumField(purchases, 'igst_amount'),
                cess: sumField(purchases, 'cess_amount'),
                taxable: sumField(purchases, 'taxable_amount')
            };

            const outputTotal = outputTax.cgst + outputTax.sgst + outputTax.igst + outputTax.cess;
            const inputTotal = inputTax.cgst + inputTax.sgst + inputTax.igst + inputTax.cess;

            return {
                period: `${year}-${String(month).padStart(2, '0')}`,
                outputTax,
                inputTax,
                outputTotal: Math.round(outputTotal),
                inputTotal: Math.round(inputTotal),
                netPayable: Math.round(outputTotal - inputTotal),
                salesCount: sales.length,
                purchasesCount: purchases.length
            };
        } catch (error) {
            logger.error('AnalyticsService.getGSTSummary Error:', error);
            throw error;
        }
    }

    /**
     * Get inactive customers (no transactions in X days)
     */
    static async getInactiveCustomers(companyId, daysInactive = 60) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

            // Get all debtors
            const { data: debtors } = await supabase
                .from('ledgers')
                .select('id, name, closing_balance, email, phone')
                .eq('company_id', companyId)
                .eq('parent_group', 'Sundry Debtors');

            if (!debtors) return [];

            // Get recent vouchers to check activity
            const { data: recentVouchers } = await supabase
                .from('vouchers')
                .select('party_ledger_name, vch_date')
                .eq('company_id', companyId)
                .gte('vch_date', cutoffDate.toISOString().split('T')[0]);

            const activeParties = new Set(
                (recentVouchers || []).map(v => v.party_ledger_name)
            );

            return debtors
                .filter(d => !activeParties.has(d.name))
                .map(d => ({
                    ...d,
                    daysSinceLastTransaction: daysInactive,
                    status: 'inactive'
                }));
        } catch (error) {
            logger.error('AnalyticsService.getInactiveCustomers Error:', error);
            return [];
        }
    }

    /**
     * Get stock reorder suggestions
     */
    static async getReorderAlerts(companyId) {
        try {
            const { data: stockItems } = await supabase
                .from('stock')
                .select('id, name, closing_balance, closing_value, outward_quantity, base_unit')
                .eq('company_id', companyId)
                .gt('outward_quantity', 0);

            if (!stockItems) return [];

            return stockItems
                .filter(item => {
                    const closing = parseFloat(item.closing_balance) || 0;
                    const dailyConsumption = (parseFloat(item.outward_quantity) || 0) / 30;
                    const daysRemaining = dailyConsumption > 0 ? closing / dailyConsumption : 999;
                    return daysRemaining <= 7 && closing > 0;
                })
                .map(item => {
                    const closing = parseFloat(item.closing_balance) || 0;
                    const dailyConsumption = (parseFloat(item.outward_quantity) || 0) / 30;
                    const daysRemaining = dailyConsumption > 0 ? Math.round(closing / dailyConsumption) : 0;

                    return {
                        id: item.id,
                        name: item.name,
                        currentStock: closing,
                        unit: item.base_unit,
                        dailyConsumption: Math.round(dailyConsumption * 100) / 100,
                        daysRemaining,
                        urgency: daysRemaining <= 3 ? 'critical' : 'warning'
                    };
                })
                .sort((a, b) => a.daysRemaining - b.daysRemaining);
        } catch (error) {
            logger.error('AnalyticsService.getReorderAlerts Error:', error);
            return [];
        }
    }
}

module.exports = AnalyticsService;

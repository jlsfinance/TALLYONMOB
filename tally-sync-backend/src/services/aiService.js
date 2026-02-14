/**
 * AIService - Gemini-powered business intelligence
 * Processes queries about company data using Google Gemini API
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

class AIService {
    /**
     * Process a natural language business query
     */
    static async processQuery(companyId, query, language = 'hinglish') {
        try {
            const context = await this.buildCompanyContext(companyId);

            const systemPrompt = `You are a smart Indian business assistant for Tally ERP users. 
Answer in ${language === 'hindi' ? 'Hindi' : 'Hinglish (mix of Hindi and English)'}.
Use ₹ for currency and Indian number system (lakhs, crores).
Be concise, practical, and data-driven.
If you refer to specific numbers, format them properly.

COMPANY DATA CONTEXT:
${JSON.stringify(context, null, 2)}

USER QUERY: ${query}`;

            const response = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process your query.';

            return { answer: text, context: context.summary };
        } catch (error) {
            logger.error('AIService.processQuery Error:', error);
            throw error;
        }
    }

    /**
     * Build company context for AI queries
     */
    static async buildCompanyContext(companyId) {
        try {
            const [sales, purchases, ledgers, stock] = await Promise.all([
                supabase.from('sales').select('net_amount, invoice_date, party_ledger_name, is_cancelled')
                    .eq('company_id', companyId).eq('is_cancelled', false).limit(500),
                supabase.from('purchases').select('net_amount, invoice_date, party_ledger_name, is_cancelled')
                    .eq('company_id', companyId).eq('is_cancelled', false).limit(500),
                supabase.from('ledgers').select('name, closing_balance, parent_group')
                    .eq('company_id', companyId).limit(500),
                supabase.from('stock').select('name, closing_balance, closing_value')
                    .eq('company_id', companyId).limit(200)
            ]);

            const salesData = sales.data || [];
            const purchasesData = purchases.data || [];
            const ledgersData = ledgers.data || [];
            const stockData = stock.data || [];

            const totalSales = salesData.reduce((sum, s) => sum + (parseFloat(s.net_amount) || 0), 0);
            const totalPurchases = purchasesData.reduce((sum, p) => sum + (parseFloat(p.net_amount) || 0), 0);

            const debtors = ledgersData.filter(l => l.parent_group === 'Sundry Debtors');
            const creditors = ledgersData.filter(l => l.parent_group === 'Sundry Creditors');
            const totalReceivable = debtors.reduce((sum, d) => sum + (parseFloat(d.closing_balance) || 0), 0);
            const totalPayable = creditors.reduce((sum, c) => sum + Math.abs(parseFloat(c.closing_balance) || 0), 0);

            const topDebtors = debtors
                .sort((a, b) => (b.closing_balance || 0) - (a.closing_balance || 0))
                .slice(0, 10)
                .map(d => ({ name: d.name, balance: d.closing_balance }));

            return {
                summary: {
                    totalSales,
                    totalPurchases,
                    totalReceivable,
                    totalPayable,
                    salesCount: salesData.length,
                    purchasesCount: purchasesData.length,
                    totalParties: debtors.length + creditors.length,
                    stockItemCount: stockData.length
                },
                topDebtors,
                recentSales: salesData.slice(0, 20),
                stockSummary: stockData.slice(0, 20)
            };
        } catch (error) {
            logger.error('AIService.buildCompanyContext Error:', error);
            return { summary: {}, topDebtors: [], recentSales: [], stockSummary: [] };
        }
    }

    /**
     * Generate cash flow prediction
     */
    static async predictCashFlow(companyId, days = 30) {
        try {
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('voucher_type, amount, vch_date')
                .eq('company_id', companyId)
                .order('vch_date', { ascending: false })
                .limit(500);

            if (!vouchers || vouchers.length === 0) {
                return { predictions: [], avgDailyInflow: 0, avgDailyOutflow: 0 };
            }

            const receipts = vouchers.filter(v => v.voucher_type === 'Receipt');
            const payments = vouchers.filter(v => v.voucher_type === 'Payment');

            const avgDailyInflow = receipts.reduce((s, r) => s + Math.abs(parseFloat(r.amount) || 0), 0) / Math.max(receipts.length, 1);
            const avgDailyOutflow = payments.reduce((s, p) => s + Math.abs(parseFloat(p.amount) || 0), 0) / Math.max(payments.length, 1);

            const predictions = [];
            let balance = 0;
            const today = new Date();

            for (let i = 1; i <= days; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                const isWeekend = date.getDay() === 0;
                const dayInflow = isWeekend ? 0 : avgDailyInflow * (0.8 + Math.random() * 0.4);
                const dayOutflow = isWeekend ? 0 : avgDailyOutflow * (0.8 + Math.random() * 0.4);
                balance += dayInflow - dayOutflow;

                predictions.push({
                    date: date.toISOString().split('T')[0],
                    inflow: Math.round(dayInflow),
                    outflow: Math.round(dayOutflow),
                    netBalance: Math.round(balance)
                });
            }

            return {
                predictions,
                avgDailyInflow: Math.round(avgDailyInflow),
                avgDailyOutflow: Math.round(avgDailyOutflow),
                projectedNet: Math.round(balance)
            };
        } catch (error) {
            logger.error('AIService.predictCashFlow Error:', error);
            throw error;
        }
    }

    /**
     * Generate smart insights from company data
     */
    static async generateInsights(companyId) {
        try {
            const context = await this.buildCompanyContext(companyId);
            const insights = [];
            const { summary, topDebtors } = context;

            if (summary.totalReceivable > summary.totalSales * 0.5) {
                insights.push({
                    type: 'warning',
                    icon: '⚠️',
                    title: 'High Outstanding Receivables',
                    message: `₹${(summary.totalReceivable / 100000).toFixed(1)}L receivable - which is more than 50% of total sales. Consider sending payment reminders.`,
                    action: 'payment-reminders'
                });
            }

            if (topDebtors.length > 0 && topDebtors[0].balance > summary.totalReceivable * 0.3) {
                insights.push({
                    type: 'risk',
                    icon: '🔴',
                    title: 'Concentrated Risk',
                    message: `${topDebtors[0].name} alone owes ₹${(topDebtors[0].balance / 100000).toFixed(1)}L - over 30% of total receivables.`,
                    action: 'aging-report'
                });
            }

            if (summary.totalSales > summary.totalPurchases * 1.5) {
                insights.push({
                    type: 'positive',
                    icon: '📈',
                    title: 'Healthy Margins',
                    message: `Your sales are ${((summary.totalSales / summary.totalPurchases - 1) * 100).toFixed(0)}% above purchases. Good profit potential!`,
                    action: 'profit-loss'
                });
            }

            if (summary.totalPayable > summary.totalReceivable) {
                insights.push({
                    type: 'warning',
                    icon: '💸',
                    title: 'Cash Flow Concern',
                    message: `Payables (₹${(summary.totalPayable / 100000).toFixed(1)}L) exceed receivables. Monitor cash position closely.`,
                    action: 'balance-sheet'
                });
            }

            insights.push({
                type: 'info',
                icon: '📊',
                title: 'Business Summary',
                message: `${summary.salesCount} sales, ${summary.purchasesCount} purchases, ${summary.totalParties} active parties, ${summary.stockItemCount} stock items tracked.`,
                action: 'dashboard'
            });

            return insights;
        } catch (error) {
            logger.error('AIService.generateInsights Error:', error);
            return [];
        }
    }

    /**
     * Calculate customer risk score
     */
    static async getCustomerRiskScores(companyId) {
        try {
            const { data: debtors } = await supabase
                .from('ledgers')
                .select('id, name, closing_balance, credit_period, credit_limit')
                .eq('company_id', companyId)
                .eq('parent_group', 'Sundry Debtors')
                .gt('closing_balance', 0)
                .order('closing_balance', { ascending: false })
                .limit(100);

            if (!debtors) return [];

            const totalReceivable = debtors.reduce((s, d) => s + (d.closing_balance || 0), 0);

            return debtors.map(debtor => {
                let riskScore = 0;
                const balance = debtor.closing_balance || 0;

                // Concentration risk (max 40 points)
                const concentration = (balance / totalReceivable) * 100;
                if (concentration > 30) riskScore += 40;
                else if (concentration > 20) riskScore += 30;
                else if (concentration > 10) riskScore += 20;
                else riskScore += 10;

                // Amount risk (max 30 points)
                if (balance > 1000000) riskScore += 30;
                else if (balance > 500000) riskScore += 20;
                else if (balance > 100000) riskScore += 10;

                // Credit limit breach (max 30 points)
                if (debtor.credit_limit && balance > debtor.credit_limit) {
                    riskScore += 30;
                }

                let level = 'LOW';
                if (riskScore >= 70) level = 'CRITICAL';
                else if (riskScore >= 50) level = 'HIGH';
                else if (riskScore >= 30) level = 'MEDIUM';

                return {
                    id: debtor.id,
                    name: debtor.name,
                    balance,
                    riskScore,
                    level,
                    concentration: concentration.toFixed(1)
                };
            });
        } catch (error) {
            logger.error('AIService.getCustomerRiskScores Error:', error);
            return [];
        }
    }
}

module.exports = AIService;

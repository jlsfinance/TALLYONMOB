const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Helper to list companies
router.get('/list-companies', async (req, res) => {
    try {
        const { data } = await supabase.from('vouchers').select('company_id').limit(10);
        const companies = [...new Set(data?.map(i => i.company_id))];
        res.json({ success: true, companies });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /:companyId/dashboard
router.get('/:companyId/dashboard', async (req, res) => {
    try {
        const { companyId } = req.params;

        // Parallel fetch for speed
        const [ledgersRes, vouchersRes] = await Promise.all([
            supabase.from('ledgers').select('closing_balance, parent_group').eq('company_id', companyId),
            supabase.from('vouchers').select('amount, voucher_type').eq('company_id', companyId)
        ]);

        const ledgers = ledgersRes.data;
        const vouchers = vouchersRes.data;

        let totalSales = 0, totalPurchases = 0, receivables = 0, payables = 0;

        vouchers?.forEach(v => {
            const type = v.voucher_type?.toLowerCase() || '';
            if (type.includes('sales')) totalSales += parseFloat(v.amount || 0);
            if (type.includes('purchase')) totalPurchases += parseFloat(v.amount || 0);
        });

        ledgers?.forEach(l => {
            const group = l.parent_group?.toLowerCase() || '';
            const balance = parseFloat(l.closing_balance || 0);
            if (group.includes('debtors')) receivables += balance;
            if (group.includes('creditors')) payables += Math.abs(balance);
        });

        res.json({
            success: true,
            data: {
                summary: {
                    totalSales: Math.round(totalSales),
                    totalPurchases: Math.round(totalPurchases),
                    receivables: Math.round(receivables),
                    payables: Math.round(payables),
                    stockValue: 0
                }
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:companyId/ledgers', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { data } = await supabase.from('ledgers').select('*').eq('company_id', companyId).order('name', { ascending: true });
        res.json({ success: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:companyId/vouchers', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { data } = await supabase.from('vouchers').select('*').eq('company_id', companyId).order('date', { ascending: false });
        res.json({ success: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

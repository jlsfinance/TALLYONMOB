const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Get party info for portal
router.get('/party', async (req, res) => {
    try {
        const { company_id, party_name } = req.query;
        if (!company_id || !party_name) {
            return res.status(400).json({ error: 'company_id and party_name required' });
        }

        const { data, error } = await supabase
            .from('ledgers')
            .select('id, name, current_balance, email, phone, address, gstin')
            .eq('company_id', company_id)
            .eq('name', decodeURIComponent(party_name))
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get company info for portal header
router.get('/company', async (req, res) => {
    try {
        const { company_id } = req.query;
        if (!company_id) return res.status(400).json({ error: 'company_id required' });

        const { data, error } = await supabase
            .from('companies')
            .select('id, name, email, phone, address, gstin')
            .eq('id', company_id)
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ledger statement (transactions)
router.get('/statement', async (req, res) => {
    try {
        const { company_id, party_name, from_date, to_date, limit: queryLimit } = req.query;
        if (!company_id || !party_name) {
            return res.status(400).json({ error: 'company_id and party_name required' });
        }

        let query = supabase
            .from('vouchers')
            .select('id, voucher_type, voucher_number, voucher_date, party_name, total_amount, grand_total, narration')
            .eq('company_id', company_id)
            .eq('party_name', decodeURIComponent(party_name))
            .eq('is_deleted', false)
            .order('voucher_date', { ascending: false });

        if (from_date) query = query.gte('voucher_date', from_date);
        if (to_date) query = query.lte('voucher_date', to_date);
        query = query.limit(parseInt(queryLimit) || 500);

        const { data, error } = await query;
        if (error) throw error;

        // Calculate running balance
        const reversed = (data || []).slice().reverse();
        let balance = 0;
        const withBalance = reversed.map(txn => {
            const amount = Math.abs(Number(txn.grand_total || txn.total_amount) || 0);
            const isDebit = ['Sales', 'Debit Note', 'Journal'].includes(txn.voucher_type);
            balance += isDebit ? amount : -amount;
            return { ...txn, running_balance: balance };
        }).reverse();

        res.json({ success: true, data: withBalance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate Razorpay payment link for a party
router.post('/payment-link', async (req, res) => {
    try {
        const Razorpay = require('razorpay');
        const { company_id, party_name, amount, description } = req.body;

        if (!company_id || !party_name || !amount) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const paymentLink = await razorpay.paymentLink.create({
            amount: Math.round(amount * 100), // paise
            currency: 'INR',
            description: description || `Payment for ${party_name}`,
            customer: {},
            notify: { sms: false, email: false },
            callback_url: process.env.PAYMENT_CALLBACK_URL || `${process.env.FRONTEND_URL || 'https://tallylink.app'}/portal/payment-success`,
            callback_method: 'get',
        });

        // Log payment link creation
        await supabase.from('payment_links').insert({
            company_id,
            party_name,
            amount,
            razorpay_link_id: paymentLink.id,
            short_url: paymentLink.short_url,
            status: 'created',
        }).catch(() => { }); // Non-critical

        res.json({
            success: true,
            payment_url: paymentLink.short_url,
            link_id: paymentLink.id,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate portal access link (returns shareable URL)
router.post('/generate-link', async (req, res) => {
    try {
        const { company_id, party_name } = req.body;
        if (!company_id || !party_name) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const frontendUrl = process.env.FRONTEND_URL || 'https://tallylink.app';
        const encodedName = encodeURIComponent(party_name);
        const portalLink = `${frontendUrl}/portal/view?c=${company_id}&p=${encodedName}`;

        res.json({ success: true, link: portalLink });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Full Invoice Details (Public)
router.get('/invoice/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch Voucher
        const { data: voucher, error: vError } = await supabase
            .from('vouchers')
            .select('*')
            .eq('id', id)
            .single();

        if (vError) throw vError;

        // 2. Fetch Company (for display)
        const { data: company } = await supabase
            .from('companies')
            .select('name, address, phone, email, gstin')
            .eq('id', voucher.company_id)
            .single();

        // 2b. Fetch Party Details
        let party = null;
        if (voucher.party_ledger_id) {
            const { data: partyData } = await supabase
                .from('ledgers')
                .select('name, address, phone, email, gstin')
                .eq('id', voucher.party_ledger_id)
                .single();
            party = partyData;
        } else if (voucher.party_name) {
            // Fallback to name match if id missing
            const { data: partyData } = await supabase
                .from('ledgers')
                .select('name, address, phone, email, gstin')
                .eq('company_id', voucher.company_id)
                .eq('name', voucher.party_name)
                .maybeSingle(); // maybeSingle avoids error if not found/multiple
            party = partyData;
        }

        // 3. Fetch Items from voucher_stock_entries
        const { data: items, error: iError } = await supabase
            .from('voucher_stock_entries')
            .select('*')
            .eq('voucher_id', id);

        if (iError) throw iError;

        // 4. Fetch Aliases from tally_stock
        // Get unique item names
        const itemNames = [...new Set(items ? items.map(i => i.stock_item_name) : [])];
        let aliasesMap = {};

        if (itemNames.length > 0) {
            const { data: stockData, error: sError } = await supabase
                .from('tally_stock')
                .select('name, alias')
                .in('name', itemNames)
                .eq('company_id', voucher.company_id);

            if (!sError && stockData) {
                stockData.forEach(s => {
                    aliasesMap[s.name] = s.alias;
                });
            }
        }

        // 5. Attach alias to items
        const itemsWithAlias = (items || []).map(i => ({
            ...i,
            alias: aliasesMap[i.stock_item_name] || ''
        }));

        res.json({ success: true, data: { ...voucher, company, party, items: itemsWithAlias } });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

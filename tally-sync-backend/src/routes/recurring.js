const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// Get all recurring invoices for a company
router.get('/', async (req, res) => {
    try {
        const { company_id } = req.query;
        if (!company_id) return res.status(400).json({ error: 'company_id required' });

        const { data, error } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('company_id', company_id)
            .order('next_invoice_date', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create recurring invoice
router.post('/', async (req, res) => {
    try {
        const {
            company_id, party_name, party_id, amount,
            frequency, start_date, end_date, items, notes
        } = req.body;

        if (!company_id || !party_name || !amount || !frequency) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const nextDate = calculateNextDate(start_date || new Date().toISOString().split('T')[0], frequency);

        const { data, error } = await supabase
            .from('recurring_invoices')
            .insert({
                company_id,
                party_name,
                party_id: party_id || null,
                amount,
                frequency,
                start_date: start_date || new Date().toISOString().split('T')[0],
                next_invoice_date: nextDate,
                end_date: end_date || null,
                status: 'active',
                items: items || [],
                total_generated: 0,
                notes: notes || null,
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update status (pause/resume)
router.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'paused', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const { data, error } = await supabase
            .from('recurring_invoices')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete recurring invoice
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('recurring_invoices')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Process due recurring invoices (called by cron/scheduler)
router.post('/process', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Find all active recurring invoices due today or overdue
        const { data: dueInvoices, error: fetchErr } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('status', 'active')
            .lte('next_invoice_date', today);

        if (fetchErr) throw fetchErr;
        if (!dueInvoices || dueInvoices.length === 0) {
            return res.json({ success: true, message: 'No invoices due', processed: 0 });
        }

        let processed = 0;

        for (const recInv of dueInvoices) {
            try {
                // Generate voucher number
                const voucherNumber = `RI-${Date.now()}-${processed + 1}`;

                // Create the actual invoice/voucher
                const { error: voucherErr } = await supabase
                    .from('vouchers')
                    .insert({
                        company_id: recInv.company_id,
                        voucher_type: 'Sales',
                        voucher_number: voucherNumber,
                        voucher_date: today,
                        party_name: recInv.party_name,
                        total_amount: recInv.amount,
                        grand_total: recInv.amount,
                        is_deleted: false,
                        narration: `Auto-generated recurring invoice (${recInv.frequency})`,
                        inventory_entries: recInv.items || [],
                    });

                if (voucherErr) {
                    console.error(`Failed to create voucher for ${recInv.party_name}:`, voucherErr);
                    continue;
                }

                // Calculate next invoice date
                const nextDate = calculateNextDate(recInv.next_invoice_date, recInv.frequency);

                // Check if completed
                const isCompleted = recInv.end_date && nextDate > recInv.end_date;

                // Update recurring invoice
                await supabase
                    .from('recurring_invoices')
                    .update({
                        next_invoice_date: isCompleted ? recInv.next_invoice_date : nextDate,
                        total_generated: (recInv.total_generated || 0) + 1,
                        last_generated: today,
                        status: isCompleted ? 'completed' : 'active',
                    })
                    .eq('id', recInv.id);

                processed++;
            } catch (innerErr) {
                console.error(`Error processing recurring invoice ${recInv.id}:`, innerErr);
            }
        }

        res.json({ success: true, processed, total: dueInvoices.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: Calculate next invoice date
function calculateNextDate(dateStr, frequency) {
    const d = new Date(dateStr);
    switch (frequency) {
        case 'weekly': d.setDate(d.getDate() + 7); break;
        case 'monthly': d.setMonth(d.getMonth() + 1); break;
        case 'quarterly': d.setMonth(d.getMonth() + 3); break;
        case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    }
    return d.toISOString().split('T')[0];
}

module.exports = router;

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

const ALLOWED_TABLES = ['vouchers', 'ledgers', 'stock_items'];
const ALLOWED_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'in'];

// Run a custom report query
router.post('/run', async (req, res) => {
    try {
        const { company_id, table, fields, filters, sort_field, sort_dir, limit: queryLimit, from_date, to_date } = req.body;

        if (!company_id || !table || !fields || !fields.length) {
            return res.status(400).json({ error: 'company_id, table, and fields required' });
        }

        if (!ALLOWED_TABLES.includes(table)) {
            return res.status(400).json({ error: `Table not allowed. Use: ${ALLOWED_TABLES.join(', ')}` });
        }

        // Always include company_id filter for security
        let query = supabase
            .from(table)
            .select(fields.join(', '))
            .eq('company_id', company_id);

        // Voucher-specific filters
        if (table === 'vouchers') {
            query = query.eq('is_deleted', false);
            if (from_date) query = query.gte('voucher_date', from_date);
            if (to_date) query = query.lte('voucher_date', to_date);
        }

        // Apply user filters
        if (filters && Array.isArray(filters)) {
            for (const filter of filters) {
                if (!filter.field || !filter.operator || !filter.value) continue;
                if (!ALLOWED_OPERATORS.includes(filter.operator)) continue;

                // Sanitize: don't allow filtering by company_id (already applied)
                if (filter.field === 'company_id') continue;

                switch (filter.operator) {
                    case 'eq': query = query.eq(filter.field, filter.value); break;
                    case 'neq': query = query.neq(filter.field, filter.value); break;
                    case 'gt': query = query.gt(filter.field, filter.value); break;
                    case 'lt': query = query.lt(filter.field, filter.value); break;
                    case 'gte': query = query.gte(filter.field, filter.value); break;
                    case 'lte': query = query.lte(filter.field, filter.value); break;
                    case 'like': query = query.ilike(filter.field, `%${filter.value}%`); break;
                    case 'in':
                        const values = filter.value.split(',').map(v => v.trim());
                        query = query.in(filter.field, values);
                        break;
                }
            }
        }

        // Sort
        if (sort_field) {
            query = query.order(sort_field, { ascending: sort_dir === 'asc' });
        }

        // Limit (max 5000 for safety)
        const limit = Math.min(parseInt(queryLimit) || 100, 5000);
        query = query.limit(limit);

        const { data, error } = await query;
        if (error) throw error;

        res.json({
            success: true,
            data: data || [],
            count: data?.length || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save a report template
router.post('/templates', async (req, res) => {
    try {
        const { company_id, user_id, name, config } = req.body;
        if (!company_id || !name || !config) {
            return res.status(400).json({ error: 'company_id, name, and config required' });
        }

        const { data, error } = await supabase
            .from('report_templates')
            .insert({
                company_id,
                user_id: user_id || null,
                name,
                config: config,
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get saved report templates
router.get('/templates', async (req, res) => {
    try {
        const { company_id } = req.query;
        if (!company_id) return res.status(400).json({ error: 'company_id required' });

        const { data, error } = await supabase
            .from('report_templates')
            .select('*')
            .eq('company_id', company_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a report template
router.delete('/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('report_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

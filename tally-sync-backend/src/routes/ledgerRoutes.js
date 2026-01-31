/**
 * Ledger Routes
 * Read-only endpoints for mobile app to fetch ledger data
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { query, param, validationResult } = require('express-validator');

/**
 * GET /api/v1/ledgers
 * List ledgers for a company with optional filters
 */
router.get('/',
    query('companyId').isString().notEmpty(),
    query('group').optional().isString(),
    query('search').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { companyId, group, search, limit = 100, offset = 0 } = req.query;

        try {
            let queryBuilder = supabase
                .from('ledgers')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .order('name', { ascending: true })
                .range(offset, offset + limit - 1);

            // Apply filters
            if (group) {
                queryBuilder = queryBuilder.eq('ledger_group', group);
            }
            if (search) {
                queryBuilder = queryBuilder.ilike('name', `%${search}%`);
            }

            const { data, error, count } = await queryBuilder;

            if (error) throw error;

            res.status(200).json({
                success: true,
                count: data.length,
                total: count,
                data
            });
        } catch (error) {
            logger.error('Failed to fetch ledgers:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * GET /api/v1/ledgers/:id
 * Get single ledger by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ledgers')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error(`Failed to fetch ledger ${req.params.id}:`, error);
        res.status(404).json({ success: false, error: 'Ledger not found' });
    }
});

/**
 * GET /api/v1/ledgers/groups/:companyId
 * Get available ledger groups for a company
 */
router.get('/groups/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ledgers')
            .select('ledger_group')
            .eq('company_id', req.params.companyId)
            .not('ledger_group', 'is', null);

        if (error) throw error;

        // Get unique groups
        const uniqueGroups = [...new Set(data.map(d => d.ledger_group))];

        res.status(200).json({
            success: true,
            data: uniqueGroups
        });
    } catch (error) {
        logger.error('Failed to fetch ledger groups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/ledgers/summary/:companyId
 * Get ledger summary (totals by group)
 */
router.get('/summary/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ledgers')
            .select('ledger_group, current_balance')
            .eq('company_id', req.params.companyId);

        if (error) throw error;

        // Calculate summary by group
        const summary = data.reduce((acc, ledger) => {
            const group = ledger.ledger_group || 'Uncategorized';
            if (!acc[group]) {
                acc[group] = { count: 0, totalBalance: 0 };
            }
            acc[group].count++;
            acc[group].totalBalance += parseFloat(ledger.current_balance || 0);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        logger.error('Failed to fetch ledger summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

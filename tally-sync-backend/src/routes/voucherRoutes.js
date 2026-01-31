/**
 * Voucher Routes
 * Read-only endpoints for voucher data access
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { query, validationResult } = require('express-validator');

/**
 * GET /api/v1/vouchers
 * List vouchers for a company with filters
 */
router.get('/',
    query('companyId').isString().notEmpty(),
    query('type').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('search').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const {
            companyId,
            type,
            dateFrom,
            dateTo,
            search,
            limit = 100,
            offset = 0
        } = req.query;

        try {
            let queryBuilder = supabase
                .from('vouchers')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .order('vch_date', { ascending: false })
                .range(offset, offset + limit - 1);

            // Apply filters
            if (type) {
                queryBuilder = queryBuilder.eq('voucher_type', type);
            }
            if (dateFrom) {
                queryBuilder = queryBuilder.gte('vch_date', dateFrom);
            }
            if (dateTo) {
                queryBuilder = queryBuilder.lte('vch_date', dateTo);
            }
            if (search) {
                queryBuilder = queryBuilder.or(`voucher_number.ilike.%${search}%,narration.ilike.%${search}%`);
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
            logger.error('Failed to fetch vouchers:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * GET /api/v1/vouchers/:id
 * Get single voucher by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error(`Failed to fetch voucher ${req.params.id}:`, error);
        res.status(404).json({ success: false, error: 'Voucher not found' });
    }
});

/**
 * GET /api/v1/vouchers/types/:companyId
 * Get available voucher types for a company
 */
router.get('/types/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('voucher_type')
            .eq('company_id', req.params.companyId)
            .not('voucher_type', 'is', null);

        if (error) throw error;

        const uniqueTypes = [...new Set(data.map(d => d.voucher_type))];

        res.status(200).json({
            success: true,
            data: uniqueTypes
        });
    } catch (error) {
        logger.error('Failed to fetch voucher types:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/vouchers/summary/:companyId
 * Get voucher summary (totals by type)
 */
router.get('/summary/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vouchers')
            .select('voucher_type, amount')
            .eq('company_id', req.params.companyId);

        if (error) throw error;

        const summary = data.reduce((acc, voucher) => {
            const type = voucher.voucher_type || 'Unknown';
            if (!acc[type]) {
                acc[type] = { count: 0, totalAmount: 0 };
            }
            acc[type].count++;
            acc[type].totalAmount += parseFloat(voucher.amount || 0);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        logger.error('Failed to fetch voucher summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

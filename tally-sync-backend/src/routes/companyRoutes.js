/**
 * Company Management Routes
 * Handles company CRUD operations
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validateCompany = [
    body('id').isString().notEmpty().withMessage('Company ID is required'),
    body('name').isString().notEmpty().withMessage('Company name is required'),
];

/**
 * GET /api/v1/companies
 * List all companies for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        logger.error('Failed to fetch companies:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/companies/:id
 * Get single company by ID
 */
router.get('/:id', param('id').isString(), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error(`Failed to fetch company ${req.params.id}:`, error);
        res.status(404).json({ success: false, error: 'Company not found' });
    }
});

/**
 * POST /api/v1/companies
 * Create or update a company (upsert from Tally)
 */
router.post('/', validateCompany, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id, name } = req.body;

    try {
        const { data, error } = await supabase
            .from('companies')
            .upsert({
                id,
                name,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select()
            .single();

        if (error) throw error;

        logger.info(`Company upserted: ${name} (${id})`);
        res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error('Failed to upsert company:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/v1/companies/:id
 * Delete a company and all related data
 */
router.delete('/:id', param('id').isString(), async (req, res) => {
    try {
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;

        logger.info(`Company deleted: ${req.params.id}`);
        res.status(200).json({ success: true, message: 'Company deleted' });
    } catch (error) {
        logger.error(`Failed to delete company ${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

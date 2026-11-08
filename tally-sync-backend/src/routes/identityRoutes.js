/**
 * Identity Routes - Company identity registration (STAGE C1A)
 *
 * Endpoint: POST /api/v1/companies/:company_id/identity
 *
 * SECURITY PROPERTIES:
 * - DISABLED BY DEFAULT: Returns 503 feature_not_enabled until explicitly enabled
 *   via IDENTITY_REGISTRATION_ENABLED=true environment variable
 * - WHEN ENABLED: Returns 501 not_implemented until actual registration logic
 *   is implemented. Never returns 200 success.
 * - No database writes under any state.
 * - Strict input validation via express-validator
 * - Never identifies company by name alone
 * - No service_role credentials exposed to clients
 * - No credentials logged
 * - No InsForge SDK used
 *
 * NOTE: The actual database INSERT is NOT implemented. This endpoint is a
 * skeleton placeholder. When IDENTITY_REGISTRATION_ENABLED=true, it returns
 * 501 Not Implemented. Actual database write logic will be implemented in
 * a subsequent phase.
 */

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { supabaseIdentity, configError, AUTHORITATIVE_PROJECT } = require('../config/supabaseIdentity');

/**
 * POST /api/v1/companies/:company_id/identity
 * Register company identity (Tally GUID + data_path + source_id)
 *
 * DISABLED BY DEFAULT - returns 503 feature_not_enabled until explicitly enabled
 * via IDENTITY_REGISTRATION_ENABLED=true environment variable.
 *
 * WHEN ENABLED: Returns 501 not_implemented until actual registration logic
 * is implemented. Never returns 200 success. Never performs database writes.
 */
router.post('/:company_id/identity', [
    param('company_id').isString().notEmpty().withMessage('Company ID is required'),
    body('tally_guid').isString().notEmpty().withMessage('Tally GUID is required'),
    body('data_path').isString().notEmpty().withMessage('Data path is required'),
    body('source_id').isString().notEmpty().withMessage('Source ID is required')
], async (req, res) => {
    // Validate input first
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'validation_error',
            errors: errors.array()
        });
    }

    // Feature disabled - return 503
    if (process.env.IDENTITY_REGISTRATION_ENABLED !== 'true') {
        logger.warn('Identity registration endpoint is disabled');
        return res.status(503).json({
            success: false,
            error: 'feature_not_enabled',
            message: 'Identity registration is not yet enabled'
        });
    }

    // Config check - should not reach here if misconfigured
    if (configError || !supabaseIdentity) {
        logger.error('Identity module misconfigured', { error: configError });
        return res.status(503).json({
            success: false,
            error: 'service_misconfigured',
            message: 'Identity service is misconfigured'
        });
    }

    const { company_id } = req.params;
    const { tally_guid, data_path, source_id } = req.body;

    // Log without sensitive data (no credentials, no JWTs, no raw GUIDs)
    logger.info('Identity registration request received', {
        company_id: String(company_id).substring(0, 8),
        has_tally_guid: !!tally_guid,
        has_data_path: !!data_path,
        has_source_id: !!source_id
    });

    // Feature enabled but not implemented - return 501
    // Never perform database writes in this phase
    return res.status(501).json({
        success: false,
        error: 'not_implemented',
        message: 'Identity registration is not yet implemented'
    });
});

module.exports = router;

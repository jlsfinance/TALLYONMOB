/**
 * Enhanced Sync Routes - REST API endpoints for Windows Sync App
 * Provides sync operations with validation and logging
 */

const express = require('express');
const router = express.Router();
const SyncService = require('../services/syncService');
const CompanyService = require('../services/companyService');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');
const { SYNC_DATA_TYPES } = require('../config/constants');

// Validation middleware for sync requests
const validateSync = [
    body('companyId').isString().notEmpty().withMessage('Company ID is required'),
    body('dataType').isIn(SYNC_DATA_TYPES).withMessage(`Data type must be one of: ${SYNC_DATA_TYPES.join(', ')}`),
    body('data').isArray().withMessage('Data must be an array'),
];

// Validation middleware for company sync
const validateCompanySync = [
    body('company').isObject().withMessage('Company data is required'),
    body('company.id').isString().notEmpty().withMessage('Company ID is required'),
    body('company.name').isString().notEmpty().withMessage('Company name is required'),
];

/**
 * POST / - Main sync endpoint for batch data
 * Used by Windows Sync App to upload Tally data
 */
router.post('/', validateSync, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { companyId, dataType, data, isIncremental } = req.body;

    try {
        logger.info(`Sync started: ${dataType} - Company: ${companyId} - Records: ${data.length}`);

        // Create sync log
        const syncLogId = await SyncService.createSyncLog(companyId, dataType, isIncremental ? 'incremental' : 'full');

        // Perform sync
        const result = await SyncService.syncCollection(companyId, dataType, data, {
            isIncremental,
            syncLogId
        });

        // Update sync log
        await SyncService.updateSyncLog(syncLogId, result);

        // Update company last sync timestamp
        await CompanyService.updateLastSync(companyId);

        res.status(200).json({
            success: true,
            message: `Successfully synced ${result.count} items to ${dataType}`,
            details: result
        });
    } catch (error) {
        logger.error(`Sync failed for ${dataType}:`, error);
        res.status(500).json({
            success: false,
            error: 'Sync failed',
            message: error.message
        });
    }
});

/**
 * POST /sync/company - Sync company information
 * Called first to ensure company exists before data sync
 */
router.post('/company', validateCompanySync, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { company } = req.body;

    try {
        logger.info(`Company sync: ${company.name} (${company.id})`);

        await CompanyService.upsertCompany(company);

        res.status(200).json({
            success: true,
            message: `Company "${company.name}" synced successfully`
        });
    } catch (error) {
        logger.error('Company sync failed:', error);
        res.status(500).json({
            success: false,
            error: 'Company sync failed',
            message: error.message
        });
    }
});

/**
 * POST /sync/batch - Sync multiple data types in one request
 * Efficient for full sync operations
 */
router.post('/batch', async (req, res) => {
    const { companyId, batches } = req.body;

    if (!companyId || !Array.isArray(batches)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request. Required: companyId, batches[]'
        });
    }

    const results = {};
    let totalSuccess = 0;
    let totalFailed = 0;

    try {
        for (const batch of batches) {
            if (!SYNC_DATA_TYPES.includes(batch.dataType) || !Array.isArray(batch.data)) {
                results[batch.dataType] = {
                    success: false,
                    error: 'Invalid batch format'
                };
                continue;
            }

            try {
                const result = await SyncService.syncCollection(companyId, batch.dataType, batch.data);
                results[batch.dataType] = result;
                totalSuccess += result.count;
                totalFailed += result.failed || 0;
            } catch (err) {
                results[batch.dataType] = {
                    success: false,
                    error: err.message
                };
            }
        }

        await CompanyService.updateLastSync(companyId);

        res.status(200).json({
            success: true,
            summary: {
                totalSuccess,
                totalFailed,
                batchesProcessed: batches.length
            },
            results
        });
    } catch (error) {
        logger.error('Batch sync failed:', error);
        res.status(500).json({
            success: false,
            error: 'Batch sync failed',
            message: error.message
        });
    }
});

/**
 * POST /sync/with-items - Sync records with nested items
 * Used for vouchers with entries, sales with items
 */
router.post('/sync/with-items', async (req, res) => {
    const { companyId, dataType, records } = req.body;

    if (!companyId || !dataType || !Array.isArray(records)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request. Required: companyId, dataType, records[]'
        });
    }

    try {
        const result = await SyncService.syncWithItems(companyId, dataType, records);

        await CompanyService.updateLastSync(companyId);

        res.status(200).json({
            success: true,
            message: `Synced ${result.parentCount} ${dataType} with ${result.itemCount} items`,
            details: result
        });
    } catch (error) {
        logger.error('Sync with items failed:', error);
        res.status(500).json({
            success: false,
            error: 'Sync with items failed',
            message: error.message
        });
    }
});

/**
 * GET /sync/state/:companyId/:dataType - Get sync state for incremental sync
 * Windows app uses this to determine what to sync
 */
router.get('/sync/state/:companyId/:dataType', async (req, res) => {
    const { companyId, dataType } = req.params;

    try {
        const state = await SyncService.getSyncState(companyId, dataType);

        res.status(200).json({
            success: true,
            data: state || {
                isInitialSyncComplete: false,
                lastSyncAt: null,
                lastAlterId: null
            }
        });
    } catch (error) {
        logger.error('Get sync state failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync state'
        });
    }
});

/**
 * GET /sync/logs/:companyId - Get recent sync logs
 */
router.get('/sync/logs/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const { limit } = req.query;

    try {
        const logs = await SyncService.getSyncLogs(companyId, parseInt(limit) || 20);

        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error('Get sync logs failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync logs'
        });
    }
});

/**
 * DELETE /sync/data/:companyId/:dataType - Clear data for re-sync
 * Use with caution - clears all data of a type for a company
 */
router.delete('/sync/data/:companyId/:dataType', async (req, res) => {
    const { companyId, dataType } = req.params;

    if (!SYNC_DATA_TYPES.includes(dataType)) {
        return res.status(400).json({
            success: false,
            error: `Invalid data type. Must be one of: ${SYNC_DATA_TYPES.join(', ')}`
        });
    }

    try {
        const { supabase } = require('../config/supabase');

        const { error } = await supabase
            .from(dataType)
            .delete()
            .eq('company_id', companyId);

        if (error) throw error;

        // Reset sync state
        await supabase
            .from('sync_state')
            .delete()
            .eq('company_id', companyId)
            .eq('data_type', dataType);

        logger.warn(`Cleared ${dataType} data for company ${companyId}`);

        res.status(200).json({
            success: true,
            message: `Cleared all ${dataType} data for company`
        });
    } catch (error) {
        logger.error('Clear data failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear data'
        });
    }
});

module.exports = router;

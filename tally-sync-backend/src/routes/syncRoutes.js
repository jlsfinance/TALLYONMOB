/**
 * Enhanced Sync Routes - REST API endpoints for Windows Sync App
 * Provides sync operations with validation and logging
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const SyncService = require('../services/syncService');
const CompanyService = require('../services/companyService');
const logger = require('../utils/logger');
const { body, validationResult } = require('express-validator');
const { SYNC_DATA_TYPES } = require('../config/constants');
const TelegramService = require('../services/telegramService');
const SyncControlService = require('../services/syncControlService');
const EntitlementService = require('../services/entitlementService');

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

// Registration is the bootstrap endpoint. Every other mutating sync endpoint
// must prove an active, non-revoked device before touching sync data.
router.use(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/device/register' || (req.path.startsWith('/device/') && req.path.endsWith('/revoke'))) return next();
    const companyId = req.body?.companyId || req.body?.company?.id || req.params?.companyId;
    const deviceId = req.body?.deviceId || req.headers['x-device-id'];
    const deviceToken = req.headers['x-device-token'];
    if (!companyId || !deviceId) return res.status(401).json({ success: false, error: 'DEVICE_REQUIRED' });
    try {
        req.device = await SyncControlService.assertDeviceActive(companyId, deviceId, deviceToken);
        return next();
    } catch (error) {
        const status = ['DEVICE_REQUIRED', 'DEVICE_NOT_REGISTERED', 'DEVICE_TOKEN_REQUIRED', 'DEVICE_TOKEN_INVALID'].includes(error.code) ? 401 : 403;
        return res.status(status).json({ success: false, error: error.code || 'DEVICE_NOT_AUTHORIZED' });
    }
});

// Device proof is necessary but not sufficient: license, trial, company
// allowance, serial, feature, quota, and version are checked before handlers.
router.use(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || (req.path.startsWith('/device/') && req.path.endsWith('/revoke'))) return next();
    const companyId = req.body?.companyId || req.body?.company?.id || req.params?.companyId;
    const dataType = req.body?.dataType || (req.path.includes('/sync/data/') ? req.params?.dataType : undefined);
    const recordCount = Array.isArray(req.body?.data) ? req.body.data.length : Array.isArray(req.body?.batches) ? req.body.batches.reduce((sum, batch) => sum + (Array.isArray(batch.data) ? batch.data.length : 0), 0) : 0;
    try {
        req.entitlement = await EntitlementService.authorizeSyncWrite({
            companyId, dataType, recordCount,
            tallySerial: req.body?.tallySerial || req.headers['x-tally-serial'],
            appVersion: req.headers['x-sync-app-version'],
        });
        res.setHeader('x-correlation-id', req.entitlement.correlationId);
        return next();
    } catch (error) {
        const correlationId = error.correlationId || crypto.randomUUID();
        res.setHeader('x-correlation-id', correlationId);
        return res.status(error.retryable ? 503 : 403).json({ success: false, error: error.code || 'ENTITLEMENT_DENIED', retryable: Boolean(error.retryable), correlationId });
    }
});

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

    const { companyId, dataType, data, isIncremental, deviceId } = req.body;
    const resolvedDeviceId = deviceId || req.headers['x-device-id'] || null;
    const idempotencyKey = req.body.idempotencyKey || req.headers['x-idempotency-key'] || null;
    let syncRun = null;

    try {
        logger.info(`Sync started: ${dataType} - Company: ${companyId} - Records: ${data.length}`);

        const replayedResponse = await SyncControlService.safe(
            () => SyncControlService.getIdempotentResponse(companyId, idempotencyKey), null
        );
        if (replayedResponse) {
            return res.status(200).json({ ...replayedResponse, replayed: true });
        }
        // Re-check immediately before the write path; do not swallow a revoke
        // race or a failed device-token verification.
        await SyncControlService.touchDevice(companyId, resolvedDeviceId, req.headers['x-device-token']);
        syncRun = await SyncControlService.safe(() => SyncControlService.createRun({
            companyId, deviceId: resolvedDeviceId, dataType, totalRecords: data.length,
            metadata: { incremental: Boolean(isIncremental) },
        }), null);

        // Create sync log
        const syncLogId = await SyncService.createSyncLog(companyId, dataType, isIncremental ? 'incremental' : 'full');

        // Perform sync
        const result = await SyncService.syncCollection(companyId, dataType, data, {
            isIncremental,
            syncLogId,
            deviceId: resolvedDeviceId
        });

        // Update sync log
        await SyncService.updateSyncLog(syncLogId, result);
        await SyncControlService.safe(() => SyncControlService.finishRun(syncRun?.id, result), null);

        // Update company last sync timestamp
        await CompanyService.updateLastSync(companyId);

        // 🔔 Notify via Telegram
        await TelegramService.sendSyncReport(companyId, dataType, result);

        const responsePayload = {
            success: true,
            message: `Successfully synced ${result.count} items to ${dataType}`,
            details: result
        };
        await SyncControlService.safe(
            () => SyncControlService.saveIdempotentResponse(companyId, resolvedDeviceId, idempotencyKey, responsePayload), null
        );
        res.status(200).json(responsePayload);
    } catch (error) {
        logger.error(`Sync failed for ${dataType}:`, error);
        await SyncControlService.safe(() => SyncControlService.finishRun(syncRun?.id, {
            success: false, failed: data.length, errors: [{ error: error.message }]
        }), null);
        if (['DEVICE_REVOKED', 'DEVICE_NOT_REGISTERED', 'DEVICE_TOKEN_REQUIRED', 'DEVICE_TOKEN_INVALID'].includes(error.code)) {
            const status = error.code === 'DEVICE_REVOKED' ? 403 : 401;
            return res.status(status).json({ success: false, error: error.code });
        }
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

        // 🔔 Notify via Telegram (Summary for Batch)
        await TelegramService.sendSyncReport(companyId, 'Batch Transfer', {
            count: totalSuccess,
            failed: totalFailed,
            added: totalSuccess,
            success: true
        });

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

        // 🔔 Notify via Telegram
        await TelegramService.sendSyncReport(companyId, dataType, {
            count: result.parentCount,
            added: result.parentCount,
            success: true
        });

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

// Resumable chunk checkpoint for large-company imports.
router.get('/checkpoint/:companyId/:module', async (req, res) => {
    try {
        const checkpoint = await SyncService.getCheckpoint(
            req.params.companyId,
            req.params.module,
            req.query.sessionId || null
        );
        res.status(200).json({ success: true, data: checkpoint });
    } catch (error) {
        logger.error('Checkpoint read failed:', error);
        res.status(500).json({ success: false, error: 'Failed to load sync checkpoint' });
    }
});

router.put('/checkpoint/:companyId/:module', async (req, res) => {
    const { companyId, module } = req.params;
    const { syncSessionId, currentChunk, totalChunks, lastProcessedId, lastAlterId,
        recordsProcessed, bytesProcessed, pageSize, status, errorMessage, expiresAt } = req.body;
    if (!syncSessionId) {
        return res.status(400).json({ success: false, error: 'syncSessionId is required' });
    }
    try {
        const checkpoint = await SyncService.saveCheckpoint(companyId, module, {
            id: req.body.id,
            syncSessionId, currentChunk, totalChunks, lastProcessedId, lastAlterId,
            recordsProcessed, bytesProcessed, pageSize, status, errorMessage, expiresAt
        });
        res.status(200).json({ success: true, data: checkpoint });
    } catch (error) {
        logger.error('Checkpoint write failed:', error);
        res.status(500).json({ success: false, error: 'Failed to save sync checkpoint' });
    }
});

router.get('/progress/:companyId', async (req, res) => {
    try {
        const progress = await SyncService.getSyncProgress(req.params.companyId, req.query.limit);
        res.status(200).json({ success: true, data: progress });
    } catch (error) {
        logger.error('Sync progress read failed:', error);
        res.status(500).json({ success: false, error: 'Failed to load sync progress' });
    }
});

// Register a Windows/Tally device. Revoked devices cannot be reactivated here.
router.post('/device/register', async (req, res) => {
    const { companyId, deviceId, name, platform, metadata } = req.body;
    const deviceToken = req.headers['x-device-token'];
    if (!companyId || !deviceId) return res.status(400).json({ success: false, error: 'companyId and deviceId are required' });
    try {
        const result = await SyncControlService.registerDevice({ companyId, deviceId, name, platform, metadata, deviceToken });
        res.status(200).json({ success: true, data: result.device, ...(result.deviceToken ? { deviceToken: result.deviceToken } : {}) });
    } catch (error) {
        logger.error('Device registration failed:', error);
        const status = error.code === 'DEVICE_REVOKED' ? 409 : ['DEVICE_TOKEN_REQUIRED', 'DEVICE_TOKEN_INVALID'].includes(error.code) ? 401 : 500;
        res.status(status).json({ success: false, error: error.code || 'DEVICE_REGISTRATION_FAILED' });
    }
});

router.post('/device/:deviceId/revoke', async (req, res) => {
    const { companyId } = req.body;
    const { deviceId } = req.params;
    if (!companyId) return res.status(400).json({ success: false, error: 'companyId is required' });
    if (!req.syncContext?.global) return res.status(403).json({ success: false, error: 'GLOBAL_CONTROL_KEY_REQUIRED' });
    try {
        const device = await SyncControlService.revokeDevice(companyId, deviceId);
        res.status(200).json({ success: true, data: device });
    } catch (error) {
        logger.error('Device revoke failed:', error);
        const status = error.code === 'DEVICE_NOT_ACTIVE' ? 404 : 500;
        res.status(status).json({ success: false, error: error.code || 'DEVICE_REVOKE_FAILED' });
    }
});

router.get('/devices/:companyId', async (req, res) => {
    try {
        const devices = await SyncControlService.listDevices(req.params.companyId);
        res.status(200).json({ success: true, data: devices });
    } catch (error) {
        logger.error('Device list failed:', error);
        res.status(500).json({ success: false, error: 'Failed to list devices', message: error.message });
    }
});

router.get('/health/:companyId', async (req, res) => {
    try {
        const health = await SyncControlService.getHealth(req.params.companyId);
        res.status(200).json({ success: true, data: health });
    } catch (error) {
        logger.error('Sync health failed:', error);
        res.status(500).json({ success: false, error: 'Failed to load sync health', message: error.message });
    }
});

router.get('/conflicts/:companyId', async (req, res) => {
    try {
        const conflicts = await SyncControlService.listConflicts(req.params.companyId, req.query.status || 'open');
        res.status(200).json({ success: true, data: conflicts });
    } catch (error) {
        logger.error('Conflict list failed:', error);
        res.status(500).json({ success: false, error: 'Failed to list conflicts', message: error.message });
    }
});

router.post('/conflicts/:id/resolve', async (req, res) => {
    const { resolution } = req.body;
    if (!resolution) return res.status(400).json({ success: false, error: 'resolution is required' });
    try {
        const conflict = await SyncControlService.resolveConflict(req.params.id, resolution);
        res.status(200).json({ success: true, data: conflict });
    } catch (error) {
        logger.error('Conflict resolution failed:', error);
        res.status(500).json({ success: false, error: 'Failed to resolve conflict', message: error.message });
    }
});

module.exports = router;

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const CompanyService = require('../services/companyService');

// Middleware for verifying Supabase JWT (if needed for browser/mobile client)
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            throw new Error('Invalid token');
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Authentication Error:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// Middleware for Tally Windows Sync App (API Key based)
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.SYNC_API_KEY) {
        logger.warn('Unauthorized API access attempt');
        return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    }
    next();
};

const validateSyncCredential = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ success: false, error: 'Missing X-API-Key' });
    if (process.env.SYNC_API_KEY && apiKey === process.env.SYNC_API_KEY) {
        req.syncContext = { global: true, companyId: req.body?.companyId || req.params?.companyId };
        return next();
    }
    try {
        const companyId = req.body?.companyId || req.params?.companyId;
        if (!companyId) return res.status(403).json({ success: false, error: 'Company ID is required' });
        const result = await CompanyService.validateSyncApiKey(apiKey);
        if (!result.valid || result.companyId !== companyId) {
            return res.status(403).json({ success: false, error: 'Invalid sync credential' });
        }
        req.syncContext = { global: false, companyId: result.companyId, companyName: result.companyName };
        return next();
    } catch (error) {
        logger.error('Sync credential validation failed:', error);
        return res.status(503).json({ success: false, error: 'Sync credential service unavailable' });
    }
};

module.exports = { authenticate, validateApiKey, validateSyncCredential };

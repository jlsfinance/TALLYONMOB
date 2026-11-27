const { supabaseIdentity } = require('../config/supabaseIdentity');
const logger = require('../utils/logger');

const getAuthDb = () => {
    if (supabaseIdentity) return supabaseIdentity;
    return require('../config/supabase').supabase;
};

// Middleware for verifying Supabase JWT
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
    }

    const db = getAuthDb();
    if (!db || !db.auth || typeof db.auth.getUser !== 'function') {
        return res.status(503).json({ success: false, error: 'Authentication service unavailable' });
    }

    try {
        const { data, error } = await db.auth.getUser(token);
        const user = data?.user;

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
        }

        req.user = user;
        req.authToken = token;
        return next();
    } catch (error) {
        logger.error('Authentication Error:', error);
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
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

module.exports = { authenticate, validateApiKey };

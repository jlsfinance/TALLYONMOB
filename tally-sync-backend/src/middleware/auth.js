const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');

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

module.exports = { authenticate, validateApiKey };

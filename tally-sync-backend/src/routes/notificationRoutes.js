/**
 * Notification Routes - Push notification endpoints
 */

const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// POST /notifications/register - Register device for push
router.post('/register', async (req, res) => {
    try {
        const { userId, companyId, token, platform } = req.body;

        if (!userId || !companyId || !token) {
            return res.status(400).json({ success: false, error: 'userId, companyId, and token required' });
        }

        const result = await NotificationService.registerDevice(userId, companyId, token, platform);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /notifications/register Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /notifications/send - Send notification to company
router.post('/send', async (req, res) => {
    try {
        const { companyId, title, body, type, data } = req.body;

        if (!companyId || !title || !body) {
            return res.status(400).json({ success: false, error: 'companyId, title, and body required' });
        }

        const result = await NotificationService.notifyCompany(companyId, {
            title, body, type, data
        });

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /notifications/send Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /notifications/:companyId - Get notification history
router.get('/:companyId', async (req, res) => {
    try {
        const { limit } = req.query;
        const notifications = await NotificationService.getNotifications(
            req.params.companyId,
            parseInt(limit) || 50
        );

        res.json({ success: true, data: notifications });
    } catch (error) {
        logger.error('GET /notifications Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /notifications/low-stock - Send low stock alert
router.post('/low-stock', async (req, res) => {
    try {
        const { companyId, items } = req.body;

        if (!companyId || !items?.length) {
            return res.status(400).json({ success: false, error: 'companyId and items[] required' });
        }

        const result = await NotificationService.sendLowStockAlert(companyId, items);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /notifications/low-stock Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /notifications/payment-received - Send payment alert
router.post('/payment-received', async (req, res) => {
    try {
        const { companyId, partyName, amount } = req.body;

        if (!companyId || !partyName || !amount) {
            return res.status(400).json({ success: false, error: 'companyId, partyName, and amount required' });
        }

        const result = await NotificationService.sendPaymentAlert(companyId, partyName, amount);
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /notifications/payment-received Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

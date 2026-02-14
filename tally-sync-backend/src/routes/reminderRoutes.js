/**
 * Reminder Routes - Payment reminder endpoints
 */

const express = require('express');
const router = express.Router();
const ReminderService = require('../services/reminderService');
const logger = require('../utils/logger');

// GET /reminders/overdue/:companyId - Get overdue parties
router.get('/overdue/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { minAmount, limit } = req.query;

        const parties = await ReminderService.getOverdueParties(companyId, {
            minAmount: parseFloat(minAmount) || 0,
            limit: parseInt(limit) || 100
        });

        res.json({ success: true, data: parties });
    } catch (error) {
        logger.error('GET /reminders/overdue Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /reminders/send-email - Send email reminder
router.post('/send-email', async (req, res) => {
    try {
        const { companyId, partyId, template, companyName } = req.body;

        if (!companyId || !partyId) {
            return res.status(400).json({ success: false, error: 'companyId and partyId required' });
        }

        const result = await ReminderService.sendEmailReminder(companyId, partyId, {
            template, companyName
        });

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /reminders/send-email Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /reminders/send-bulk - Send bulk reminders
router.post('/send-bulk', async (req, res) => {
    try {
        const { companyId, partyIds, channel, companyName } = req.body;

        if (!companyId || !partyIds?.length || !channel) {
            return res.status(400).json({ success: false, error: 'companyId, partyIds[], and channel required' });
        }

        const result = await ReminderService.sendBulkReminders(companyId, partyIds, channel, { companyName });
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /reminders/send-bulk Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /reminders/history/:companyId - Get reminder history
router.get('/history/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const { limit } = req.query;

        const history = await ReminderService.getReminderHistory(companyId, parseInt(limit) || 50);
        res.json({ success: true, data: history });
    } catch (error) {
        logger.error('GET /reminders/history Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /reminders/whatsapp-link - Generate WhatsApp reminder link
router.post('/whatsapp-link', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'phone and message required' });
        }

        const link = ReminderService.generateWhatsAppLink(phone, message);
        res.json({ success: true, data: { link } });
    } catch (error) {
        logger.error('POST /reminders/whatsapp-link Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramService');

// Webhook endpoint for Telegram
router.post('/webhook', async (req, res) => {
    try {
        const { message, callback_query } = req.body;
        if (message) {
            await telegramService.handleMessage(message);
        } else if (callback_query) {
            await telegramService.handleCallbackQuery(callback_query);
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Telegram Webhook Error:', error);
        res.status(200).send('OK'); // Always return 200 to Telegram
    }
});

module.exports = router;

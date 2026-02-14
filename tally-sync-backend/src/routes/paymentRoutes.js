/**
 * Payment Routes - Razorpay payment link endpoints
 */

const express = require('express');
const router = express.Router();
const PaymentService = require('../services/paymentService');
const logger = require('../utils/logger');

// POST /payments/create-link - Create a payment link
router.post('/create-link', async (req, res) => {
    try {
        const { companyId, partyName, partyEmail, partyPhone, amount, invoiceNumber, description } = req.body;

        if (!companyId || !amount || !partyName) {
            return res.status(400).json({ success: false, error: 'companyId, amount, and partyName required' });
        }

        const result = await PaymentService.createPaymentLink(companyId, {
            partyName, partyEmail, partyPhone, amount, invoiceNumber, description
        });

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /payments/create-link Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /payments/links/:companyId - Get all payment links
router.get('/links/:companyId', async (req, res) => {
    try {
        const { status, limit } = req.query;
        const links = await PaymentService.getPaymentLinks(req.params.companyId, {
            status, limit: parseInt(limit) || 50
        });

        res.json({ success: true, data: links });
    } catch (error) {
        logger.error('GET /payments/links Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /payments/status/:linkId - Check payment link status
router.get('/status/:linkId', async (req, res) => {
    try {
        const status = await PaymentService.getPaymentLinkStatus(req.params.linkId);
        res.json({ success: true, data: status });
    } catch (error) {
        logger.error('GET /payments/status Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /payments/webhook - Razorpay webhook handler
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const result = await PaymentService.handleWebhook(req.body, signature);

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('POST /payments/webhook Error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;

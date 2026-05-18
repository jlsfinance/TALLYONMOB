/**
 * Payment Routes - Razorpay payment links + Pending Transactions (Reverse Sync)
 */

const express = require('express');
const router = express.Router();
const PaymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const { supabase } = require('../config/supabase');

// =========================================================================
// RAZORPAY PAYMENT LINKS
// =========================================================================

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

// =========================================================================
// REVERSE SYNC: PENDING TRANSACTIONS (Web/App → Backend → Supabase → Windows)
// =========================================================================

/**
 * POST /payments/pending - Create a new pending transaction
 * Called by web dashboard when user creates a Sales/Purchase/Receipt/Payment voucher
 * that needs to be pushed to Tally by the Windows sync app
 * 
 * Body: { companyId, voucherType, voucherData }
 */
router.post('/pending', async (req, res) => {
    try {
        const { companyId, voucherType, voucherData } = req.body;

        // Validate required fields
        if (!companyId) {
            return res.status(400).json({
                success: false,
                error: 'companyId is required'
            });
        }

        if (!voucherType) {
            return res.status(400).json({
                success: false,
                error: 'voucherType is required (Sales, Purchase, Receipt, Payment)'
            });
        }

        if (!voucherData || typeof voucherData !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'voucherData (object) is required'
            });
        }

        // Validate voucher type
        const validTypes = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Journal'];
        const normalizedType = voucherType.charAt(0).toUpperCase() + voucherType.slice(1).toLowerCase();
        if (!validTypes.includes(normalizedType)) {
            return res.status(400).json({
                success: false,
                error: `Invalid voucherType '${voucherType}'. Must be one of: ${validTypes.join(', ')}`
            });
        }

        // Insert into pending_transactions table
        // Column names match Windows Sync App model (transaction_type, voucher_data, error_message)
        const { data, error } = await supabase
            .from('pending_transactions')
            .insert({
                company_id: companyId,
                transaction_type: normalizedType,
                voucher_data: voucherData,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            logger.error('POST /payments/pending insert error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to save pending transaction',
                details: error.message
            });
        }

        logger.info(`✅ Pending transaction created: ${normalizedType} for company ${companyId}`);

        res.status(201).json({
            success: true,
            message: `${normalizedType} invoice saved. It will be synced to Tally shortly.`,
            data: {
                id: data.id,
                company_id: data.company_id,
                transaction_type: data.transaction_type,
                status: data.status,
                created_at: data.created_at
            }
        });
    } catch (error) {
        logger.error('POST /payments/pending Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /payments/sync-status - Check sync status of a pending transaction
 * 
 * Body: { transactionId }
 */
router.post('/sync-status', async (req, res) => {
    try {
        const { transactionId } = req.body;

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                error: 'transactionId is required'
            });
        }

        const { data, error } = await supabase
            .from('pending_transactions')
            .select('id, status, tally_voucher_number, error_message, synced_at, created_at, updated_at')
            .eq('id', transactionId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found'
                });
            }
            logger.error('POST /payments/sync-status query error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to check sync status',
                details: error.message
            });
        }

        res.json({
            success: true,
            data
        });
    } catch (error) {
        logger.error('POST /payments/sync-status Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

module.exports = router;

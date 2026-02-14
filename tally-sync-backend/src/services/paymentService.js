/**
 * PaymentService - Razorpay payment link generation and tracking
 * Handles online payment collection via Razorpay Payment Links
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

class PaymentService {
    /**
     * Get Razorpay auth header
     */
    static getAuthHeader() {
        const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        return `Basic ${auth}`;
    }

    /**
     * Create a payment link for an invoice
     */
    static async createPaymentLink(companyId, invoiceData) {
        const {
            partyName, partyEmail, partyPhone,
            amount, invoiceNumber, description
        } = invoiceData;

        try {
            if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
                throw new Error('Razorpay credentials not configured');
            }

            const payload = {
                amount: Math.round(amount * 100), // Razorpay expects paise
                currency: 'INR',
                accept_partial: false,
                description: description || `Payment for Invoice #${invoiceNumber}`,
                customer: {
                    name: partyName,
                    email: partyEmail || undefined,
                    contact: partyPhone || undefined
                },
                notify: {
                    sms: !!partyPhone,
                    email: !!partyEmail
                },
                reminder_enable: true,
                notes: {
                    company_id: companyId,
                    invoice_number: invoiceNumber
                },
                callback_url: process.env.PAYMENT_CALLBACK_URL || '',
                callback_method: 'get'
            };

            const response = await fetch(`${RAZORPAY_API_URL}/payment_links`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.getAuthHeader()
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`Razorpay API error: ${response.status} - ${errBody}`);
            }

            const result = await response.json();

            // Store payment link in database
            await supabase.from('payment_links').insert({
                id: crypto.randomUUID(),
                company_id: companyId,
                razorpay_link_id: result.id,
                invoice_number: invoiceNumber,
                party_name: partyName,
                amount: amount,
                short_url: result.short_url,
                status: result.status,
                created_at: new Date().toISOString()
            });

            return {
                linkId: result.id,
                shortUrl: result.short_url,
                amount: amount,
                status: result.status
            };
        } catch (error) {
            logger.error('PaymentService.createPaymentLink Error:', error);
            throw error;
        }
    }

    /**
     * Get payment link status from Razorpay
     */
    static async getPaymentLinkStatus(linkId) {
        try {
            const response = await fetch(`${RAZORPAY_API_URL}/payment_links/${linkId}`, {
                headers: { 'Authorization': this.getAuthHeader() }
            });

            if (!response.ok) throw new Error(`Razorpay status check failed: ${response.status}`);
            return await response.json();
        } catch (error) {
            logger.error('PaymentService.getPaymentLinkStatus Error:', error);
            throw error;
        }
    }

    /**
     * Get all payment links for a company
     */
    static async getPaymentLinks(companyId, options = {}) {
        const { status, limit = 50 } = options;
        try {
            let query = supabase
                .from('payment_links')
                .select('*')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (status) query = query.eq('status', status);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('PaymentService.getPaymentLinks Error:', error);
            return [];
        }
    }

    /**
     * Handle Razorpay webhook for payment confirmation
     */
    static async handleWebhook(payload, signature) {
        try {
            // Verify webhook signature
            const expectedSig = crypto
                .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
                .update(JSON.stringify(payload))
                .digest('hex');

            if (signature !== expectedSig) {
                throw new Error('Invalid webhook signature');
            }

            const event = payload.event;
            const paymentLink = payload.payload?.payment_link?.entity;

            if (event === 'payment_link.paid' && paymentLink) {
                await supabase
                    .from('payment_links')
                    .update({
                        status: 'paid',
                        paid_at: new Date().toISOString()
                    })
                    .eq('razorpay_link_id', paymentLink.id);

                logger.info(`Payment received for link ${paymentLink.id}`);
            }

            return { success: true };
        } catch (error) {
            logger.error('PaymentService.handleWebhook Error:', error);
            throw error;
        }
    }
}

module.exports = PaymentService;

/**
 * ReminderService - Payment reminder operations
 * Handles sending reminders via Email, WhatsApp, and scheduling
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const MailService = require('./mailService');
const crypto = require('crypto');

class ReminderService {
    /**
     * Get all overdue parties for a company
     */
    static async getOverdueParties(companyId, options = {}) {
        const { minAmount = 0, daysOverdue = 0, limit = 100 } = options;

        try {
            let query = supabase
                .from('ledgers')
                .select('id, name, closing_balance, email, phone, address, gstin, parent_group')
                .eq('company_id', companyId)
                .in('parent_group', ['Sundry Debtors'])
                .gt('closing_balance', minAmount)
                .order('closing_balance', { ascending: false })
                .limit(limit);

            const { data, error } = await query;
            if (error) throw error;

            return data || [];
        } catch (error) {
            logger.error('ReminderService.getOverdueParties Error:', error);
            throw error;
        }
    }

    /**
     * Send email reminder to a party
     */
    static async sendEmailReminder(companyId, partyId, options = {}) {
        const { template, companyName } = options;

        try {
            // Get party details
            const { data: party, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', partyId)
                .eq('company_id', companyId)
                .single();

            if (error || !party) throw new Error('Party not found');
            if (!party.email) throw new Error('Party has no email address');

            const message = template || this.getDefaultTemplate(party, companyName);

            await MailService.sendContactMail({
                name: companyName || 'TallyLink',
                email: party.email,
                subject: `Payment Reminder - ₹${Math.abs(party.closing_balance).toLocaleString('en-IN')} Outstanding`,
                message
            });

            // Log the reminder
            await this.logReminder(companyId, {
                party_id: partyId,
                party_name: party.name,
                amount: party.closing_balance,
                channel: 'email',
                status: 'sent'
            });

            return { success: true, party: party.name, channel: 'email' };
        } catch (error) {
            logger.error('ReminderService.sendEmailReminder Error:', error);

            await this.logReminder(companyId, {
                party_id: partyId,
                party_name: options.partyName || 'Unknown',
                amount: 0,
                channel: 'email',
                status: 'failed',
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Generate WhatsApp message URL
     */
    static generateWhatsAppLink(phone, message) {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
        const encodedMessage = encodeURIComponent(message);
        return `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;
    }

    /**
     * Get default reminder template
     */
    static getDefaultTemplate(party, companyName = 'Our Company') {
        const amount = Math.abs(party.closing_balance).toLocaleString('en-IN');
        return `Dear ${party.name},\n\nThis is a gentle reminder regarding your outstanding payment of ₹${amount} with ${companyName}.\n\nWe kindly request you to clear the dues at the earliest.\n\nThank you for your business.\n\nRegards,\n${companyName}`;
    }

    /**
     * Log reminder to database
     */
    static async logReminder(companyId, data) {
        try {
            await supabase
                .from('reminder_logs')
                .insert({
                    id: crypto.randomUUID(),
                    company_id: companyId,
                    party_id: data.party_id,
                    party_name: data.party_name,
                    amount: data.amount,
                    channel: data.channel,
                    status: data.status,
                    error_message: data.error || null,
                    sent_at: new Date().toISOString()
                });
        } catch (err) {
            logger.error('Failed to log reminder:', err);
        }
    }

    /**
     * Get reminder history for a company
     */
    static async getReminderHistory(companyId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('reminder_logs')
                .select('*')
                .eq('company_id', companyId)
                .order('sent_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('ReminderService.getReminderHistory Error:', error);
            return [];
        }
    }

    /**
     * Send bulk reminders
     */
    static async sendBulkReminders(companyId, partyIds, channel, options = {}) {
        const results = { sent: 0, failed: 0, errors: [] };

        for (const partyId of partyIds) {
            try {
                if (channel === 'email') {
                    await this.sendEmailReminder(companyId, partyId, options);
                    results.sent++;
                }
            } catch (error) {
                results.failed++;
                results.errors.push({ partyId, error: error.message });
            }
        }

        return results;
    }
}

module.exports = ReminderService;

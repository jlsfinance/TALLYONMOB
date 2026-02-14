/**
 * NotificationService - FCM Push Notifications
 * Handles sending push notifications via Firebase Cloud Messaging
 */

const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const crypto = require('crypto');

class NotificationService {
    /**
     * Send push notification via FCM
     */
    static async sendPushNotification(fcmToken, notification) {
        try {
            const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY;
            if (!FCM_SERVER_KEY) {
                logger.warn('FCM_SERVER_KEY not configured, skipping push notification');
                return { success: false, reason: 'FCM not configured' };
            }

            const response = await fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `key=${FCM_SERVER_KEY}`
                },
                body: JSON.stringify({
                    to: fcmToken,
                    notification: {
                        title: notification.title,
                        body: notification.body,
                        icon: notification.icon || 'ic_notification',
                        click_action: notification.action || 'FLUTTER_NOTIFICATION_CLICK'
                    },
                    data: notification.data || {}
                })
            });

            const result = await response.json();
            return { success: result.success === 1, result };
        } catch (error) {
            logger.error('NotificationService.sendPushNotification Error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Register device token for user
     */
    static async registerDevice(userId, companyId, token, platform = 'android') {
        try {
            await supabase
                .from('device_tokens')
                .upsert({
                    user_id: userId,
                    company_id: companyId,
                    token,
                    platform,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,company_id' });

            return { success: true };
        } catch (error) {
            logger.error('NotificationService.registerDevice Error:', error);
            throw error;
        }
    }

    /**
     * Send notification to all users of a company
     */
    static async notifyCompany(companyId, notification) {
        try {
            const { data: devices } = await supabase
                .from('device_tokens')
                .select('token')
                .eq('company_id', companyId);

            if (!devices || devices.length === 0) return { sent: 0 };

            let sent = 0;
            for (const device of devices) {
                const result = await this.sendPushNotification(device.token, notification);
                if (result.success) sent++;
            }

            // Store notification in history
            await supabase.from('notifications').insert({
                id: crypto.randomUUID(),
                company_id: companyId,
                title: notification.title,
                body: notification.body,
                type: notification.type || 'general',
                created_at: new Date().toISOString()
            });

            return { sent, total: devices.length };
        } catch (error) {
            logger.error('NotificationService.notifyCompany Error:', error);
            return { sent: 0, error: error.message };
        }
    }

    /**
     * Send low stock alert
     */
    static async sendLowStockAlert(companyId, items) {
        const itemNames = items.slice(0, 3).map(i => i.name).join(', ');
        const more = items.length > 3 ? ` +${items.length - 3} more` : '';

        return this.notifyCompany(companyId, {
            title: '📦 Low Stock Alert',
            body: `${itemNames}${more} are running low!`,
            type: 'low_stock',
            data: { action: 'stock', itemCount: items.length }
        });
    }

    /**
     * Send payment received alert
     */
    static async sendPaymentAlert(companyId, partyName, amount) {
        return this.notifyCompany(companyId, {
            title: '💰 Payment Received',
            body: `₹${Math.abs(amount).toLocaleString('en-IN')} received from ${partyName}`,
            type: 'payment_received',
            data: { action: 'vouchers' }
        });
    }

    /**
     * Send sync completion notification
     */
    static async sendSyncCompleteNotification(companyId, recordCount) {
        return this.notifyCompany(companyId, {
            title: '✅ Sync Complete',
            body: `${recordCount} records synced from Tally successfully.`,
            type: 'sync_complete',
            data: { action: 'sync-history' }
        });
    }

    /**
     * Get notification history
     */
    static async getNotifications(companyId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.error('NotificationService.getNotifications Error:', error);
            return [];
        }
    }
}

module.exports = NotificationService;

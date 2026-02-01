/**
 * Payment Reminder Service
 * Sends automatic payment reminders via WhatsApp/SMS
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StorageService } from './storageService';
import { Invoice, Customer } from '../types';
import { upiPaymentService } from './upiPaymentService';

export interface ReminderSchedule {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    invoiceId?: string;
    invoiceNumber?: string;
    amount: number;
    dueDate: string;
    reminderType: 'BEFORE_DUE' | 'ON_DUE' | 'AFTER_DUE';
    daysBefore?: number;  // For BEFORE_DUE
    daysAfter?: number;   // For AFTER_DUE
    channel: 'WHATSAPP' | 'SMS' | 'PUSH';
    status: 'PENDING' | 'SENT' | 'CANCELLED';
    scheduledAt: string;
    sentAt?: string;
}

export interface ReminderSettings {
    enabled: boolean;
    autoRemindBeforeDue: boolean;
    daysBeforeDue: number;
    autoRemindOnDue: boolean;
    autoRemindAfterDue: boolean;
    daysAfterDue: number;
    defaultChannel: 'WHATSAPP' | 'SMS' | 'PUSH';
    reminderTime: string; // HH:MM format
    includeUPILink: boolean;
    messageTemplate: string;
}

const DEFAULT_SETTINGS: ReminderSettings = {
    enabled: true,
    autoRemindBeforeDue: true,
    daysBeforeDue: 2,
    autoRemindOnDue: true,
    autoRemindAfterDue: true,
    daysAfterDue: 3,
    defaultChannel: 'WHATSAPP',
    reminderTime: '10:00',
    includeUPILink: true,
    messageTemplate: 'default',
};

class PaymentReminderService {
    private settings: ReminderSettings = DEFAULT_SETTINGS;


    constructor() {
        this.loadSettings();
    }

    /**
     * Load settings from storage
     */
    async loadSettings(): Promise<void> {
        try {
            const saved = localStorage.getItem('payment_reminder_settings');
            if (saved) {
                this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.error('[ReminderService] Failed to load settings:', error);
        }
    }

    /**
     * Save settings
     */
    async saveSettings(settings: Partial<ReminderSettings>): Promise<void> {
        this.settings = { ...this.settings, ...settings };
        localStorage.setItem('payment_reminder_settings', JSON.stringify(this.settings));
    }

    /**
     * Get current settings
     */
    getSettings(): ReminderSettings {
        return this.settings;
    }

    /**
     * Get pending invoices that need reminders
     */
    async getPendingReminders(): Promise<{
        invoice: Invoice;
        customer: Customer | null;
        daysOverdue: number;
        daysToDue: number;
    }[]> {
        const invoices = await StorageService.getInvoices();
        const customers = await StorageService.getCustomers();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pendingInvoices = invoices
            .filter(inv => inv.status !== 'PAID' && inv.balanceDue && inv.balanceDue > 0)
            .map(invoice => {
                const dueDate = new Date(invoice.dueDate);
                dueDate.setHours(0, 0, 0, 0);

                const diffTime = dueDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return {
                    invoice,
                    customer: customers.find(c => c.id === invoice.customerId) || null,
                    daysOverdue: diffDays < 0 ? Math.abs(diffDays) : 0,
                    daysToDue: diffDays > 0 ? diffDays : 0,
                };
            });

        // Sort by overdue first, then by due soon
        return pendingInvoices.sort((a, b) => {
            if (a.daysOverdue !== b.daysOverdue) {
                return b.daysOverdue - a.daysOverdue;
            }
            return a.daysToDue - b.daysToDue;
        });
    }

    /**
     * Generate reminder message
     */
    generateMessage(params: {
        customerName: string;
        companyName: string;
        invoiceNumber?: string;
        amount: number;
        dueDate: string;
        upiLink?: string;
        isOverdue: boolean;
        daysOverdue?: number;
    }): string {
        const { customerName, companyName, invoiceNumber, amount, dueDate, upiLink, isOverdue, daysOverdue } = params;
        const formattedAmount = `₹${amount.toLocaleString('en-IN')}`;
        const formattedDate = new Date(dueDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });

        let message = '';

        if (isOverdue && daysOverdue) {
            message = `🔔 नमस्ते ${customerName} जी,

${companyName} की तरफ से याद दिलाना:

${invoiceNumber ? `📄 Bill #${invoiceNumber}\n` : ''}💰 बकाया: ${formattedAmount}
📅 Due Date: ${formattedDate}
⚠️ ${daysOverdue} दिन से overdue है।

कृपया जल्द से जल्द payment करें।`;
        } else {
            message = `🙏 नमस्ते ${customerName} जी,

${companyName} की तरफ से reminder:

${invoiceNumber ? `📄 Bill #${invoiceNumber}\n` : ''}💰 Amount: ${formattedAmount}
📅 Due Date: ${formattedDate}

समय पर payment करने के लिए धन्यवाद!`;
        }

        if (upiLink) {
            message += `\n\n💳 *UPI से Pay करें:*\n${upiLink}`;
        }

        message += '\n\n🙂 धन्यवाद!';

        return message;
    }

    /**
     * Send reminder via WhatsApp
     */
    async sendWhatsAppReminder(params: {
        phone: string;
        customerName: string;
        companyName: string;
        invoiceNumber?: string;
        amount: number;
        dueDate: string;
        upiId?: string;
        isOverdue: boolean;
        daysOverdue?: number;
    }): Promise<void> {
        let upiLink: string | undefined;

        if (params.upiId && this.settings.includeUPILink) {
            upiLink = upiPaymentService.generateLink({
                upiId: params.upiId,
                payeeName: params.companyName,
                amount: params.amount,
                transactionNote: params.invoiceNumber ? `Invoice #${params.invoiceNumber}` : undefined,
            });
        }

        const message = this.generateMessage({
            ...params,
            upiLink,
        });

        // Clean phone number
        let cleanPhone = params.phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
            cleanPhone = '91' + cleanPhone;
        }

        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

        if (Capacitor.isNativePlatform()) {
            window.open(whatsappUrl, '_system');
        } else {
            window.open(whatsappUrl, '_blank');
        }
    }

    /**
     * Send push notification reminder
     */
    async sendPushReminder(params: {
        customerName: string;
        amount: number;
        invoiceNumber?: string;
    }): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const permission = await LocalNotifications.checkPermissions();
            if (permission.display !== 'granted') {
                await LocalNotifications.requestPermissions();
            }

            await LocalNotifications.schedule({
                notifications: [{
                    id: Math.floor(Math.random() * 100000),
                    title: '💰 Payment Reminder',
                    body: `${params.customerName} से ₹${params.amount.toLocaleString('en-IN')} ${params.invoiceNumber ? `(Invoice #${params.invoiceNumber})` : ''} pending है`,
                    schedule: { at: new Date(Date.now() + 1000) },
                    sound: 'default',
                }],
            });
        } catch (error) {
            console.error('[ReminderService] Push notification failed:', error);
        }
    }

    /**
     * Bulk send reminders
     */
    async sendBulkReminders(reminders: {
        phone: string;
        customerName: string;
        companyName: string;
        invoiceNumber?: string;
        amount: number;
        dueDate: string;
        upiId?: string;
        isOverdue: boolean;
        daysOverdue?: number;
    }[]): Promise<{ sent: number; failed: number }> {
        let sent = 0;
        let failed = 0;

        for (const reminder of reminders) {
            try {
                await this.sendWhatsAppReminder(reminder);
                sent++;
                // Add delay between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch {
                failed++;
            }
        }

        return { sent, failed };
    }

    /**
     * Get reminder summary stats
     */
    async getReminderStats(): Promise<{
        totalPending: number;
        overdueCount: number;
        dueSoonCount: number;
        totalAmount: number;
        overdueAmount: number;
    }> {
        const pending = await this.getPendingReminders();

        const overdueItems = pending.filter(p => p.daysOverdue > 0);
        const dueSoonItems = pending.filter(p => p.daysToDue > 0 && p.daysToDue <= 7);

        return {
            totalPending: pending.length,
            overdueCount: overdueItems.length,
            dueSoonCount: dueSoonItems.length,
            totalAmount: pending.reduce((sum, p) => sum + (p.invoice.balanceDue || 0), 0),
            overdueAmount: overdueItems.reduce((sum, p) => sum + (p.invoice.balanceDue || 0), 0),
        };
    }
}

// Export singleton instance
export const paymentReminderService = new PaymentReminderService();
export default paymentReminderService;

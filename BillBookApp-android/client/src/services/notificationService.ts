/**
 * Notification Service - Manages daily sales notifications
 * Sends a daily notification at 9 AM with yesterday's sales summary
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { StorageService } from './storageService';
import { format } from 'date-fns';
import { collection, query, orderBy, limit, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BroadcastMessage } from '../types';

export interface DailySalesSummary {
    totalSales: number;
    date: string;
    rawDate: string;
}

export const NotificationService = {
    /** Module-level unsubscribe handles for cleanup */
    _broadcastUnsubscribe: null as (() => void) | null,
    /**
     * Initialize notification service and request permissions
     */
    async initialize(): Promise<void> {
        if (!Capacitor.isNativePlatform()) {
            console.log('Notifications only work on native platforms');
            return;
        }

        try {
            // 1. Local Notifications
            const permissionStatus = await LocalNotifications.requestPermissions();
            if (permissionStatus.display === 'granted') {
                console.log('Local Notification permissions granted');
                await this.scheduleDailyNotification();
            } else {
                console.log('Local Notification permissions denied');
            }

            // 2. Push Notifications
            await this.initializePush();

        } catch (error) {
            console.error('Failed to initialize notifications:', error);
        }
    },

    /**
     * Initialize Push Notifications (FCM)
     */
    async initializePush(): Promise<void> {
        try {
            const result = await PushNotifications.requestPermissions();
            if (result.receive === 'granted') {
                await PushNotifications.register();
            }

            // Listeners
            PushNotifications.addListener('registration', (token) => {
                console.log('Push Registration Token:', token.value);
                StorageService.saveFcmToken(token.value);
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.error('Push registration error: ', error.error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received: ', notification);
                // Can show a local notification here if needed, or let system handle it
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('Push action performed: ', notification);
            });

        } catch (e) {
            console.error('Error initializing push:', e);
        }
    },

    /**
     * Schedule daily notification at 9 AM with Yesterday's Sales Summary
     */
    async scheduleDailyNotification(): Promise<void> {
        try {
            // Guard: Prevent double-scheduling within the same day
            const lastScheduled = localStorage.getItem('app_last_notification_scheduled_date');
            const today = format(new Date(), 'yyyy-MM-dd');
            if (lastScheduled === today) {
                console.log('Daily notification already scheduled for today, skipping');
                return;
            }

            // Cancel existing daily notifications
            await LocalNotifications.cancel({ notifications: [{ id: 1 }] });

            // Get Yesterday's Sales Details
            const summary = await this.getYesterdaySalesSummary();
            const company = StorageService.getCompanyProfile();

            // Schedule notification for 9 AM daily
            const now = new Date();
            const scheduledTime = new Date();
            scheduledTime.setHours(9, 0, 0, 0); // 9 AM

            // If 9 AM has already passed today, schedule for tomorrow
            if (scheduledTime <= now) {
                scheduledTime.setDate(scheduledTime.getDate() + 1);
            }

            // Catchy/Flirty Lines for "Good Morning"
            const morningOrNoSaleLines = [
                "Tere bina business soona soona laage! 💔 Aaj toh record todna hai!",
                "Utho, Jaago, aur Dhandha Sambhalo! 🚀 Aaj macha dena hai!",
                "Paisa bolta hai! 💸 Let's make some money today.",
                "Sannata kyu hai bhai? 🤫 Aaj customers ki line lagani hai!",
                "Chai pee lo, phir customers ko gher lo! ☕ Ready for action?",
                "Aaj ka target: Sky is the limit! ☁️ Go get them!",
                "Bas dua mein yaad rakhna... aur cashbox mein paisa! 🤑"
            ];
            const randomLine = morningOrNoSaleLines[Math.floor(Math.random() * morningOrNoSaleLines.length)];

            const title = summary.totalSales > 0
                ? `Yesterday's Sales: ₹${summary.totalSales.toLocaleString()} 💰`
                : `Good Morning ${company?.name || 'Boss'}! ☀️`;

            const body = summary.totalSales > 0
                ? `${company?.name || 'Your Business'} made money yesterday! 💸\nTap to check details.`
                : `${randomLine}\nOpen BillBook & start billing!`;

            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: 1,
                        title: title,
                        body: body,
                        schedule: {
                            at: scheduledTime,
                            every: 'day',
                            allowWhileIdle: true
                        },
                        channelId: 'daily-sales',
                        smallIcon: 'ic_stat_name',
                        iconColor: '#4285F4',
                        sound: 'default',
                        extra: {
                            targetView: 'DAYBOOK',
                            date: summary.rawDate
                        }
                    },
                ],
            });

            console.log('Daily notification scheduled for:', scheduledTime);
            localStorage.setItem('app_last_notification_scheduled_date', today);
        } catch (error) {
            console.error('Failed to schedule daily notification:', error);
        }
    },

    /**
     * Send immediate notification with sales summary (Deprecated/Modified)
     */
    async sendSalesSummaryNotification(_summary: DailySalesSummary): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        // Logic same as schedule but immediate
    },

    /**
     * Get Yesterday's Total Sales Summary
     */
    async getYesterdaySalesSummary(): Promise<DailySalesSummary> {
        const allInvoices = await StorageService.getInvoices();

        // Calculate Yesterday's Date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // Filter valid sales for yesterday
        const yesterdaySales = allInvoices.filter(inv =>
            inv.date === yesterdayStr &&
            inv.type !== 'CREDIT_NOTE'
        );

        const totalSales = yesterdaySales.reduce((sum, inv) => sum + inv.total, 0);

        return {
            totalSales,
            date: format(yesterday, 'dd MMM yyyy'),
            rawDate: yesterdayStr
        };
    },

    /**
     * Create notification channels (Android)
     */
    async createChannels(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const channels = await LocalNotifications.listChannels();
            console.log('Existing channels:', channels);

            // Create daily sales channel if it doesn't exist
            if (!channels.channels.find(ch => ch.id === 'daily-sales')) {
                await LocalNotifications.createChannel({
                    id: 'daily-sales',
                    name: 'Daily Sales Reports',
                    description: 'Daily notifications with sales summary',
                    importance: 4, // High importance
                    visibility: 1, // Public
                    sound: 'default',
                    vibration: true,
                });
                console.log('Created daily-sales channel');
            }

            // Create updates channel
            if (!channels.channels.find(ch => ch.id === 'app-updates')) {
                await LocalNotifications.createChannel({
                    id: 'app-updates',
                    name: 'App Updates',
                    description: 'Notifications about new features and updates',
                    importance: 3, // Default importance
                    visibility: 1, // Public
                    sound: 'default',
                    vibration: true,
                });
                console.log('Created app-updates channel');
            }
        } catch (error) {
            console.error('Failed to create notification channels:', error);
        }
    },

    /**
     * Send update notification
     */
    async sendUpdateNotification(version: string, message: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        try {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: Date.now(),
                        title: `🎉 BillBook Updated - v${version}`,
                        body: message,
                        channelId: 'app-updates',
                        smallIcon: 'ic_stat_name',
                        iconColor: '#4285F4',
                        sound: 'default',
                    },
                ],
            });
        } catch (error) {
            console.error('Failed to send update notification:', error);
        }
    },

    /**
     * Handle notification tap
     */
    setupNotificationListeners(): void {
        if (!Capacitor.isNativePlatform()) return;

        LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
            console.log('Notification tapped:', notification);

            // Handle based on notification ID or channel
            if (notification.notification.channelId === 'daily-sales' || notification.notification.extra?.targetView === 'DAYBOOK') {
                const targetDate = notification.notification.extra?.date;
                // Dispatch event for AccountingApp to handle
                window.dispatchEvent(new CustomEvent('NAVIGATE_TO_VIEW', {
                    detail: {
                        view: 'DAYBOOK',
                        date: targetDate
                    }
                }));
            } else if (notification.notification.channelId === 'app-updates') {
                // Show changelog
                StorageService.setShouldShowChangelog(true);
            }
        });
    },

    /**
     * Check and send daily notification if needed
     */
    async checkAndSendDailyNotification(): Promise<void> {
        const lastNotificationDate = await StorageService.getLastNotificationDate();
        const today = format(new Date(), 'yyyy-MM-dd');

        if (lastNotificationDate !== today) {
            // Removed manual check/send logic as we are relying on scheduled notifications now.
            // But we can ensure schedule is updated.
            await this.scheduleDailyNotification();
            await StorageService.setLastNotificationDate(today);
        }
    },

    // ==========================================
    // PAYMENT REMINDER NOTIFICATIONS (SMART)
    // ==========================================

    /**
     * Schedule repetitive reminders for a specific payment (9 AM to 9 PM, every 3 hours)
     */
    async schedulePaymentReminder(reminder: any): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        try {
            // Base ID from reminder ID (last 8 digits of timestamp)
            const baseId = this.getReminderBaseId(reminder.id);
            const dueDate = new Date(reminder.dueDate);
            const now = new Date();

            // Schedule times: 9, 12, 15, 18, 21
            const hours = [9, 12, 15, 18, 21];
            const notifications: any[] = [];

            for (const hour of hours) {
                const scheduleTime = new Date(dueDate);
                scheduleTime.setHours(hour, 0, 0, 0);

                // Only schedule if time is in the future
                if (scheduleTime > now) {
                    notifications.push({
                        id: baseId + hour, // Unique ID per slot
                        title: `Payment Reminder: ${reminder.customerName}`,
                        body: `Payment of ₹${reminder.amount.toLocaleString()} is due today. Tap to Collect.`,
                        schedule: {
                            at: scheduleTime,
                            allowWhileIdle: true
                        },
                        channelId: 'daily-sales', // Reuse channel or create new
                        smallIcon: 'ic_stat_name',
                        iconColor: '#F97316', // Orange
                        sound: 'default',
                        extra: {
                            targetView: 'REMINDER',
                            reminderId: reminder.id
                        }
                    });
                }
            }

            if (notifications.length > 0) {
                await LocalNotifications.schedule({ notifications });
                console.log(`Scheduled ${notifications.length} reminders for ${reminder.customerName}`);
            }

        } catch (error) {
            console.error('Error scheduling payment reminder:', error);
        }
    },

    /**
     * Cancel all notifications for a specific reminder
     */
    async cancelPaymentReminder(reminderId: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const baseId = this.getReminderBaseId(reminderId);
            const hours = [9, 12, 15, 18, 21];
            const ids = hours.map(h => ({ id: baseId + h }));

            await LocalNotifications.cancel({ notifications: ids });
            console.log(`Cancelled reminders for ${reminderId}`);
        } catch (error) {
            console.error('Error canceling payment reminder:', error);
        }
    },

    /**
     * Helper to get integer ID from reminder string
     */
    getReminderBaseId(reminderId: string): number {
        try {
            // format: rem_1737039600000
            const timestamp = reminderId.split('_')[1];
            // Take last 7 digits to fit in int32 with buffer for hours
            return parseInt(timestamp.slice(-7)) * 100;
        } catch (e) {
            return Math.floor(Math.random() * 100000) * 100;
        }
    },

    // ==========================================
    // GLOBAL BROADCAST SYSTEM (ADMIN)
    // ==========================================

    /**
     * Subscribe to Global Broadcasts
     * Listens for new messages from Admin in real-time
     */
    subscribeToGlobalBroadcasts(): (() => void) | undefined {
        // Clean up any existing listener before creating a new one
        if (this._broadcastUnsubscribe) {
            this._broadcastUnsubscribe();
            this._broadcastUnsubscribe = null;
        }

        try {
            const broadcastsRef = collection(db, 'global_broadcasts');
            // Listen for broadcasts created in the last 24 hours only, or sort by date desc
            // For simplicity, just listen to the collection limit 5 recent
            const q = query(broadcastsRef, orderBy('date', 'desc'), limit(5));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const seenBroadcasts = JSON.parse(localStorage.getItem('seen_broadcasts') || '[]');

                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const broadcast = { id: change.doc.id, ...change.doc.data() } as BroadcastMessage;

                        // Check if already seen
                        if (!seenBroadcasts.includes(broadcast.id)) {
                            console.log('New Broadcast Received:', broadcast.title);

                            // Schedule/Show Notification
                            if (Capacitor.isNativePlatform()) {
                                await LocalNotifications.schedule({
                                    notifications: [{
                                        id: Date.now(),
                                        title: broadcast.title,
                                        body: broadcast.message,
                                        channelId: 'app-updates',
                                        smallIcon: 'ic_stat_name',
                                        iconColor: '#F43F5E', // Rose Color
                                        sound: 'default',
                                        schedule: { at: new Date(Date.now() + 1000) } // Immediate
                                    }]
                                });
                            }

                            // Mark as seen locally
                            seenBroadcasts.push(broadcast.id);
                            localStorage.setItem('seen_broadcasts', JSON.stringify(seenBroadcasts));
                        }
                    }
                });
            });

            // Store for cleanup
            this._broadcastUnsubscribe = unsubscribe;
            return unsubscribe;
        } catch (error) {
            console.error('Error subscribing to broadcasts:', error);
            return undefined;
        }
    },

    /**
     * Unsubscribe from Global Broadcasts — call during component unmount / cleanup
     */
    unsubscribeFromGlobalBroadcasts(): void {
        if (this._broadcastUnsubscribe) {
            this._broadcastUnsubscribe();
            this._broadcastUnsubscribe = null;
            console.log('Unsubscribed from global broadcasts');
        }
    },

    /**
     * Send a Broadcast Message (Admin Only)
     */
    async sendBroadcast(title: string, message: string, type: 'INFO' | 'ALERT' | 'PROMO' = 'INFO'): Promise<void> {
        try {
            // 1. Save to Firestore (History/Sync)
            const broadcast: BroadcastMessage = {
                id: `msg_${Date.now()}`,
                title,
                message,
                date: new Date().toISOString(),
                type
            };
            await setDoc(doc(db, 'global_broadcasts', broadcast.id), broadcast);
            console.log('Broadcast saved to Firestore');
        } catch (error) {
            console.error('Error sending broadcast:', error);
            throw error;
        }
    },

    /**
     * Send Push Notification to ALL Users (Cloud Messaging)
     * Note: This requires the Firebase Server Key (Legacy)
     */
    async sendPushBroadcast(title: string, message: string, serverKey: string): Promise<boolean> {
        if (!serverKey) return false;

        try {
            const tokens = await StorageService.getAllFcmTokens();
            if (tokens.length === 0) {
                console.log('No users found to send push.');
                return false;
            }

            console.log(`Sending push to ${tokens.length} users...`);

            // FCM Legacy Batch limit is 1000. We will chunk by 500 to be safe.
            const chunks = [];
            for (let i = 0; i < tokens.length; i += 500) {
                chunks.push(tokens.slice(i, i + 500));
            }

            for (const chunk of chunks) {
                await fetch('https://fcm.googleapis.com/fcm/send', {
                    method: 'POST',
                    headers: {
                        'Authorization': `key=${serverKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        registration_ids: chunk,
                        notification: {
                            title: title,
                            body: message,
                            sound: 'default'
                        },
                        priority: 'high' // Deliver even in doze mode
                    })
                });
            }

            return true;
        } catch (e) {
            console.error('Failed to send push broadcast', e);
            return false;
        }
    }
};

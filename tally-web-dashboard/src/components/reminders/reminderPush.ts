import { reminderPushPublicKey } from './pushPublicKey';
import { supabase } from '@/lib/supabase';

const vapidKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || reminderPushPublicKey).trim();
const decodeKey = (value: string) => {
    const binary = atob((value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, c => c.charCodeAt(0));
};

// Must be called from a user action; the private VAPID key stays on the server.
export async function enableReminderPush(userId: string, companyId: string) {
    if (!vapidKey) throw new Error('Push notifications are not configured yet.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Push notifications are not supported on this device.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');
    const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Notification service is unavailable. Reload the app and try again.')), 10000)),
    ]);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(vapidKey) });
    const json = subscription.toJSON();
    const { error } = await supabase.from('reminder_push_subscriptions').upsert({
        user_id: userId, company_id: companyId, endpoint: json.endpoint,
        p256dh: json.keys?.p256dh, auth: json.keys?.auth,
    }, { onConflict: 'user_id,company_id,endpoint' });
    if (error) throw error;
}

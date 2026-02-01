import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
const initializeFirebaseAdmin = () => {
    if (getApps().length === 0) {
        // Service account credentials from environment variables
        const serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: process.env.FIREBASE_CERT_URL
        };

        initializeApp({
            credential: cert(serviceAccount as any)
        });
    }
    return { messaging: getMessaging(), firestore: getFirestore() };
};

// Send notification to a single device
export const sendNotification = async (
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
) => {
    const { messaging } = initializeFirebaseAdmin();

    try {
        const message = {
            notification: {
                title,
                body
            },
            data: data || {},
            token,
            android: {
                priority: 'high' as const,
                notification: {
                    channelId: 'loan_reminders',
                    priority: 'high' as const,
                    sound: 'default'
                }
            }
        };

        const response = await messaging.send(message);
        console.log('Successfully sent message:', response);
        return { success: true, messageId: response };
    } catch (error: any) {
        console.error('Error sending message:', error);
        return { success: false, error: error.message };
    }
};

// Send notification to multiple devices
export const sendMulticastNotification = async (
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
) => {
    const { messaging } = initializeFirebaseAdmin();

    if (tokens.length === 0) {
        return { success: false, error: 'No tokens provided' };
    }

    try {
        const message = {
            notification: {
                title,
                body
            },
            data: data || {},
            tokens,
            android: {
                priority: 'high' as const,
                notification: {
                    channelId: 'loan_reminders',
                    priority: 'high' as const,
                    sound: 'default'
                }
            }
        };

        const response = await messaging.sendEachForMulticast(message);
        console.log('Successfully sent multicast:', response.successCount, 'success,', response.failureCount, 'failed');
        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        };
    } catch (error: any) {
        console.error('Error sending multicast:', error);
        return { success: false, error: error.message };
    }
};

// Get all FCM tokens for a company
export const getCompanyTokens = async (companyId: string): Promise<string[]> => {
    const { firestore } = initializeFirebaseAdmin();

    try {
        const tokensSnap = await firestore
            .collection('fcm_tokens')
            .where('companyId', '==', companyId)
            .get();

        return tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
    } catch (error) {
        console.error('Error fetching tokens:', error);
        return [];
    }
};

// Get FCM token for a specific customer
export const getCustomerToken = async (customerId: string): Promise<string | null> => {
    const { firestore } = initializeFirebaseAdmin();

    try {
        const tokenSnap = await firestore
            .collection('fcm_tokens')
            .where('customerId', '==', customerId)
            .limit(1)
            .get();

        if (tokenSnap.empty) return null;
        return tokenSnap.docs[0].data().token || null;
    } catch (error) {
        console.error('Error fetching customer token:', error);
        return null;
    }
};

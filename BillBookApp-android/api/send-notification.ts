import type { VercelRequest, VercelResponse } from '@vercel/node';

// Firebase Admin SDK - uses environment variables from Vercel
let admin: any = null;
let initialized = false;

async function initializeFirebase() {
    if (initialized) return;

    try {
        const adminModule = await import('firebase-admin');
        admin = adminModule.default;

        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                }),
            });
        }
        initialized = true;
        console.log('Firebase Admin initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
        throw error;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        await initializeFirebase();

        const { token, tokens, title, body, data, topic } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        const message: any = {
            notification: {
                title,
                body,
            },
            android: {
                priority: 'high' as const,
                notification: {
                    channelId: 'default',
                    priority: 'high' as const,
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            data: data || {},
        };

        let result;

        if (topic) {
            // Send to a topic (e.g., 'all-users', 'due-reminders')
            message.topic = topic;
            result = await admin.messaging().send(message);
            console.log('Topic notification sent:', result);
        } else if (tokens && Array.isArray(tokens) && tokens.length > 0) {
            // Send to multiple tokens
            message.tokens = tokens;
            result = await admin.messaging().sendEachForMulticast(message);
            console.log('Multicast notification sent:', result);
        } else if (token) {
            // Send to single token
            message.token = token;
            result = await admin.messaging().send(message);
            console.log('Single notification sent:', result);
        } else {
            return res.status(400).json({ error: 'Either token, tokens array, or topic is required' });
        }

        return res.status(200).json({
            success: true,
            result,
            message: 'Notification sent successfully'
        });

    } catch (error: any) {
        console.error('Error sending notification:', error);
        return res.status(500).json({
            error: 'Failed to send notification',
            details: error.message
        });
    }
}

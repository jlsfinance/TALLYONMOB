/* eslint-disable no-undef */
/**
 * @deprecated LEGACY — Firebase Cloud Messaging service worker.
 * Push notifications currently still use FCM.
 * Config is injected at build/registration time. If no config is available,
 * the service worker gracefully handles missing initialization.
 * See client/src/index.tsx or main.tsx for registration logic.
 */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// Config is expected to be injected via env vars at build time.
// In the service worker, we read from self.FIREBASE_CONFIG (set before registration)
// or fall back gracefully.
try {
  const config = self.FIREBASE_CONFIG || {
    apiKey: self.__FIREBASE_API_KEY__ || '',
    authDomain: self.__FIREBASE_AUTH_DOMAIN__ || '',
    projectId: self.__FIREBASE_PROJECT_ID__ || '',
    storageBucket: self.__FIREBASE_STORAGE_BUCKET__ || '',
    messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || '',
    appId: self.__FIREBASE_APP_ID__ || ''
  };

  if (config.apiKey && config.projectId) {
    firebase.initializeApp(config);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      const notificationTitle = payload.notification?.title || 'New Notification';
      const notificationOptions = {
        body: payload.notification?.body,
        icon: '/logo.png',
        badge: '/logo.png',
        data: payload.data,
        requireInteraction: true
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } else {
    console.warn('[firebase-messaging-sw.js] No Firebase config available. FCM disabled.');
  }
} catch (e) {
  console.warn('[firebase-messaging-sw.js] Failed to initialize:', e);
}

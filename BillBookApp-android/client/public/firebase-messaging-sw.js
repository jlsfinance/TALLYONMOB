/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyDOhuszbQuXpMO0WY-FXzkyY8dABjj4MHg",
    authDomain: "sample-firebase-ai-app-1f72d.firebaseapp.com",
    projectId: "sample-firebase-ai-app-1f72d",
    storageBucket: "sample-firebase-ai-app-1f72d.firebasestorage.app",
    messagingSenderId: "231225025529",
    appId: "1:231225025529:web:e079fe0aa1be713625d328"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification?.title || 'New Notification';
    const notificationOptions = {
        body: payload.notification?.body,
        icon: '/logo.png',
        badge: '/logo.png',
        data: payload.data,
        requireInteraction: true // Keeps notification visible until clicked
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

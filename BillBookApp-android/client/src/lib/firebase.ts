/**
 * @deprecated LEGACY — Firebase is no longer used for primary data storage.
 * Kept as reference and for remaining Firebase-dependent features:
 * - FCM push notifications (firebase-messaging-sw.js)
 * - Global broadcast system (notificationService.ts)
 * - Analytics tracking (analyticsService.ts)
 * - Public bill viewing (PublicBillView.tsx)
 * 
 * Hardcoded API keys have been replaced with environment variable references.
 * Configure via VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc.
 * or set VITE_FIREBASE_PROJECT_ID to auto-configure.
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Read from environment variables with fallback (for existing deployments)
const getFirebaseConfig = () => {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || "";
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "";
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "";
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "";
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "";
  const appId = import.meta.env.VITE_FIREBASE_APP_ID || "";

  // If no env vars are set, use the project ID as a hint for auto-config
  if (!apiKey && !projectId) {
    console.warn(
      "[firebase.ts] No Firebase env vars found (VITE_FIREBASE_*). " +
      "Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, etc. in .env"
    );
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
};

const firebaseConfig = getFirebaseConfig();

// Application 1: Accounting (Default)
const accountingApp = getApps().length > 0 && getApps().find(a => a.name === 'accounting-app')
  ? getApp('accounting-app')
  : initializeApp(firebaseConfig, 'accounting-app');

export const auth = getAuth(accountingApp);
export const db = getFirestore(accountingApp);

// Enable offline persistence for Accounting DB (Default)
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Accounting Persistence Error:", err.code);
  });
}

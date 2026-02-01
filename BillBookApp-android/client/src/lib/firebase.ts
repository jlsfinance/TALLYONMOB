import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Assuming FirebaseConfig type is defined elsewhere or needs to be added.
// For the purpose of this edit, we'll assume it's available or will be handled.
// If not, you might need to define it, e.g.:
// type FirebaseConfig = {
//   apiKey: string;
//   authDomain: string;
//   projectId: string;
//   storageBucket: string;
//   messagingSenderId: string;
//   appId: string;
// };

const firebaseConfigAccounting = {
  apiKey: "AIzaSyDOhuszbQuXpMO0WY-FXzkyY8dABjj4MHg",
  authDomain: "sample-firebase-ai-app-1f72d.firebaseapp.com",
  projectId: "sample-firebase-ai-app-1f72d",
  storageBucket: "sample-firebase-ai-app-1f72d.firebasestorage.app",
  messagingSenderId: "231225025529",
  appId: "1:231225025529:web:e079fe0aa1be713625d328"
};

const firebaseConfigRecords = {
  apiKey: "AIzaSyC9osscWhA01zJU1VgSKdqH3zoZx_SuOnw",
  authDomain: "jls-finance-company.firebaseapp.com",
  projectId: "jls-finance-company",
  storageBucket: "jls-finance-company.firebasestorage.app",
  messagingSenderId: "550122742532",
  appId: "1:550122742532:web:e079fe0aa1be713625d328" // Approx ID or placeholder
};

// Application 1: Accounting (Default)
const accountingApp = getApps().length > 0 && getApps().find(a => a.name === 'accounting-app')
  ? getApp('accounting-app')
  : initializeApp(firebaseConfigAccounting, 'accounting-app');

export const auth = getAuth(accountingApp);
export const db = getFirestore(accountingApp);

// Application 2: Records (Ledger Module - JLS Suite)
const recordsApp = getApps().length > 0 && getApps().find(a => a.name === 'records-app')
  ? getApp('records-app')
  : initializeApp(firebaseConfigRecords, 'records-app');

export const recordsAuth = getAuth(recordsApp);
export const recordsDb = getFirestore(recordsApp);

// Enable offline persistence for Accounting DB (Default)
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Accounting Persistence Error:", err.code);
  });
  // Optional: Enable for Records DB too if needed, but managing dual persistence might be tricky in one tab.
  // We'll leave it simple for now.
}
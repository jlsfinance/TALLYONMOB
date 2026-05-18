/**
 * @deprecated LEGACY — FirebaseService is no longer the primary data layer.
 * The project has migrated to Supabase (supabaseDataService.ts) for all data operations.
 * 
 * Kept as reference and for remaining non-data Firebase features:
 * - FeedbackModal.tsx uses saveDocument() for user feedback
 * - Settings.tsx uses isReady() for cloud status indicator
 * - AccountingApp.tsx uses isReady() for cloud status indicator
 * 
 * All data operations (CRUD) should use StorageService + supabaseDataService instead.
 */
import { collection, getDocs, setDoc, doc, writeBatch, deleteDoc } from 'firebase/firestore';
import { FirebaseConfig } from '../types';
import { db } from '../lib/firebase';

export const FirebaseService = {
  // Deprecated init, kept for compatibility but does nothing as we init statically
  init: (_config: FirebaseConfig): boolean => {
    console.log("Firebase already initialized via lib/firebase");
    return true;
  },

  isReady: () => true,

  testConnection: async (): Promise<{ success: boolean; message: string }> => {
    try {
      // Try to write a test document
      const testRef = doc(db, 'system', 'connection_test');
      await setDoc(testRef, {
        status: 'connected',
        timestamp: new Date().toISOString()
      });
      return { success: true, message: "Connection Successful! Read/Write access confirmed." };
    } catch (error: any) {
      console.error("Test Connection Failed:", error);
      if (error.code === 'permission-denied') {
        return { success: false, message: "Permission Denied. Please ensure you are logged in and your Firestore Rules allow authenticated access." };
      }
      return { success: false, message: error.message || "Unknown error during connection test." };
    }
  },

  // Generic Fetch
  fetchCollection: async <T>(collectionName: string): Promise<T[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map(doc => doc.data() as T);
    } catch (error: any) {
      console.error(`Error fetching ${collectionName}:`, error);
      // Throw permission errors so callers can distinguish them from empty results
      if (error.code === 'permission-denied') {
        throw new Error(`Permission denied accessing collection '${collectionName}'`);
      }
      // For other errors, return empty array (may hide transient issues,
      // but maintains backward compatibility)
      return [];
    }
  },

  // Generic Save (Set/Overwrite)
  saveDocument: async (collectionName: string, id: string, data: any) => {
    try {
      await setDoc(doc(db, collectionName, id), data);
    } catch (error) {
      console.error(`Error saving to ${collectionName}:`, error);
    }
  },

  // Generic Delete
  deleteDocument: async (collectionName: string, id: string) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
    }
  },

  // Batch Save (for initial sync)
  batchSave: async (collectionName: string, items: any[]) => {
    try {
      const BATCH_LIMIT = 500;

      if (items.length === 0) {
        console.log(`Batch save: no items to save to ${collectionName}`);
        return;
      }

      let totalSaved = 0;

      // Split items into chunks of BATCH_LIMIT and commit each independently
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const chunk = items.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);

        chunk.forEach(item => {
          const ref = doc(db, collectionName, item.id);
          batch.set(ref, item);
        });

        await batch.commit();
        totalSaved += chunk.length;
        console.log(`Batch chunk saved ${chunk.length} items (${totalSaved}/${items.length} total) to ${collectionName}`);
      }

      console.log(`Batch save complete: ${totalSaved} items saved to ${collectionName}`);
    } catch (error) {
      console.error("Batch save error", error);
    }
  },

  // Purge all data for account deletion (Google Play Requirement)
  purgeUserPath: async (userId: string) => {
    try {
      const collections = ['products', 'customers', 'invoices', 'purchases', 'payments', 'expenses', 'company'];
      const userPath = `users/${userId}`;

      for (const collName of collections) {
        const q = await getDocs(collection(db, `${userPath}/${collName}`));
        if (q.empty) continue;

        const batch = writeBatch(db);
        q.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      // Also delete the company profile if it's stored in a different location (per CompanyContext)
      // Actually CompanyContext uses /companies/{companyId} where user is owner.
      // We'll handle that separately if needed, but for now purge StorageService data.
    } catch (e) {
      console.error("Purge Error:", e);
    }
  }
};

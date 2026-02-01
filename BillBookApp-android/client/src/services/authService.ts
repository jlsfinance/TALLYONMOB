
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { FirebaseService } from './firebaseService';

let auth: any = null;

export const AuthService = {
    init: () => {
        if (!FirebaseService.isReady()) return false;
        try {
            auth = getAuth();
            return true;
        } catch (e) {
            console.error("Auth Init Error", e);
            return false;
        }
    },

    login: async (email: string, pass: string) => {
        if (!auth) AuthService.init();
        if (!auth) throw new Error("Firebase Auth not initialized.");
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        return cred.user;
    },

    register: async (email: string, pass: string) => {
        if (!auth) AuthService.init();
        if (!auth) throw new Error("Firebase Auth not initialized.");
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        return cred.user;
    },

    logout: async () => {
        if (!auth) return;
        await signOut(auth);
    },

    subscribe: (callback: (user: User | null) => void) => {
        if (!auth) AuthService.init();
        if (!auth) {
            callback(null);
            return () => {};
        }
        return onAuthStateChanged(auth, callback);
    }
};

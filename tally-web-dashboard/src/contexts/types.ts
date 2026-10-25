import { ReactNode } from 'react';

export interface User {
    id: string;
    email?: string;
    full_name?: string;
}

export interface Company {
    id: string;
    name: string;
    last_sync_at?: string;
    subscription_plan?: string;
}

export interface AuthContextType {
    user: User | null;
    companies: Company[];
    selectedCompany: Company | null;
    userRole: string;
    loading: boolean;
    appMode: 'tally' | 'billing' | null;
    setAppMode: (mode: 'tally' | 'billing' | null) => void;
    signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
    signUp: (email: string, password: string, fullName: string) => Promise<{ data: any; error: any }>;
    verifyOtp: (email: string, token: string, type?: string) => Promise<{ data: any; error: any }>;
    sendVerificationEmail: (email: string) => Promise<{ error: any }>;
    signInWithGoogle: () => Promise<{ data: any; error: any }>;
    signOut: () => Promise<void>;
    selectCompany: (company: Company) => void;
    deleteCompany: (companyId: string) => Promise<{ success: boolean; error?: any }>;
    refreshCompanies: () => Promise<void>;
    verify2FALogin: (tempToken: string, userId: string, email: string, code: string) => Promise<{ data: any; error: any }>;
    setup2FA: () => Promise<{ data: any; error: any }>;
    enable2FA: (secret: string, code: string) => Promise<{ data: any; error: any }>;
    disable2FA: (code: string) => Promise<{ data: any; error: any }>;
    get2FAStatus: () => Promise<{ data: any; error: any }>;
}

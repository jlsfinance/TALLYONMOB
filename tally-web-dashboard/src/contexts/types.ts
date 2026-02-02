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
    loading: boolean;
    appMode: 'tally' | 'billing' | null;
    setAppMode: (mode: 'tally' | 'billing' | null) => void;
    signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
    signUp: (email: string, password: string, fullName: string) => Promise<{ data: any; error: any }>;
    signOut: () => Promise<void>;
    selectCompany: (company: Company) => void;
    deleteCompany: (companyId: string) => Promise<{ success: boolean; error?: any }>;
    refreshCompanies: () => Promise<void>;
}

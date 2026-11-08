import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';

type LicenseStatus = 'active' | 'trial' | 'expired' | 'suspended' | 'blocked' | 'none' | 'revoked' | 'unknown';
type UserRole = 'super_admin' | 'admin' | 'sales_manager' | 'support_agent' | 'account_manager' | 'user';

interface LicenseInfo {
    status: LicenseStatus;
    planName: string;
    planSlug: string;
    expiryDate: string;
    daysLeft: number;
    licenseKey: string;
    features: string[];
    companyLimit: number;
    isAdmin: boolean;
    isSuperAdmin: boolean;
}

interface LicenseGateContextType {
    license: LicenseInfo;
    isLoading: boolean;
    licenseError: string | null;
    hasFeature: (feature: string) => boolean;
    canAccess: (feature: string) => boolean;
    isReadOnly: boolean;
    refresh: () => Promise<void>;
}

const defaultLicense: LicenseInfo = {
    status: 'none',
    planName: 'None',
    planSlug: '',
    expiryDate: '',
    daysLeft: 0,
    licenseKey: '',
    features: [],
    companyLimit: 0,
    isAdmin: false,
    isSuperAdmin: false,
};

const LicenseGateContext = createContext<LicenseGateContextType>({
    license: defaultLicense,
    isLoading: true,
    licenseError: null,
    hasFeature: () => false,
    canAccess: () => false,
    isReadOnly: true,
    refresh: async () => {},
});

export function useLicenseGate() {
    return useContext(LicenseGateContext);
}

// Features that are blocked when license is expired
const EXPIRED_BLOCKED = [
    'sync', 'auto_sync', 'reports_export', 'pdf_export', 'excel_export',
    'whatsapp_share', 'add_company', 'add_user', 'advanced_reports',
    'create', 'edit', 'delete',
];

// Features that require active license
const PREMIUM_FEATURES = [
    'sync', 'auto_sync', 'reports_export', 'pdf_export', 'excel_export',
    'whatsapp_share', 'add_company', 'add_user', 'advanced_reports',
    'gst_reports', 'e_way_bill', 'bank_reconciliation', 'ai_entry',
    'sales_analytics', 'business_insights', 'tds_tcs',
];

// Plan feature mapping
const PLAN_FEATURES: Record<string, string[]> = {
    trial: ['dashboard', 'parties', 'daybook', 'limited_sync', 'basic_reports'],
    monthly: ['dashboard', 'parties', 'daybook', 'sync', 'reports', 'pdf_export', 'excel_export', 'whatsapp_share', 'advanced_reports', 'gst_reports'],
    quarterly: ['dashboard', 'parties', 'daybook', 'sync', 'reports', 'pdf_export', 'excel_export', 'whatsapp_share', 'advanced_reports', 'gst_reports', 'e_way_bill', 'bank_reconciliation'],
    half_yearly: ['dashboard', 'parties', 'daybook', 'sync', 'reports', 'pdf_export', 'excel_export', 'whatsapp_share', 'advanced_reports', 'gst_reports', 'e_way_bill', 'bank_reconciliation', 'ai_entry'],
    yearly: ['dashboard', 'parties', 'daybook', 'sync', 'reports', 'pdf_export', 'excel_export', 'whatsapp_share', 'advanced_reports', 'gst_reports', 'e_way_bill', 'bank_reconciliation', 'ai_entry', 'sales_analytics', 'business_insights'],
    lifetime: ['dashboard', 'parties', 'daybook', 'sync', 'reports', 'pdf_export', 'excel_export', 'whatsapp_share', 'advanced_reports', 'gst_reports', 'e_way_bill', 'bank_reconciliation', 'ai_entry', 'sales_analytics', 'business_insights', 'tds_tcs'],
};

const PLAN_LIMITS: Record<string, number> = {
    trial: 1,
    monthly: -1, // unlimited
    quarterly: -1, // unlimited
    half_yearly: -1, // unlimited
    yearly: -1, // unlimited
    lifetime: -1, // unlimited
};

export function LicenseGateProvider({ children }: { children: ReactNode }) {
    const { user, selectedCompany } = useAuth() as any;
    const [license, setLicense] = useState<LicenseInfo>(defaultLicense);
    const [isLoading, setIsLoading] = useState(true);
    const [licenseError, setLicenseError] = useState<string | null>(null);

    const requestVersion = useRef(0);
    const checkLicense = useCallback(async () => {
        const version = ++requestVersion.current;
        if (!user?.id) { setLicense(defaultLicense); setIsLoading(false); return; }
        try {
            let result;
            for (let attempt=0; attempt<3; attempt++) {
                result = await supabase.rpc('get_subscription_access').abortSignal(AbortSignal.timeout(12000));
                if (!result.error) break;
                if (['42501','PGRST301','PGRST302'].includes(result.error.code)) break;
                if (attempt<2) await new Promise(resolve => setTimeout(resolve, 500*(attempt+1)));
            }
            if (result?.error) throw result.error;
            if (!result?.data || typeof result.data.valid !== 'boolean') throw new Error('Invalid subscription response');
            if (version !== requestVersion.current) return;
            const r=result.data;
            const status: LicenseStatus = r.valid!==true && ['active','trial'].includes(r.status) ? 'unknown' : r.status==='no_license' ? 'none' : ['active','trial','expired','suspended','blocked','revoked'].includes(r.status) ? r.status : 'unknown';
            setLicense({ status, planName:r.plan_name || 'None', planSlug:r.plan_slug || '', expiryDate:r.expiry_date || '',
                daysLeft:r.days_left || 0, licenseKey:r.license_key || '', features:PLAN_FEATURES[r.plan_slug] || [],
                companyLimit:r.company_limit ?? 0, isAdmin:r.is_admin===true, isSuperAdmin:r.is_admin===true });
            setLicenseError(null);
        } catch (err) {
            if (version !== requestVersion.current) return;
            // Keep the last server result visible; availability errors never become expiry.
            setLicenseError('Subscription verification is temporarily unavailable. Retrying automatically.');
        } finally { if (version === requestVersion.current) setIsLoading(false); }
    }, [user?.id]);

    useEffect(() => {
        setLicense(defaultLicense); setLicenseError(null); setIsLoading(true);
        void checkLicense();
        const timer=window.setInterval(() => void checkLicense(),30000);
        const focus=() => void checkLicense();
        window.addEventListener('focus',focus);
        return () => { requestVersion.current++; window.clearInterval(timer); window.removeEventListener('focus',focus); };
    }, [checkLicense]);
    const expiryReached = !!license.expiryDate && new Date(license.expiryDate).getTime()<=Date.now();
    const verifiedActive = !licenseError && !expiryReached && ['active','trial'].includes(license.status);

    const hasFeature = useCallback((feature: string): boolean => {
        if (license.isSuperAdmin) return true;
        if (!verifiedActive) return ![...EXPIRED_BLOCKED,...PREMIUM_FEATURES].includes(feature);
        return true; // All three duration plans and the 30-day trial grant app access.
    }, [license.isSuperAdmin, verifiedActive]);
    const canAccess = useCallback((feature: string) => license.isSuperAdmin || (verifiedActive && hasFeature(feature)), [license.isSuperAdmin,verifiedActive,hasFeature]);
    const isReadOnly = !license.isSuperAdmin && !verifiedActive;

    return (
        <LicenseGateContext.Provider value={{ license, isLoading, licenseError, hasFeature, canAccess, isReadOnly, refresh: checkLicense }}>
            {children}
        </LicenseGateContext.Provider>
    );
}

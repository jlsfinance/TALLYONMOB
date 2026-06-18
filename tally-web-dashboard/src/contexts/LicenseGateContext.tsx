import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';

type LicenseStatus = 'active' | 'trial' | 'expired' | 'suspended' | 'blocked' | 'none';
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
    monthly: 1,
    quarterly: 2,
    half_yearly: 3,
    yearly: 5,
    lifetime: -1, // unlimited
};

export function LicenseGateProvider({ children }: { children: ReactNode }) {
    const { user, selectedCompany } = useAuth() as any;
    const [license, setLicense] = useState<LicenseInfo>(defaultLicense);
    const [isLoading, setIsLoading] = useState(true);

    const checkLicense = useCallback(async () => {
        if (!user?.id) {
            setLicense(defaultLicense);
            setIsLoading(false);
            return;
        }

        try {
            // Check if super admin
            const isSuperAdmin = user.email === 'lovneetrathi@gmail.com';

            // Get active license
            const { data: lic } = await supabase
                .from('user_licenses')
                .select('*, plan:subscription_plans(*)')
                .eq('user_id', user.id)
                .in('status', ['active', 'suspended'])
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (!lic) {
                // No license — check for active trial in trial_history
                const { data: trial } = await supabase
                    .from('trial_history')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('trial_used', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (trial && new Date(trial.trial_end) > new Date()) {
                    // Active trial
                    const daysLeft = Math.ceil((new Date(trial.trial_end).getTime() - Date.now()) / 86400000);
                    setLicense({
                        status: 'trial',
                        planName: 'Trial',
                        planSlug: 'trial',
                        expiryDate: trial.trial_end,
                        daysLeft,
                        licenseKey: 'TRIAL',
                        features: PLAN_FEATURES.trial,
                        companyLimit: 1,
                        isAdmin: isSuperAdmin,
                        isSuperAdmin,
                    });
                } else {
                    setLicense({ ...defaultLicense, isAdmin: isSuperAdmin, isSuperAdmin });
                }
                setIsLoading(false);
                return;
            }

            // Has license
            const now = new Date();
            const expiry = new Date(lic.expiry_date);
            const plan = lic.plan as any;
            const planSlug = plan?.slug || '';
            const features = PLAN_FEATURES[planSlug] || plan?.features || [];
            const companyLimit = PLAN_LIMITS[planSlug] || 1;
            const daysLeft = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / 86400000));

            let status: LicenseStatus = lic.status as LicenseStatus;
            if (expiry <= now) status = 'expired';

            setLicense({
                status,
                planName: plan?.name || 'Unknown',
                planSlug,
                expiryDate: lic.expiry_date,
                daysLeft,
                licenseKey: lic.license_key,
                features,
                companyLimit,
                isAdmin: isSuperAdmin || ['super_admin', 'admin'].includes(status as any),
                isSuperAdmin,
            });
        } catch (err) {
            console.error('License check failed:', err);
            setLicense(defaultLicense);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id, user?.email]);

    useEffect(() => {
        checkLicense();
    }, [checkLicense]);

    const hasFeature = useCallback((feature: string): boolean => {
        if (license.isSuperAdmin) return true;
        if (license.status === 'expired' || license.status === 'blocked' || license.status === 'suspended') {
            return !EXPIRED_BLOCKED.includes(feature);
        }
        if (license.status === 'none') return ['dashboard', 'parties'].includes(feature);
        return license.features.includes(feature) || license.features.includes('*');
    }, [license]);

    const canAccess = useCallback((feature: string): boolean => {
        if (license.isSuperAdmin) return true;
        if (license.status === 'expired' || license.status === 'blocked') return false;
        if (license.status === 'none') return false;
        return hasFeature(feature);
    }, [license, hasFeature]);

    // isReadOnly sirf tab true jab license expired/blocked/suspended hai
    // 'none' (no license) pe app usable hai, sirf banner dikhega
    const isReadOnly = license.status === 'expired' || license.status === 'blocked' || license.status === 'suspended';

    return (
        <LicenseGateContext.Provider value={{ license, isLoading, hasFeature, canAccess, isReadOnly, refresh: checkLicense }}>
            {children}
        </LicenseGateContext.Provider>
    );
}

import { type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { Shield } from 'lucide-react';

export default function SubscriptionGate({ children }: { children: ReactNode }) {
    const { license, isLoading, isReadOnly, licenseError, refresh } = useLicenseGate();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    if (['/subscription','/license','/select-company','/onboarding','/support','/settings'].includes(pathname) || license.isAdmin) return <>{children}</>;
    if (isLoading) return null;
    if (!isReadOnly) return <>{children}</>;

    return (
        <div className="min-h-screen bg-[var(--bg)] flex flex-col">
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-bold"><Shield size={16} />
                        {licenseError || (license.status === 'blocked' || license.status === 'revoked' ? 'Access restricted. Contact support.' : license.status === 'suspended' ? 'Account suspended. Contact support.' : 'Your trial or subscription has ended. Choose a plan to continue.')}
                    </p>
                    <button type="button" onClick={() => navigate('/subscription')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">View plans</button>
                    <button type="button" onClick={() => void refresh()} className="text-sm underline">Retry verification</button>
                </div>
            </div>
            <p className="p-6 text-sm">Your saved data is retained. Paid features will be available after your subscription is verified.</p>
        </div>
    );
}

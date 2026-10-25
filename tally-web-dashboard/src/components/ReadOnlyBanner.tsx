import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Crown, X, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

export default function ReadOnlyBanner() {
    const { license, isReadOnly } = useLicenseGate();
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(false);

    // Sirf expired/blocked/suspended pe dikhao, 'none' pe mat dikhao (app usable hai)
    if (!isReadOnly || dismissed) return null;

    return (
        <div className="bg-gradient-to-r from-red-500/15 to-amber-500/15 border-b border-red-500/20 px-3 py-2">
            <div className="flex items-center justify-between max-w-7xl mx-auto">
                <div className="flex items-center gap-2 min-w-0">
                    <Shield size={14} className="text-red-500 shrink-0" />
                    <span className="text-[11px] font-bold text-red-400 truncate">
                        {license.status === 'expired' && `Subscription expired ${Math.abs(license.daysLeft)} days ago. Read-only mode.`}
                        {license.status === 'blocked' && 'Account blocked. Contact support.'}
                        {license.status === 'suspended' && 'Account suspended. Contact support.'}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => navigate(-1)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 text-[var(--text-muted)] hover:bg-white/10 flex items-center gap-1">
                        <ArrowLeft size={10} /> Back
                    </button>
                    <a href="/subscription" className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center gap-1">
                        <Crown size={10} /> Upgrade
                    </a>
                    <button onClick={() => setDismissed(true)} className="p-1 rounded hover:bg-white/5">
                        <X size={12} className="text-[var(--text-muted)]" />
                    </button>
                </div>
            </div>
        </div>
    );
}

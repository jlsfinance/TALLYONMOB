import { useLicenseGate } from '@/contexts/LicenseGateContext';

const tone: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    trial: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    expired: 'bg-red-500/10 text-red-600 border-red-500/20',
    suspended: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    blocked: 'bg-red-500/10 text-red-600 border-red-500/20',
    none: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

export default function LicenseBadge({ compact = false }: { compact?: boolean }) {
    const { license, isLoading } = useLicenseGate();
    if (isLoading) return null;

    const expired = license.status === 'expired' || (license.status === 'active' && license.daysLeft <= 0 && !!license.expiryDate);
    const label = license.status === 'none' ? 'No license'
        : expired ? `${license.planName} · expired`
        : !license.expiryDate ? `${license.planName} · no expiry`
        : `${license.planName} · ${license.daysLeft}d left`;
    const title = license.expiryDate
        ? `${license.planName} (${license.status}) — expires ${new Date(license.expiryDate).toLocaleDateString('en-IN')}`
        : `${license.planName} (${license.status}) — no expiry date`;

    if (compact) {
        const color = license.status === 'none' ? '#9db3bb'
            : expired || license.status === 'blocked' ? '#ff8a8a'
            : license.status === 'suspended' ? '#ffc46b'
            : '#55d9b4';
        const short = license.status === 'none' ? 'No licence'
            : expired ? 'Expired'
            : !license.expiryDate ? 'No expiry'
            : `${license.daysLeft}d left`;
        return <span title={title} className="license-badge-compact" style={{ color }}>{short}</span>;
    }

    return (
        <span title={title} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold whitespace-nowrap ${tone[expired ? 'expired' : license.status] || tone.none}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {label}
        </span>
    );
}

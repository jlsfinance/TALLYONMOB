import { ShieldAlert, LockKeyhole, Mail } from 'lucide-react';
import { portalApi } from '../lib/insforge';

export default function CustomerPortalPage() {
    const portalDisabledReason = typeof portalApi.getDisabledReason === 'function'
        ? portalApi.getDisabledReason()
        : 'Customer portal is disabled until a secure token-based backend is implemented.';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-8 md:p-10 shadow-2xl">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-300 mb-6">
                    <ShieldAlert size={28} />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Customer portal is currently unavailable</h1>
                <p className="mt-4 text-sm md:text-base text-slate-300 leading-7">
                    Public ledger and invoice pages are disabled in this build because secure signed-token access is not configured yet.
                    Direct company and party query parameters are no longer accepted.
                </p>
                <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                    {portalDisabledReason}
                </div>
                <div className="mt-8 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center gap-2 font-semibold text-white">
                            <LockKeyhole size={16} />
                            What needs to change
                        </div>
                        <p className="mt-2 leading-6">
                            Re-enable this only after server-generated share tokens and backend validation are implemented.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center gap-2 font-semibold text-white">
                            <Mail size={16} />
                            Next step
                        </div>
                        <p className="mt-2 leading-6">
                            Please contact the business directly for your account statement or invoice copy.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

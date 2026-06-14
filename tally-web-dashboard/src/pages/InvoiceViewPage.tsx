import { ShieldAlert, FileLock2, Mail } from 'lucide-react';
import { portalApi } from '../lib/insforge';

export default function InvoiceViewPage() {
    const portalDisabledReason = typeof portalApi.getDisabledReason === 'function'
        ? portalApi.getDisabledReason()
        : 'Invoice portal is disabled until a secure token-based backend is implemented.';

    return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-300 mb-6">
                    <ShieldAlert size={28} />
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Public invoice view is disabled</h1>
                <p className="mt-4 text-sm leading-7 text-gray-300">
                    This route no longer exposes invoice data without a signed backend-issued access token.
                </p>
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
                    {portalDisabledReason}
                </div>
                <div className="mt-8 space-y-3 text-sm text-gray-300">
                    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <FileLock2 size={18} className="mt-0.5 text-white" />
                        <span>Invoice sharing should only be re-enabled after implementing token validation on the backend.</span>
                    </div>
                    <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <Mail size={18} className="mt-0.5 text-white" />
                        <span>Please request the invoice directly from the business for now.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

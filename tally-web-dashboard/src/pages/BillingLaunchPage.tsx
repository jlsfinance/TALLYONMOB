import { useEffect, useState } from 'react';
import SafeLink from '../components/common/SafeLink';
import { ExternalLink, Play, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    attemptOpenJlsBilling,
    createBillingHandoff,
    openBillingPlayStore,
    PLAY_STORE_URL,
} from '../lib/jlsBridge';

type LaunchState = 'preparing' | 'opening' | 'fallback' | 'error' | 'opened';

export default function BillingLaunchPage() {
    const { selectedCompany } = useAuth() as any;
    const [launchState, setLaunchState] = useState<LaunchState>('preparing');
    const [statusMessage, setStatusMessage] = useState('Preparing your session...');
    const [errorMessage, setErrorMessage] = useState('');
    const [handoffId, setHandoffId] = useState<string | null>(null);
    const launchBusy = launchState === 'preparing' || launchState === 'opening';

    const runLaunch = async () => {
        setErrorMessage('');
        setLaunchState('preparing');
        setStatusMessage('Preparing your billing session...');

        try {
            const handoff = await createBillingHandoff(selectedCompany);
            setHandoffId(handoff.handoffId);
            setLaunchState('opening');
            setStatusMessage('Opening billing app...');

            const launchResult = await attemptOpenJlsBilling(handoff.handoffId);
            if (launchResult.opened) {
                setLaunchState('opened');
                setStatusMessage('Billing app opened successfully.');
                return;
            }

            setLaunchState('fallback');
            setStatusMessage('Billing app did not confirm launch. You can retry or install/update it from Play Store.');
        } catch (error: any) {
            console.error('Billing launch failed:', error);
            setLaunchState('error');
            setErrorMessage(error?.message || 'Unable to launch billing app right now.');
            setStatusMessage('Billing handoff failed.');
        }
    };

    useEffect(() => {
        void runLaunch();
    }, []);

    return (
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6">
            <div className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-lg)]">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                        {launchState === 'error' ? <AlertTriangle size={28} /> : launchState === 'opened' ? <CheckCircle2 size={28} /> : <RefreshCw size={28} className={launchState !== 'fallback' ? 'animate-spin' : ''} />}
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-[var(--on-surface)] tracking-tight">Launching Billing App</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">{statusMessage}</p>
                        {selectedCompany?.name && (
                            <p className="text-xs text-[var(--text-muted)] mt-3">Company context: <span className="font-semibold text-[var(--on-surface)]">{selectedCompany.name}</span></p>
                        )}
                        {handoffId && <p className="text-[11px] text-[var(--text-muted)] mt-1">Handoff ID: {handoffId}</p>}
                    </div>
                </div>

                {errorMessage && (
                    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                        {errorMessage}
                    </div>
                )}

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={() => void runLaunch()}
                        disabled={launchBusy}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-3 font-semibold"
                    >
                        <RefreshCw size={16} /> Retry Launch
                    </button>
                    <button
                        type="button"
                        onClick={openBillingPlayStore}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-3 font-semibold text-[var(--on-surface)]"
                    >
                        <Play size={16} /> Open Play Store
                    </button>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3 text-sm">
                    <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[var(--primary)] font-medium">
                        <ExternalLink size={14} /> View Billing App listing
                    </a>
                    <SafeLink to="/select-mode" className="text-[var(--text-muted)] hover:text-[var(--on-surface)] transition-colors">
                        Back to module selection
                    </SafeLink>
                </div>
            </div>
        </div>
    );
}

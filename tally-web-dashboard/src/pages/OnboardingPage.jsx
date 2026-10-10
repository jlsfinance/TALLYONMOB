import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, ChevronRight,
    Cloud, Loader2, LogOut, Plus, RefreshCw, Server, Wifi, WifiOff, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { companyApi } from '../lib/insforge';
import { fetchTallyData } from '../services/tallyDataService';

const STEPS = [
    { id: 'company', label: 'Company', hint: 'Choose a workspace' },
    { id: 'connection', label: 'Connection', hint: 'Verify Tally' },
    { id: 'sync', label: 'First sync', hint: 'Bring in your data' },
    { id: 'done', label: 'Ready', hint: 'Open dashboard' },
];
const STORAGE_PREFIX = 'tallyonmobile:onboarding:v1';

function getStorageKey(userId, companyId = 'new') {
    return `${STORAGE_PREFIX}:${userId || 'anonymous'}:${companyId || 'new'}`;
}

function readProgress(userId, companyId) {
    try {
        const raw = window.localStorage.getItem(getStorageKey(userId, companyId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeProgress(userId, companyId, value) {
    try {
        window.localStorage.setItem(getStorageKey(userId, companyId), JSON.stringify(value));
    } catch {
        // The wizard still works for the current session when storage is unavailable.
    }
}

function defaultFromDate() {
    const now = new Date();
    return `${now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1}-04-01`;
}

function isValidPort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 && String(value).trim() !== '';
}

export default function OnboardingPage() {
    const { user, companies, selectedCompany, selectCompany, refreshCompanies, setAppMode, signOut } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState('company');
    const [companyName, setCompanyName] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [port, setPort] = useState(() => window.localStorage.getItem('tallyPort') || '9000');
    const [connection, setConnection] = useState('unchecked');
    const [connectionMessage, setConnectionMessage] = useState('');
    const [syncState, setSyncState] = useState('idle');
    const [syncProgress, setSyncProgress] = useState(null);
    const [syncSummary, setSyncSummary] = useState(null);

    const activeCompany = selectedCompany;
    const currentIndex = Math.max(0, STEPS.findIndex(item => item.id === step));
    const existingCompanies = useMemo(() => companies || [], [companies]);

    useEffect(() => {
        setAppMode?.('tally');
        void refreshCompanies?.();
    }, []);

    useEffect(() => {
        const progress = readProgress(user?.id, activeCompany?.id);
        if (progress.completed) {
            setStep('done');
            setSyncSummary(progress.syncSummary || null);
        } else if (activeCompany?.id && progress.step) {
            setStep(progress.step);
            setConnection(progress.connection || 'unchecked');
        } else if (activeCompany?.id) {
            setStep('connection');
        }
    }, [user?.id, activeCompany?.id]);

    useEffect(() => {
        if (!user?.id) return;
        writeProgress(user.id, activeCompany?.id, {
            ...readProgress(user.id, activeCompany?.id), step, connection,
            syncSummary,
        });
    }, [user?.id, activeCompany?.id, step, connection, syncSummary]);

    const chooseCompany = (company) => {
        selectCompany(company);
        setError('');
        setConnection('unchecked');
        setSyncState('idle');
        setSyncSummary(null);
        setStep('connection');
    };

    const createCompany = async (event) => {
        event.preventDefault();
        const normalized = companyName.trim();
        if (!normalized) {
            setError('Enter your company name to continue.');
            return;
        }
        const duplicate = existingCompanies.find(company => company.name?.trim().toLowerCase() === normalized.toLowerCase());
        if (duplicate) {
            chooseCompany(duplicate);
            toast.success('That company already exists, so we selected it for you.');
            return;
        }
        setWorking(true);
        setError('');
        try {
            const result = await companyApi.create({ name: normalized, ownerId: user?.id });
            if (result.error || !result.data) throw result.error || new Error('Could not create the company.');
            selectCompany(result.data);
            await refreshCompanies?.();
            setCompanyName('');
            setShowCreate(false);
            setStep('connection');
            toast.success('Company created. Now verify your Tally connection.');
        } catch (createError) {
            setError(createError?.message || 'Could not create the company. Please try again.');
        } finally {
            setWorking(false);
        }
    };

    const verifyConnection = async () => {
        if (!isValidPort(port)) {
            setConnection('offline');
            setConnectionMessage('Enter a valid port between 1 and 65535.');
            return false;
        }
        setWorking(true);
        setConnection('checking');
        setConnectionMessage('Checking the local Tally HTTP/XML service…');
        try {
            window.localStorage.setItem('tallyPort', String(port));
            const response = await fetch(`http://localhost:${Number(port)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>',
                signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) throw new Error(`Tally responded with HTTP ${response.status}.`);
            setConnection('connected');
            setConnectionMessage(`Tally is responding on port ${port}.`);
            setStep('sync');
            return true;
        } catch (connectionError) {
            setConnection('offline');
            setConnectionMessage(connectionError?.message || `Tally did not respond on port ${port}. Open Tally and retry.`);
            return false;
        } finally {
            setWorking(false);
        }
    };

    const runFirstSync = async () => {
        if (!activeCompany?.id || connection !== 'connected') return;
        setWorking(true);
        setSyncState('syncing');
        setSyncProgress('Reading your first company snapshot from Tally…');
        setError('');
        try {
            const result = await fetchTallyData({
                fromDate: defaultFromDate(),
                toDate: new Date().toISOString().slice(0, 10),
                companyId: activeCompany.id,
                companyName: activeCompany.name,
            });
            if (!result.data) throw new Error(result.error || 'First sync did not return data.');
            const summary = {
                ledgers: result.data.ledgers?.length || 0,
                vouchers: result.data.vouchers?.length || 0,
                fromCache: result.fromCache,
            };
            setSyncSummary(summary);
            setSyncState('complete');
            setStep('done');
            writeProgress(user.id, activeCompany.id, { step: 'done', completed: true, connection: 'connected', syncSummary: summary });
            toast.success('First sync complete. Your workspace is ready.');
        } catch (syncError) {
            setSyncState('error');
            setError(syncError?.message || 'First sync failed. Check Tally and retry.');
        } finally {
            setWorking(false);
            setSyncProgress(null);
        }
    };

    const skip = () => {
        writeProgress(user?.id, activeCompany?.id, { step, skipped: true, connection });
        if (activeCompany?.id) navigate('/dashboard');
        else if (existingCompanies.length) navigate('/select-company');
        else navigate('/select-mode');
    };

    const goBack = () => {
        if (step === 'connection') setStep('company');
        if (step === 'sync') setStep('connection');
        if (step === 'done') setStep('sync');
    };

    return (
        <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--on-background)] sm:px-6 sm:py-8">
            <div className="mx-auto w-full max-w-4xl">
                <header className="mb-7 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">TallyOnMobile setup</p>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Get your workspace ready</h1>
                        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">A short guided setup. You can skip now and resume later without creating duplicates.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={skip} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-hover)]">Skip for now</button>
                        <button type="button" onClick={async () => { await signOut(); navigate('/login'); }} aria-label="Sign out" className="rounded-xl p-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"><LogOut size={19} /></button>
                    </div>
                </header>

                <nav aria-label="Onboarding progress" className="mb-7 grid grid-cols-4 gap-2">
                    {STEPS.map((item, index) => {
                        const active = index === currentIndex;
                        const complete = index < currentIndex;
                        return <div key={item.id} className={`rounded-xl border p-2.5 sm:p-3 ${active ? 'border-[var(--primary)] bg-[var(--primary-container)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                            <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${complete ? 'bg-[var(--success)] text-white' : active ? 'bg-[var(--primary)] text-[var(--on-primary)]' : 'bg-[var(--surface-container)] text-[var(--text-muted)]'}`}>{complete ? <Check size={14} /> : index + 1}</span><span className="hidden text-xs font-bold sm:inline">{item.label}</span></div>
                            <p className="mt-1 hidden text-[11px] text-[var(--text-muted)] sm:block">{item.hint}</p>
                        </div>;
                    })}
                </nav>

                <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-8" aria-live="polite">
                    {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><X size={17} className="mt-0.5 shrink-0" />{error}</div>}

                    {step === 'company' && <div>
                        <div className="mb-6 flex items-start gap-3"><span className="rounded-xl bg-[var(--primary-container)] p-3 text-[var(--primary)]"><Building2 size={22} /></span><div><h2 className="text-xl font-bold">Choose or create a company</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Use an existing workspace, or create one once. We check names before creating anything new.</p></div></div>
                        {existingCompanies.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{existingCompanies.map(company => <button key={company.id} type="button" onClick={() => chooseCompany(company)} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-container)] font-bold text-[var(--primary)]">{company.name?.charAt(0)?.toUpperCase() || 'C'}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{company.name}</span><span className="text-xs text-[var(--text-muted)]">{company.last_sync_at ? 'Previously synced' : 'Not synced yet'}</span></span><ChevronRight size={18} className="text-[var(--text-muted)]" /></button>)}</div>}
                        <button type="button" onClick={() => setShowCreate(value => !value)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-container)]"><Plus size={18} /> Create a new company</button>
                        {showCreate && <form onSubmit={createCompany} className="mt-5 rounded-xl bg-[var(--surface-container)] p-4"><label htmlFor="company-name" className="text-sm font-semibold">Company name</label><input id="company-name" autoFocus value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="e.g. Sharma Traders" className="input mt-2" /><button type="submit" disabled={working} className="btn btn-primary mt-3 w-full sm:w-auto">{working ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} Create company</button></form>}
                        {existingCompanies.length === 0 && !showCreate && <p className="mt-5 text-sm text-[var(--text-muted)]">No workspace yet? Create one above to begin your first sync.</p>}
                    </div>}

                    {step === 'connection' && <div>
                        <div className="mb-6 flex items-start gap-3"><span className={`rounded-xl p-3 ${connection === 'connected' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--primary-container)] text-[var(--primary)]'}`}>{connection === 'connected' ? <Wifi size={22} /> : <Server size={22} />}</span><div><h2 className="text-xl font-bold">Connect Tally on this device</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Open TallyPrime/Tally ERP, enable its HTTP/XML interface, then verify the local connection.</p></div></div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container)] p-4"><p className="text-sm font-semibold">Selected company</p><p className="mt-1 text-lg font-bold">{activeCompany?.name || 'No company selected'}</p><label htmlFor="tally-port" className="mt-5 block text-sm font-semibold">Tally port</label><input id="tally-port" inputMode="numeric" value={port} onChange={event => { setPort(event.target.value); setConnection('unchecked'); }} className="input mt-2 max-w-xs" />{connectionMessage && <p className={`mt-3 flex items-center gap-2 text-sm ${connection === 'connected' ? 'text-emerald-600 dark:text-emerald-400' : connection === 'offline' ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text-muted)]'}`}>{connection === 'connected' ? <CheckCircle2 size={16} /> : connection === 'offline' ? <WifiOff size={16} /> : <RefreshCw size={16} className={connection === 'checking' ? 'animate-spin' : ''} />}{connectionMessage}</p>}</div>
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={goBack} className="btn btn-secondary">Back</button><button type="button" onClick={verifyConnection} disabled={working || !activeCompany} className="btn btn-primary">{working ? <Loader2 size={17} className="animate-spin" /> : <Wifi size={17} />} Verify connection <ArrowRight size={17} /></button></div>
                    </div>}

                    {step === 'sync' && <div>
                        <div className="mb-6 flex items-start gap-3"><span className="rounded-xl bg-[var(--primary-container)] p-3 text-[var(--primary)]"><Cloud size={22} /></span><div><h2 className="text-xl font-bold">Run your first sync</h2><p className="mt-1 text-sm text-[var(--text-muted)]">This is explicit and safe: nothing is exported or changed in Tally until you choose an action elsewhere.</p></div></div>
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="font-semibold text-emerald-700 dark:text-emerald-300">Tally connection verified</p><p className="mt-1 text-sm text-[var(--text-muted)]">{activeCompany?.name} · port {port}</p></div>
                        {syncProgress && <p className="mt-5 flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 size={17} className="animate-spin" />{syncProgress}</p>}
                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={goBack} disabled={working} className="btn btn-secondary">Back</button><button type="button" onClick={runFirstSync} disabled={working || syncState === 'complete'} className="btn btn-primary">{working ? <Loader2 size={17} className="animate-spin" /> : <Cloud size={17} />} Start first sync</button></div>
                    </div>}

                    {step === 'done' && <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={34} /></span><h2 className="mt-5 text-2xl font-bold">Your workspace is ready</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-muted)]">{activeCompany?.name || 'Your company'} is selected. You can revisit this setup anytime from the company selector.</p>{syncSummary && <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3 text-left"><div className="rounded-xl bg-[var(--surface-container)] p-3"><p className="text-xs text-[var(--text-muted)]">Ledgers</p><p className="mt-1 text-lg font-bold">{syncSummary.ledgers}</p></div><div className="rounded-xl bg-[var(--surface-container)] p-3"><p className="text-xs text-[var(--text-muted)]">Vouchers</p><p className="mt-1 text-lg font-bold">{syncSummary.vouchers}</p></div></div>}<div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => navigate('/dashboard')} className="btn btn-primary">Open dashboard <ArrowRight size={17} /></button><button type="button" onClick={() => navigate('/tally-sync')} className="btn btn-secondary">Open Tally Sync</button></div></div>}
                </section>

                <footer className="mt-5 flex items-center justify-between text-xs text-[var(--text-muted)]"><span>Signed in as {user?.email || 'your account'}</span><span>Step {currentIndex + 1} of {STEPS.length}</span></footer>
            </div>
        </main>
    );
}

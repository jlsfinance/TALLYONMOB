import { useEffect, useMemo, useState } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Building2, Clock, MoreVertical, Moon, Plus, Search, ShieldCheck, Sun, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';
import { useTheme } from '@/contexts/ThemeContext';

export default function SelectCompanyPage() {
    const { user, companies, selectCompany, deleteCompany, refreshCompanies, setAppMode, appMode } = useAuth() as AuthContextType;
    const { isDark, toggleTheme } = useTheme();
    const { navigate } = useSafeNavigate();
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);

    useEffect(() => {
        refreshCompanies();
    }, []);

    const handleBack = () => {
        setAppMode(null);
        navigate('/select-mode');
    };

    const handleSelect = (company: any) => {
        selectCompany(company);
        navigate(appMode === 'billing' ? '/billing' : '/dashboard');
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setOpenMenu(null);
        if (deletingCompanyId) return;
        if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;

        setDeletingCompanyId(id);
        try {
            const { success, error } = await deleteCompany(id);
            if (success) toast.success('Company deleted');
            else toast.error(error || 'Failed to delete');
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Failed to delete company');
        } finally {
            setDeletingCompanyId(null);
        }
    };

    const getInitialColor = (name: string) => {
        const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600', 'bg-teal-600'];
        const index = name ? name.charCodeAt(0) % colors.length : 0;
        return colors[index];
    };

    const getSyncStatus = (company: any) => {
        if (!company.last_sync_at) return { label: 'Not synced yet', tone: 'text-[var(--text-muted)]' };
        const syncedAt = new Date(company.last_sync_at);
        if (Number.isNaN(syncedAt.getTime())) return { label: 'Sync status unavailable', tone: 'text-[var(--text-muted)]' };
        const age = Math.max(0, Date.now() - syncedAt.getTime());
        if (age < 24 * 60 * 60 * 1000) {
            if (age < 60 * 1000) return { label: 'Synced just now', tone: 'text-green-600' };
            if (age < 60 * 60 * 1000) return { label: `Synced ${Math.floor(age / 60000)} minutes ago`, tone: 'text-green-600' };
            return { label: `Synced today at ${syncedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, tone: 'text-green-600' };
        }
        return {
            label: `Synced ${formatDistanceToNow(syncedAt)} ago`,
            tone: age >= 30 * 24 * 60 * 60 * 1000 ? 'text-red-600' : 'text-amber-600',
        };
    };

    const visibleCompanies = useMemo(() => companies
        .filter((company: any) => company.name?.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a: any, b: any) => new Date(b.last_sync_at || 0).getTime() - new Date(a.last_sync_at || 0).getTime()), [companies, query]);

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--on-background)] transition-colors duration-300">
            <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
                <header className="mb-7 flex min-h-12 items-center gap-3">
                    <button
                        type="button"
                        onClick={handleBack}
                        aria-label="Back to module selection"
                        className="rounded-full p-1.5 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]"
                    >
                        <ArrowLeft size={28} strokeWidth={2.2} />
                    </button>
                    {searchOpen ? (
                        <div className="flex min-w-0 flex-1 items-center border-b border-[var(--border)]">
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search companies"
                                aria-label="Search companies"
                                className="w-full bg-transparent px-1 py-2 text-lg text-[var(--on-surface)] outline-none placeholder:text-[var(--text-muted)]"
                            />
                            <button
                                type="button"
                                aria-label="Close search"
                                onClick={() => { setQuery(''); setSearchOpen(false); }}
                                className="p-2 text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
                            >
                                <X size={21} />
                            </button>
                        </div>
                    ) : (
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl font-bold tracking-tight text-[var(--on-surface)] sm:text-2xl">Select a company</h1>
                            <p className="mt-0.5 hidden text-sm text-[var(--text-muted)] sm:block">Choose which business workspace you want to open.</p>
                        </div>
                    )}
                    {!searchOpen && (
                        <button
                            type="button"
                            aria-label="Search companies"
                            onClick={() => setSearchOpen(true)}
                            className="rounded-full p-2 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]"
                        >
                            <Search size={28} strokeWidth={2} />
                        </button>
                    )}
                    <button type="button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`} title={`Switch to ${isDark ? 'light' : 'dark'} mode`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[var(--on-surface-variant)] shadow-[var(--shadow-xs)] transition hover:bg-[var(--surface-hover)]">
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </header>

                <div className="mb-4 flex min-h-[68px] items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 shadow-[var(--shadow-xs)] sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-container)] text-[var(--primary)]"><Building2 size={19} /></span>
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-[var(--on-surface)] sm:text-base">My companies</h2>
                            <p className="text-xs text-[var(--text-muted)]">{companies.length} {companies.length === 1 ? 'workspace' : 'workspaces'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/onboarding')}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2.5 text-xs font-semibold text-[var(--on-primary)] shadow-[var(--shadow-xs)] transition hover:brightness-110 sm:px-4 sm:text-sm"
                    >
                        <Plus size={17} />
                        Add Company
                    </button>
                </div>

                {visibleCompanies.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center">
                        <Building2 size={42} className="text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--on-surface-variant)]">
                            {companies.length === 0 ? 'No companies found. Add a company or sync data from Tally.' : 'No companies match your search.'}
                        </p>
                        {companies.length > 0 && <button type="button" onClick={() => setQuery('')} className="text-sm font-medium text-[var(--primary)]">Clear search</button>}
                    </div>
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {visibleCompanies.map((company: any) => {
                            const sync = getSyncStatus(company);
                            return (
                                <li key={company.id} className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--primary)]/30 hover:shadow-[var(--shadow-md)]">
                                    <div className="flex min-h-[112px] items-center rounded-2xl">
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(company)}
                                            className="flex min-w-0 flex-1 items-center gap-3 self-stretch px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                                        >
                                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${getInitialColor(company.name)}`}>{company.name?.trim()?.charAt(0)?.toUpperCase() || 'C'}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block break-words text-sm font-semibold leading-5 text-[var(--on-surface)] sm:text-base">{company.name}</span>
                                                <span className={`mt-1 flex items-center gap-1.5 text-xs ${sync.tone}`}><Clock size={12} />{sync.label}</span>
                                            </span>
                                            <span className={`hidden rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:inline-flex ${deletingCompanyId === company.id ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-[var(--primary-container)] text-[var(--primary)]'}`}>{deletingCompanyId === company.id ? 'Deleting…' : 'Open'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Options for ${company.name}`}
                                            aria-expanded={openMenu === company.id}
                                            disabled={deletingCompanyId === company.id}
                                            onClick={() => setOpenMenu((current) => current === company.id ? null : company.id)}
                                            className="mr-3 rounded-xl p-2.5 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container)] hover:text-[var(--on-surface)]"
                                        >
                                            <MoreVertical size={25} />
                                        </button>
                                    </div>
                                    {openMenu === company.id && (
                                        <div className="absolute right-3 top-14 z-10 min-w-48 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-1 shadow-xl">
                                            <button type="button" onClick={() => handleSelect(company)} className="w-full px-4 py-2.5 text-left text-sm text-[var(--on-surface)] hover:bg-[var(--surface-hover)]">Open company</button>
                                            <button type="button" onClick={() => { selectCompany(company); setOpenMenu(null); navigate('/device-management'); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--on-surface)] hover:bg-[var(--surface-hover)]"><ShieldCheck size={15} /> Sync health</button>
                                            {company.owner_id === user?.id && <button type="button" disabled={!!deletingCompanyId} onClick={(event) => handleDelete(event, company.id)} className="w-full px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60">{deletingCompanyId === company.id ? 'Deleting…' : 'Delete company'}</button>}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

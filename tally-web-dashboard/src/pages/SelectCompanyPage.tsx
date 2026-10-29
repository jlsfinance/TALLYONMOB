import { useState, useEffect } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ArrowRight, RefreshCw, ArrowLeft, Search, MoreVertical, X, MonitorDown, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';
import { supabase } from '@/lib/insforge';
import { APP_INFO } from '@/config/appInfo';

// Row-list design (like the approved mock) with full dark-mode support.
// Selection, delete and refresh logic unchanged.

export default function SelectCompanyPage() {
    const { companies, selectCompany, deleteCompany, refreshCompanies, setAppMode, appMode } = useAuth() as AuthContextType;
    const { navigate } = useSafeNavigate();
    const { isDark } = useTheme();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [syncTimes, setSyncTimes] = useState<Record<string, string | null | undefined>>({});
    const [refreshing, setRefreshing] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const checkCompanies = async () => {
        setRefreshing(true);
        try {
            const result = await (refreshCompanies as any)();
            setLoadError(Boolean(result?.error));
        } catch { setLoadError(true); }
        finally { setRefreshing(false); }
    };

    useEffect(() => {
        void checkCompanies();
    }, []);

    useEffect(() => {
        let cancelled = false;
        setSyncTimes({});
        void Promise.all(companies.map(async (company: any) => {
            const { data, error } = await supabase.from('sync_history')
                .select('completed_at').eq('company_id', company.id)
                .in('status', ['completed', 'success', 'successful'])
                .not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1);
            return [company.id, error ? undefined : (data?.[0]?.completed_at ?? null)] as const;
        })).then(entries => { if (!cancelled) setSyncTimes(Object.fromEntries(entries)); });
        return () => { cancelled = true; };
    }, [companies]);

    // close row menu on outside click
    useEffect(() => {
        if (!menuFor) return;
        const close = () => setMenuFor(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [menuFor]);

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
        setMenuFor(null);
        if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;

        try {
            const { success, error } = await deleteCompany(id);
            if (success) {
                toast.success('Company deleted');
            } else {
                toast.error(error || 'Failed to delete');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const q = searchQ.trim().toLowerCase();
    const visible = q ? companies.filter((c: any) => c.name?.toLowerCase().includes(q)) : companies;

    // dark / light tokens (matches the SYNCORA navy design)
    const bg = isDark ? 'bg-[#070D1A]' : 'bg-[#F7F9FB]';
    const titleC = isDark ? 'text-white' : 'text-slate-900';
    const subC = isDark ? 'text-slate-400' : 'text-slate-500';
    const nameC = isDark ? 'text-slate-100' : 'text-slate-900';
    const hoverRow = isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50';
    const hairline = isDark ? 'border-white/10' : 'border-slate-200';
    const statusC = isDark ? 'text-amber-400' : 'text-amber-700';
    const iconC = isDark ? 'text-slate-300' : 'text-slate-600';

    return (
        <div className={`min-h-screen flex flex-col ${bg} transition-colors duration-300`}>
            {/* Top bar: back | centered title | search */}
            <div className={`sticky top-0 z-40 ${isDark ? 'bg-[#070D1A]/90' : 'bg-[#F7F9FB]/90'} backdrop-blur border-b ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
                    <div className="grid grid-cols-[auto_1fr_auto] items-center h-14">
                        <button onClick={handleBack} aria-label="Back" className={`p-2 -ml-2 rounded-lg ${iconC} hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors`}>
                            <ArrowLeft size={22} />
                        </button>
                        <h1 className={`text-center text-lg sm:text-xl font-bold ${titleC} truncate`}>Select Company</h1>
                        <button
                            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQ(''); }}
                            aria-label={searchOpen ? 'Close search' : 'Search companies'}
                            className={`p-2 -mr-2 rounded-lg ${iconC} hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors`}
                        >
                            {searchOpen ? <X size={22} /> : <Search size={21} />}
                        </button>
                    </div>
                    <AnimatePresence>
                        {searchOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <input
                                    autoFocus
                                    value={searchQ}
                                    onChange={(e) => setSearchQ(e.target.value)}
                                    placeholder="Search companies by name..."
                                    className={`w-full mb-2.5 px-3 py-2 rounded-lg text-sm border ${
                                        isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500/60' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-violet-500'
                                    } focus:outline-none focus:ring-2 focus:ring-violet-500/20`}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* List */}
            <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 pb-16">
                {/* Section header */}
                <div className={`flex items-center justify-between py-3.5 border-b ${hairline}`}>
                    <h2 className={`text-base font-bold ${titleC}`}>My Companies</h2>
                    <button
                        onClick={() => navigate('/onboarding')}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${iconC} hover:${titleC} focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors`}
                    >
                        <Plus size={16} /> Add Company
                    </button>
                </div>

                {refreshing && companies.length === 0 ? (
                    <div role="status" aria-label="Loading companies" className="py-10 space-y-3 animate-pulse"><div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800"/><div className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800"/></div>
                ) : loadError && companies.length === 0 ? (
                    <div className="py-12 text-center"><p className={subC}>Companies could not be loaded. Check your connection and try again.</p><button onClick={() => void checkCompanies()} className="mt-4 text-sm font-bold text-emerald-600">Try again</button></div>
                ) : visible.length === 0 && !q && appMode === 'tally' ? (
                    <section className={`my-3 overflow-hidden rounded-2xl border ${isDark ? 'border-slate-700 bg-[#101f27]' : 'border-emerald-100 bg-white'} shadow-sm`}>
                        <div className="p-4 sm:p-6"><div className="flex items-center gap-3"><div className="inline-flex shrink-0 rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Building2 size={20}/></div><div><h2 className={`text-base font-bold leading-tight ${titleC}`}>Connect your Tally company</h2><p className={`mt-1 text-xs leading-4 ${subC}`}>Sync from your Tally PC to see your company here.</p></div></div>
                            <div className={`mt-3 grid gap-2 rounded-xl p-3 text-xs leading-4 ${isDark ? 'bg-white/5 text-slate-300' : 'bg-[#f3f9f6] text-slate-600'}`}><div className="flex gap-2"><span className="font-bold text-emerald-600">01</span><span>Download and install the PC app on your Tally computer.</span></div><div className="flex gap-2"><span className="font-bold text-emerald-600">02</span><span>Sign in with this account and connect Tally.</span></div><div className="flex gap-2"><span className="font-bold text-emerald-600">03</span><span>Start sync, then refresh companies here.</span></div></div>
                            <div className="mt-3 grid grid-cols-2 gap-2"><a href={APP_INFO.pcDownloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-2 py-2 text-xs font-bold text-white hover:bg-emerald-800"><MonitorDown size={16}/> Download PC app</a><button type="button" onClick={() => void checkCompanies()} disabled={refreshing} className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold ${isDark ? 'border-slate-600 text-slate-200' : 'border-slate-200 text-slate-700'}`}><RefreshCw size={15}/> Refresh</button></div>
                        </div>
                    </section>
                ) : visible.length === 0 ? (
                    <div className="py-16 text-center">
                        <p className={`text-sm ${subC}`}>
                            {q ? 'No companies match your search.' : 'No companies yet.'}
                        </p>
                        {!q && (
                            <button onClick={() => navigate('/onboarding')} className="mt-3 text-sm font-bold text-violet-500 hover:text-violet-400">
                                + Add your first company
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className={`divide-y ${hairline}`}>
                        <AnimatePresence initial={false}>
                            {visible.map((company: any) => {
                                const timestamp = syncTimes[company.id] || company.last_sync_at;
                                const date = timestamp ? new Date(timestamp) : null;
                                const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
                                const overdue = validDate && Date.now() - validDate.getTime() > 3 * 24 * 60 * 60 * 1000;
                                return (
                                <motion.li
                                    key={company.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="relative"
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleSelect(company)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(company); }}
                                        className={`group flex items-center gap-3 py-4 pr-1 cursor-pointer ${hoverRow} focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors rounded-md px-1`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-[15px] font-semibold ${nameC} truncate`}>{company.name}</p>
                                            <p className={`text-[13px] italic mt-0.5 ${validDate ? overdue ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400' : statusC}`}>
                                                {validDate
                                                    ? `${overdue ? 'Warning: last synced' : 'Synced'} ${formatDistanceToNow(validDate)} ago`
                                                    : syncTimes[company.id] === null ? 'No successful sync recorded' : 'Sync status unavailable'}
                                            </p>
                                        </div>

                                        {/* kebab menu */}
                                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => setMenuFor(menuFor === company.id ? null : company.id)}
                                                aria-label={`Actions for ${company.name}`}
                                                aria-expanded={menuFor === company.id}
                                                className={`p-2 rounded-lg ${iconC} ${hoverRow} focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors`}
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            <AnimatePresence>
                                                {menuFor === company.id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                                        transition={{ duration: 0.12 }}
                                                        className={`absolute right-1 top-10 z-30 w-40 overflow-hidden rounded-xl border shadow-lg ${
                                                            isDark ? 'bg-[#0B1424] border-white/10' : 'bg-white border-slate-200'
                                                        }`}
                                                        role="menu"
                                                    >
                                                        <button
                                                            role="menuitem"
                                                            onClick={() => { setMenuFor(null); handleSelect(company); }}
                                                            className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-left ${nameC} ${hoverRow}`}
                                                        >
                                                            <ArrowRight size={14} /> Open
                                                        </button>
                                                        <button
                                                            role="menuitem"
                                                            onClick={(e) => handleDelete(e, company.id)}
                                                            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-left text-rose-500 hover:bg-rose-500/10"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </motion.li>
                            ); })}
                        </AnimatePresence>
                    </ul>
                )}

                {/* meta footer */}
                {companies.length > 0 && <div className={`mt-6 flex items-center justify-center gap-2 text-[11px] ${subC}`}>
                    <RefreshCw size={12} className="opacity-60" />
                    Companies sync from the desktop Tally Sync app
                </div>}
            </div>
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { useSafeNavigate } from '@/hooks/useSafeNavigate';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Building2, Clock, MoreVertical, Plus, Search, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthContextType } from '@/contexts/types';

export default function SelectCompanyPage() {
    const { companies, selectCompany, deleteCompany, refreshCompanies, setAppMode, appMode } = useAuth() as AuthContextType;
    const { navigate } = useSafeNavigate();
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [openMenu, setOpenMenu] = useState<string | null>(null);

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
        if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;

        try {
            const { success, error } = await deleteCompany(id);
            if (success) toast.success('Company deleted');
            else toast.error(error || 'Failed to delete');
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete company');
        }
    };

    const getInitialColor = (name: string) => {
        const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600', 'bg-teal-600'];
        const index = name ? name.charCodeAt(0) % colors.length : 0;
        return colors[index];
    };

    const getSyncStatus = (company: any) => {
        if (!company.last_sync_at) return { label: 'Not synced yet', tone: 'text-gray-500' };
        const syncedAt = new Date(company.last_sync_at);
        if (Number.isNaN(syncedAt.getTime())) return { label: 'Sync status unavailable', tone: 'text-gray-500' };
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
        <div className="min-h-screen bg-white text-black transition-colors duration-300">
            <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6">
                <header className="mb-5 flex min-h-12 items-center gap-3">
                    <button
                        type="button"
                        onClick={handleBack}
                        aria-label="Back to module selection"
                        className="rounded-full p-1.5 text-black transition-colors hover:bg-gray-100"
                    >
                        <ArrowLeft size={28} strokeWidth={2.2} />
                    </button>
                    {searchOpen ? (
                        <div className="flex min-w-0 flex-1 items-center border-b border-gray-300">
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search companies"
                                aria-label="Search companies"
                                className="w-full bg-transparent px-1 py-2 text-lg text-black outline-none placeholder:text-gray-500"
                            />
                            <button
                                type="button"
                                aria-label="Close search"
                                onClick={() => { setQuery(''); setSearchOpen(false); }}
                                className="p-2 text-gray-600 hover:text-black"
                            >
                                <X size={21} />
                            </button>
                        </div>
                    ) : (
                        <h1 className="min-w-0 flex-1 text-xl font-bold text-black">Select Company</h1>
                    )}
                    {!searchOpen && (
                        <button
                            type="button"
                            aria-label="Search companies"
                            onClick={() => setSearchOpen(true)}
                            className="rounded-full p-2 text-black transition-colors hover:bg-gray-100"
                        >
                            <Search size={28} strokeWidth={2} />
                        </button>
                    )}
                </header>

                <div className="-mx-4 flex min-h-[52px] items-center justify-between bg-[#eeeeee] px-6 sm:-mx-6">
                    <h2 className="text-lg font-semibold text-black">My Companies</h2>
                    <button
                        type="button"
                        onClick={() => navigate('/onboarding')}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/5"
                    >
                        <Plus size={17} />
                        Add Company
                    </button>
                </div>

                {visibleCompanies.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center">
                        <Building2 size={42} className="text-gray-400" />
                        <p className="text-sm text-gray-600">
                            {companies.length === 0 ? 'No companies found. Add a company or sync data from Tally.' : 'No companies match your search.'}
                        </p>
                        {companies.length > 0 && <button type="button" onClick={() => setQuery('')} className="text-sm font-medium text-blue-700">Clear search</button>}
                    </div>
                ) : (
                    <ul className="divide-y divide-[#e5e5e5]">
                        {visibleCompanies.map((company: any) => {
                            const sync = getSyncStatus(company);
                            return (
                                <li key={company.id} className="relative">
                                    <div className="flex min-h-[94px] items-center">
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(company)}
                                            className="flex min-w-0 flex-1 flex-col items-start justify-center px-3 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                                        >
                                            <span className="max-w-full break-words text-lg font-normal leading-7 text-black">{company.name}</span>
                                            <span className={`mt-0.5 text-sm italic ${sync.tone}`}>{sync.label}</span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Options for ${company.name}`}
                                            aria-expanded={openMenu === company.id}
                                            onClick={() => setOpenMenu((current) => current === company.id ? null : company.id)}
                                            className="mr-2 rounded-full p-2 text-black transition-colors hover:bg-gray-100"
                                        >
                                            <MoreVertical size={25} />
                                        </button>
                                    </div>
                                    {openMenu === company.id && (
                                        <div className="absolute right-2 top-14 z-10 min-w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                            <button type="button" onClick={() => handleSelect(company)} className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50">Open company</button>
                                            <button type="button" onClick={() => { selectCompany(company); setOpenMenu(null); navigate('/device-management'); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50"><ShieldCheck size={15} /> Sync health</button>
                                            <button type="button" onClick={(event) => handleDelete(event, company.id)} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">Delete company</button>
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

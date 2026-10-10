'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyStore } from '@/stores/company-store';
import { ArrowLeft, Building2, Check, MoreVertical, Plus, Search, X } from 'lucide-react';

interface CompanyWithMeta {
  id: string;
  name: string;
  gstin: string | null;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  role?: string;
  lastSyncedAt?: string | null;
  counts?: { ledgers: number; vouchers: number; stockItems: number };
}

function formatSyncDate(value?: string | null) {
  if (!value) return { text: 'Not synced yet', fresh: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: 'Sync time unavailable', fresh: false };

  const elapsed = Math.max(0, Date.now() - date.getTime());
  const days = Math.floor(elapsed / 86_400_000);
  if (days === 0) {
    return {
      text: `Synced today at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      fresh: true,
    };
  }
  if (days < 30) return { text: `Synced ${days} ${days === 1 ? 'day' : 'days'} ago`, fresh: false };

  const months = Math.floor(days / 30);
  if (months < 12) return { text: `Synced ${months} ${months === 1 ? 'month' : 'months'} ago`, fresh: false };
  const years = Math.floor(months / 12);
  return { text: `Synced ${years} ${years === 1 ? 'year' : 'years'} ago`, fresh: false };
}

export default function CompaniesPage() {
  const router = useRouter();
  const { companies, activeCompany, isLoading, fetchCompanies, setActiveCompany } = useCompanyStore();
  const [showCreate, setShowCreate] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', gstin: '', address: '', city: '', state: '', pincode: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const companiesList = companies as unknown as CompanyWithMeta[];
  const filteredCompanies = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return companiesList;
    return companiesList.filter((company) => company.name.toLocaleLowerCase().includes(normalized));
  }, [companiesList, query]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const selectCompany = (company: CompanyWithMeta) => {
    setActiveCompany(company as (typeof companies)[number]);
    setOpenMenu(null);
    router.push('/dashboard');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to create company');
        return;
      }
      setShowCreate(false);
      setForm({ name: '', gstin: '', address: '', city: '', state: '', pincode: '', phone: '', email: '' });
      await fetchCompanies();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-white p-4 text-black lg:-m-6 lg:p-6">
      <header className="mb-5 flex min-h-12 items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          aria-label="Back to dashboard"
          className="rounded-full p-1.5 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          <ArrowLeft className="h-7 w-7" strokeWidth={2.2} />
        </button>
        {searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center border-b border-[var(--border)]">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies"
              aria-label="Search companies"
              className="w-full bg-transparent px-1 py-2 text-lg text-[var(--text)] outline-none placeholder:text-[var(--text-secondary)]"
            />
            <button
              type="button"
              onClick={() => { setQuery(''); setSearchOpen(false); }}
              aria-label="Close search"
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <h1 className="min-w-0 flex-1 text-xl font-bold text-[var(--text)]">Select Company</h1>
        )}
        {!searchOpen && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search companies"
            className="rounded-full p-2 text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <Search className="h-7 w-7" strokeWidth={2} />
          </button>
        )}
      </header>

      <div className="-mx-4 flex min-h-[52px] items-center justify-between bg-[#eeeeee] px-6 lg:-mx-6">
        <h2 className="text-lg font-semibold text-black">My Companies</h2>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-black/5"
        >
          <Plus className="h-4 w-4" />
          Add company
        </button>
      </div>

      {showCreate && (
        <section className="my-5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">New Company</h3>
          {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-[var(--text)]">
              Company name *
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-[var(--text)]">
              GSTIN
              <input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} placeholder="22AAAAA0000A1Z5" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-[var(--text)] md:col-span-2">
              Address
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-[var(--text)]">
              City
              <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-[var(--text)]">
              State
              <input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-normal" />
            </label>
            <div className="flex gap-3 md:col-span-2">
              <button type="submit" disabled={creating} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{creating ? 'Creating...' : 'Create Company'}</button>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]">Cancel</button>
            </div>
          </form>
        </section>
      )}

      {isLoading && companiesList.length === 0 ? (
        <div className="divide-y divide-gray-200" aria-label="Loading companies">
          {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse bg-gray-50" />)}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center">
          <Building2 className="h-10 w-10 text-[var(--text-secondary)]" />
          <p className="text-[var(--text-secondary)]">
            {companiesList.length === 0 ? 'No companies yet. Add a company or sync data from Tally.' : 'No companies match your search.'}
          </p>
          {companiesList.length > 0 && <button type="button" onClick={() => setQuery('')} className="text-sm font-medium text-[var(--primary)]">Clear search</button>}
        </div>
      ) : (
        <ul className="divide-y divide-[#e5e5e5]">
          {filteredCompanies.map((company) => {
            const sync = formatSyncDate(company.lastSyncedAt);
            const selected = activeCompany?.id === company.id;
            return (
              <li key={company.id} className="relative">
                <div className="flex min-h-[94px] items-center">
                  <button
                    type="button"
                    onClick={() => selectCompany(company)}
                    className="flex min-w-0 flex-1 flex-col items-start justify-center px-3 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
                  >
                    <span className="max-w-full break-words text-lg font-normal leading-7 text-[var(--text)]">{company.name}</span>
                    <span className={`mt-0.5 text-sm italic ${sync.fresh ? 'text-green-600' : sync.text === 'Not synced yet' ? 'text-[var(--text-secondary)]' : 'text-red-500'}`}>{sync.text}</span>
                  </button>
                  {selected && <span className="mr-2 rounded-full bg-green-50 p-1.5 text-green-700" title="Currently selected"><Check className="h-4 w-4" /></span>}
                  <button
                    type="button"
                    aria-label={`Options for ${company.name}`}
                    aria-expanded={openMenu === company.id}
                    onClick={() => setOpenMenu((current) => current === company.id ? null : company.id)}
                    className="mr-2 rounded-full p-2 text-black transition-colors hover:bg-gray-100"
                  >
                    <MoreVertical className="h-6 w-6" />
                  </button>
                </div>
                {openMenu === company.id && (
                  <div className="absolute right-2 top-14 z-10 min-w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-lg">
                    <button type="button" onClick={() => selectCompany(company)} className="w-full px-4 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-secondary)]">Open company</button>
                    {company.gstin && <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-secondary)]">GSTIN: {company.gstin}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

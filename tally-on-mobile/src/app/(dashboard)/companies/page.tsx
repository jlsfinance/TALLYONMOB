'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCompanyStore } from '@/stores/company-store';
import { formatCurrency } from '@/lib/utils';
import { Building2, Plus, MapPin, Hash } from 'lucide-react';

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
  counts?: { ledgers: number; vouchers: number; stockItems: number };
}

export default function CompaniesPage() {
  const { companies, isLoading, fetchCompanies } = useCompanyStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', gstin: '', address: '', city: '', state: '', pincode: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const companiesList = companies as unknown as CompanyWithMeta[];

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

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
      fetchCompanies();
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Companies</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Manage your Tally companies</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">New Company</h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">Company Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">GSTIN</label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[var(--text)] mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            </div>
            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Company'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-[var(--border)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--bg-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Companies list */}
      {isLoading && companiesList.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : companiesList.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
          <p className="text-[var(--text-secondary)]">No companies yet. Create your first company to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companiesList.map((company) => (
            <div
              key={company.id}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-[var(--primary)]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--text)] truncate">{company.name}</h3>
                  {company.gstin && (
                    <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] mt-0.5">
                      <Hash className="w-3 h-3" />
                      {company.gstin}
                    </div>
                  )}
                </div>
              </div>

              {company.address && (
                <div className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)] mb-4">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">
                    {[company.address, company.city, company.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
                  <span>{company.counts?.ledgers ?? 0} ledgers</span>
                  <span>{company.counts?.vouchers ?? 0} vouchers</span>
                  <span>{company.counts?.stockItems ?? 0} stock</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-medium">
                  {company.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

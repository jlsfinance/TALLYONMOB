'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { BookOpen, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Ledger } from '@/types';

interface LedgersResponse {
  items: Ledger[];
  total: number;
  page: number;
  pages: number;
}

export default function LedgersPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<LedgersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [ledgerType, setLedgerType] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyId: activeCompany.id,
        page: String(page),
        limit: '50',
      });
      if (search) params.set('search', search);
      if (ledgerType) params.set('type', ledgerType);
      const res = await fetchApi<LedgersResponse>(`/api/ledgers?${params}`);
      setData(res);
    } catch {
      // handled by fetchApi
    } finally {
      setLoading(false);
    }
  }, [activeCompany, page, search, ledgerType]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, ledgerType, activeCompany]);

  const types = ['', 'Receivable', 'Payable', 'Bank', 'Cash', 'Income', 'Expense', 'Asset', 'Liability'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Ledgers</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {data ? `${data.total} ledgers` : 'Browse ledger accounts'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search ledgers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <select
          value={ledgerType}
          onChange={(e) => setLedgerType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">All Types</option>
          {types.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
        {loading && !data ? (
          <div className="p-6 space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--bg-secondary)] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
            <p className="text-[var(--text-secondary)]">No ledgers found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Parent Group</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">GSTIN</th>
                    <th className="px-5 py-3 font-medium text-right">Opening Balance</th>
                    <th className="px-5 py-3 font-medium text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.items.map((ledger) => (
                    <tr key={ledger.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[var(--text)]">
                        {ledger.name}
                        {ledger.alias && (
                          <span className="ml-2 text-xs text-[var(--text-secondary)]">({ledger.alias})</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{ledger.parent}</td>
                      <td className="px-5 py-3 text-sm">
                        {ledger.ledgerType && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                            {ledger.ledgerType}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] font-mono text-xs">
                        {ledger.gstin || '-'}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-[var(--text)]">
                        {formatCurrency(Number(ledger.openingBalance))}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono font-medium text-[var(--text)]">
                        {formatCurrency(Number(ledger.closingBalance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
                <span className="text-sm text-[var(--text-secondary)]">
                  Page {data.page} of {data.pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page >= data.pages}
                    className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

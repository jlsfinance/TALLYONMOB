'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Receipt, Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { Voucher } from '@/types';

interface VouchersResponse {
  items: Voucher[];
  total: number;
  page: number;
  pages: number;
}

export default function VouchersPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<VouchersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

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
      if (voucherType) params.set('type', voucherType);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      const res = await fetchApi<VouchersResponse>(`/api/vouchers?${params}`);
      setData(res);
    } catch {
      // handled by fetchApi
    } finally {
      setLoading(false);
    }
  }, [activeCompany, page, search, voucherType, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, voucherType, fromDate, toDate, activeCompany]);

  const types = ['', 'Sales', 'Purchase', 'Receipt', 'Payment', 'Journal', 'Contra', 'Credit Note', 'Debit Note'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Vouchers</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {data ? `${data.total} vouchers` : 'Browse vouchers'}
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            showFilters ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search by number, party, narration..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <select
          value={voucherType}
          onChange={(e) => setVoucherType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">All Types</option>
          {types.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFromDate(''); setToDate(''); }}
              className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
            >
              Clear dates
            </button>
          </div>
        </div>
      )}

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
            <Receipt className="w-10 h-10 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
            <p className="text-[var(--text-secondary)]">No vouchers found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <th className="px-5 py-3 font-medium">Voucher #</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Party</th>
                    <th className="px-5 py-3 font-medium">Narration</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.items.map((v) => (
                    <tr key={v.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[var(--text)]">
                        {v.voucherNumber}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                          {v.voucherType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {formatDate(v.voucherDate)}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text)]">{v.partyName || '-'}</td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-[200px] truncate">
                        {v.narration || '-'}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono font-medium text-[var(--text)]">
                        {formatCurrency(Number(v.grandTotal))}
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

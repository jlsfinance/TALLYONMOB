'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Package, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { StockItem } from '@/types';

interface StockResponse {
  items: StockItem[];
  total: number;
  page: number;
  pages: number;
}

export default function StockPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<StockResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [stockGroup, setStockGroup] = useState('');
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
      if (stockGroup) params.set('group', stockGroup);
      const res = await fetchApi<StockResponse>(`/api/stock?${params}`);
      setData(res);
    } catch {
      // handled by fetchApi
    } finally {
      setLoading(false);
    }
  }, [activeCompany, page, search, stockGroup]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, stockGroup, activeCompany]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Stock Items</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {data ? `${data.total} stock items` : 'Browse stock inventory'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search by name, alias, HSN code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>
        <input
          type="text"
          placeholder="Stock group..."
          value={stockGroup}
          onChange={(e) => setStockGroup(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] w-48"
        />
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
            <Package className="w-10 h-10 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
            <p className="text-[var(--text-secondary)]">No stock items found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Group</th>
                    <th className="px-5 py-3 font-medium">HSN Code</th>
                    <th className="px-5 py-3 font-medium">Unit</th>
                    <th className="px-5 py-3 font-medium text-right">Rate</th>
                    <th className="px-5 py-3 font-medium text-right">Opening</th>
                    <th className="px-5 py-3 font-medium text-right">Closing</th>
                    <th className="px-5 py-3 font-medium text-right">GST %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.items.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-[var(--text)]">
                        {item.name}
                        {item.alias && (
                          <span className="ml-2 text-xs text-[var(--text-secondary)]">({item.alias})</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{item.stockGroup || '-'}</td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] font-mono text-xs">{item.hsnCode || '-'}</td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{item.unit || '-'}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-[var(--text)]">
                        {item.rate ? formatCurrency(Number(item.rate)) : '-'}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono text-[var(--text)]">
                        {Number(item.openingBalance).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono font-medium text-[var(--text)]">
                        {Number(item.closingBalance).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-[var(--text-secondary)]">
                        {item.gstRate ? `${item.gstRate}%` : '-'}
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SyncHistory } from '@/types';

interface SyncHistoryResponse {
  data: SyncHistory[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    COMPLETED: { icon: CheckCircle, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Completed' },
    FAILED: { icon: XCircle, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Failed' },
    RUNNING: { icon: Loader2, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Running' },
    PENDING: { icon: Clock, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Pending' },
    PARTIAL: { icon: AlertTriangle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'Partial' },
  };
  const c = config[status] || config.PENDING;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'RUNNING' ? 'animate-spin' : ''}`} />
      {c.label}
    </span>
  );
}

export default function SyncHistoryPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<SyncHistory[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await fetchApi<SyncHistoryResponse>(`/api/sync-history?companyId=${activeCompany.id}&page=${page}&limit=20`);
      setData(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      // handled by fetchApi
    } finally {
      setLoading(false);
    }
  }, [activeCompany, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [activeCompany]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Sync History</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {pagination.total > 0 ? `${pagination.total} sync records` : 'Tally data sync history'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view sync history.</p>
        </div>
      ) : loading && data.length === 0 ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-16">
          <RefreshCw className="w-12 h-12 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
          <p className="text-[var(--text-secondary)] mb-2">No sync history yet.</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Sync your Tally data using the desktop agent to see history here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {data.map((sync) => (
              <div
                key={sync.id}
                className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={sync.status} />
                    <span className="text-sm font-medium text-[var(--text)] capitalize">{sync.syncType} Sync</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                    <span>Started: {formatDateTime(sync.startedAt)}</span>
                    {sync.completedAt && <span>Completed: {formatDateTime(sync.completedAt)}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-lg font-bold text-[var(--text)]">{sync.ledgersSynced.toLocaleString()}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Ledgers</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-lg font-bold text-[var(--text)]">{sync.vouchersSynced.toLocaleString()}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Vouchers</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-lg font-bold text-[var(--text)]">{sync.stockItemsSynced.toLocaleString()}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Stock Items</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)]">
                    <p className="text-lg font-bold text-[var(--text)]">{sync.totalRecords.toLocaleString()}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Total Records</p>
                  </div>
                </div>

                {sync.errorMessage && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                    {sync.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 text-sm transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-40 text-sm transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

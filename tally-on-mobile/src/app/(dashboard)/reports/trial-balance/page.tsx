'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ListChecks } from 'lucide-react';
import Link from 'next/link';

interface TrialBalanceData {
  rows: { ledgerName: string; group: string; debit: number; credit: number }[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

export default function TrialBalancePage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    fetchApi<TrialBalanceData>(`/api/reports/trial-balance?companyId=${activeCompany.id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCompany]);

  const filtered = data?.rows.filter(
    (r) => !search || r.ledgerName.toLowerCase().includes(search.toLowerCase()) || r.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">Trial Balance</h1>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view Trial Balance.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          {data && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
                <p className="text-sm text-[var(--text-secondary)]">Total Debit</p>
                <p className="text-2xl font-bold text-[var(--text)] mt-1">{formatCurrency(data.totalDebit)}</p>
              </div>
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
                <p className="text-sm text-[var(--text-secondary)]">Total Credit</p>
                <p className="text-2xl font-bold text-[var(--text)] mt-1">{formatCurrency(data.totalCredit)}</p>
              </div>
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
                <p className="text-sm text-[var(--text-secondary)]">Difference</p>
                <p className={`text-2xl font-bold mt-1 ${data.difference === 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {formatCurrency(data.difference)}
                </p>
              </div>
            </div>
          )}

          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search ledger or group..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* Table */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-10 bg-[var(--bg-secondary)] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !filtered || filtered.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-secondary)]">
                <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No trial balance data found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <th className="px-5 py-3 font-medium">#</th>
                      <th className="px-5 py-3 font-medium">Ledger Name</th>
                      <th className="px-5 py-3 font-medium">Group</th>
                      <th className="px-5 py-3 font-medium text-right">Debit</th>
                      <th className="px-5 py-3 font-medium text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filtered.map((row, i) => (
                      <tr key={i} className="hover:bg-[var(--bg-secondary)] transition-colors">
                        <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{i + 1}</td>
                        <td className="px-5 py-2.5 text-sm font-medium text-[var(--text)]">{row.ledgerName}</td>
                        <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{row.group}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">
                          {row.debit > 0 ? formatCurrency(row.debit) : ''}
                        </td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">
                          {row.credit > 0 ? formatCurrency(row.credit) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {data && (
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border)] font-semibold bg-[var(--bg-secondary)]">
                        <td className="px-5 py-3 text-sm text-[var(--text)]" colSpan={3}>Total</td>
                        <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(data.totalDebit)}</td>
                        <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(data.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

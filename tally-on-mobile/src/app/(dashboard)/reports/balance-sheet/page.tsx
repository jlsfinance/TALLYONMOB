'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Scale } from 'lucide-react';
import Link from 'next/link';

interface BalanceSheetData {
  assets: { name: string; group: string; amount: number }[];
  liabilities: { name: string; group: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  difference: number;
}

export default function BalanceSheetPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    fetchApi<BalanceSheetData>(`/api/reports/balance-sheet?companyId=${activeCompany.id}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCompany]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">Balance Sheet</h1>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view the balance sheet.</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <p>Failed to load balance sheet.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Total Assets</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(data.totalAssets)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Total Liabilities</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(data.totalLiabilities)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Difference</p>
              <p className={`text-2xl font-bold mt-1 ${data.difference === 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {formatCurrency(data.difference)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Assets */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-green-50 dark:bg-green-900/10">
                <h2 className="font-semibold text-[var(--text)]">Assets</h2>
              </div>
              {data.assets.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)] text-sm">No assets found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)]">
                        <th className="px-5 py-2.5 font-medium">Ledger</th>
                        <th className="px-5 py-2.5 font-medium">Group</th>
                        <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.assets.map((a, i) => (
                        <tr key={i} className="hover:bg-[var(--bg-secondary)] transition-colors">
                          <td className="px-5 py-2.5 text-sm text-[var(--text)]">{a.name}</td>
                          <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{a.group}</td>
                          <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">{formatCurrency(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border)] font-semibold">
                        <td className="px-5 py-3 text-sm text-[var(--text)]" colSpan={2}>Total Assets</td>
                        <td className="px-5 py-3 text-sm text-right font-mono text-green-600 dark:text-green-400">{formatCurrency(data.totalAssets)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Liabilities */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] bg-red-50 dark:bg-red-900/10">
                <h2 className="font-semibold text-[var(--text)]">Liabilities</h2>
              </div>
              {data.liabilities.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)] text-sm">No liabilities found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)]">
                        <th className="px-5 py-2.5 font-medium">Ledger</th>
                        <th className="px-5 py-2.5 font-medium">Group</th>
                        <th className="px-5 py-2.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.liabilities.map((l, i) => (
                        <tr key={i} className="hover:bg-[var(--bg-secondary)] transition-colors">
                          <td className="px-5 py-2.5 text-sm text-[var(--text)]">{l.name}</td>
                          <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{l.group}</td>
                          <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">{formatCurrency(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border)] font-semibold">
                        <td className="px-5 py-3 text-sm text-[var(--text)]" colSpan={2}>Total Liabilities</td>
                        <td className="px-5 py-3 text-sm text-right font-mono text-red-600 dark:text-red-400">{formatCurrency(data.totalLiabilities)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface OutstandingItem {
  partyName: string;
  ledgerType: string;
  outstandingAmount: number;
  overdueDays: number;
  lastTransactionDate: string | null;
  phone: string | null;
  gstin: string | null;
}

interface OutstandingData {
  type: string;
  totalOutstanding: number;
  totalParties: number;
  items: OutstandingItem[];
}

export default function OutstandingPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<OutstandingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('receivable');

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    fetchApi<OutstandingData>(`/api/reports/outstanding?companyId=${activeCompany.id}&type=${type}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCompany, type]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">Outstanding</h1>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setType('receivable')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'receivable' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
        >
          Receivables
        </button>
        <button
          onClick={() => setType('payable')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'payable' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
        >
          Payables
        </button>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view outstanding reports.</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--text-secondary)]"><p>Failed to load report.</p></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Total Outstanding</p>
              <p className={`text-2xl font-bold mt-1 ${type === 'receivable' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(data.totalOutstanding)}
              </p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Total Parties</p>
              <p className="text-2xl font-bold text-[var(--text)] mt-1">{data.totalParties}</p>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            {data.items.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-secondary)]">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No outstanding {type === 'receivable' ? 'receivables' : 'payables'} found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <th className="px-5 py-3 font-medium">Party Name</th>
                      <th className="px-5 py-3 font-medium">GSTIN</th>
                      <th className="px-5 py-3 font-medium">Phone</th>
                      <th className="px-5 py-3 font-medium text-right">Outstanding</th>
                      <th className="px-5 py-3 font-medium text-right">Overdue Days</th>
                      <th className="px-5 py-3 font-medium">Last Transaction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.items.map((item, i) => (
                      <tr key={i} className="hover:bg-[var(--bg-secondary)] transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-[var(--text)]">{item.partyName}</td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)] font-mono text-xs">{item.gstin || '-'}</td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{item.phone || '-'}</td>
                        <td className="px-5 py-3 text-sm text-right font-mono font-medium text-[var(--text)]">{formatCurrency(item.outstandingAmount)}</td>
                        <td className="px-5 py-3 text-sm text-right">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.overdueDays > 90 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : item.overdueDays > 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                            {item.overdueDays} days
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">{item.lastTransactionDate ? formatDate(item.lastTransactionDate) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

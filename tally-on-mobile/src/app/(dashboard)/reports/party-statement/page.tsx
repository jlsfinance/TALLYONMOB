'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { useUIStore } from '@/stores/ui-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { UserCheck } from 'lucide-react';
import Link from 'next/link';

interface StatementEntry {
  id: string;
  date: string;
  voucherNumber: string;
  voucherType: string;
  narration: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface StatementData {
  ledger: { name: string; parent: string } | null;
  openingBalance: number;
  entries: StatementEntry[];
  closingBalance: number;
}

export default function PartyStatementPage() {
  const { activeCompany } = useCompanyStore();
  const { dateRange } = useUIStore();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [fromDate, setFromDate] = useState(dateRange.fromDate);
  const [toDate, setToDate] = useState(dateRange.toDate);

  const load = () => {
    if (!activeCompany || !partyName.trim()) return;
    setLoading(true);
    const params = new URLSearchParams({
      companyId: activeCompany.id,
      party: partyName.trim(),
      fromDate,
      toDate,
    });
    fetchApi<StatementData>(`/api/reports/party-statement?${params}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">Party Statement</h1>
      </div>

      {/* Search form */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Party Name *</label>
            <input
              type="text"
              placeholder="Enter party/ledger name..."
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
          </div>
          <button
            onClick={load}
            disabled={!partyName.trim() || loading}
            className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company and enter a party name to view statement.</p>
        </div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Opening Balance</p>
              <p className="text-xl font-bold text-[var(--text)] mt-1">{formatCurrency(data.openingBalance)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Closing Balance</p>
              <p className={`text-xl font-bold mt-1 ${data.closingBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(data.closingBalance)}
              </p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Transactions</p>
              <p className="text-xl font-bold text-[var(--text)] mt-1">{data.entries.length}</p>
            </div>
          </div>

          {/* Entries table */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h2 className="font-semibold text-[var(--text)]">{data.ledger?.name || partyName}</h2>
              {data.ledger?.parent && <p className="text-xs text-[var(--text-secondary)] mt-0.5">Group: {data.ledger.parent}</p>}
            </div>
            {data.entries.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-secondary)]">
                <p>No transactions found for this party</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Voucher #</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Narration</th>
                      <th className="px-5 py-3 font-medium text-right">Debit</th>
                      <th className="px-5 py-3 font-medium text-right">Credit</th>
                      <th className="px-5 py-3 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    <tr className="bg-[var(--bg-secondary)]">
                      <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]" colSpan={6}>Opening Balance</td>
                      <td className="px-5 py-2.5 text-sm text-right font-mono font-medium">{formatCurrency(data.openingBalance)}</td>
                    </tr>
                    {data.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                        <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{formatDate(entry.date)}</td>
                        <td className="px-5 py-2.5 text-sm font-medium text-[var(--text)]">{entry.voucherNumber}</td>
                        <td className="px-5 py-2.5 text-sm">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                            {entry.voucherType}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)] max-w-[200px] truncate">{entry.narration || '-'}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : ''}
                        </td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono text-[var(--text)]">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : ''}
                        </td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono font-medium text-[var(--text)]">
                          {formatCurrency(entry.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] font-semibold bg-[var(--bg-secondary)]">
                      <td className="px-5 py-3 text-sm" colSpan={4}>Closing Balance</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(data.entries.reduce((s, e) => s + e.debit, 0))}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(data.entries.reduce((s, e) => s + e.credit, 0))}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono">{formatCurrency(data.closingBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

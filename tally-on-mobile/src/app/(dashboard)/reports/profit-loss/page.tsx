'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { useUIStore } from '@/stores/ui-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface ProfitLossData {
  period: string;
  sales: number;
  purchases: number;
  directIncome: number;
  directExpense: number;
  indirectIncome: number;
  indirectExpense: number;
  grossProfit: number;
  netProfit: number;
  grossProfitPercent: string;
  netProfitPercent: string;
}

function Row({ label, amount, indent, bold, color }: { label: string; amount: number; indent?: boolean; bold?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-5 ${indent ? 'pl-10' : ''} ${bold ? 'font-semibold border-t-2 border-[var(--border)]' : 'border-b border-[var(--border)]'} hover:bg-[var(--bg-secondary)] transition-colors`}>
      <span className={`text-sm ${bold ? 'text-[var(--text)]' : 'text-[var(--text-secondary)]'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : ''} ${color || 'text-[var(--text)]'}`}>{formatCurrency(amount)}</span>
    </div>
  );
}

export default function ProfitLossPage() {
  const { activeCompany } = useCompanyStore();
  const { dateRange } = useUIStore();
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(dateRange.fromDate);
  const [toDate, setToDate] = useState(dateRange.toDate);

  const load = () => {
    if (!activeCompany || !fromDate || !toDate) return;
    setLoading(true);
    fetchApi<ProfitLossData>(`/api/reports/profit-loss?companyId=${activeCompany.id}&fromDate=${fromDate}&toDate=${toDate}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeCompany, fromDate, toDate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">Profit & Loss</h1>
      </div>

      {/* Date filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
        </div>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view Profit & Loss.</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--text-secondary)]"><p>Failed to load report.</p></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Gross Profit</p>
              <p className={`text-2xl font-bold mt-1 ${data.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(data.grossProfit)}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{data.grossProfitPercent}% margin</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">Net Profit</p>
              <p className={`text-2xl font-bold mt-1 ${data.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(data.netProfit)}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{data.netProfitPercent}% margin</p>
            </div>
          </div>

          {/* Details */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)]">
              <h2 className="font-semibold text-[var(--text)]">Period: {data.period}</h2>
            </div>
            <div className="py-2">
              <Row label="Sales" amount={data.sales} />
              <Row label="Less: Purchases" amount={data.purchases} />
              <Row label="Add: Direct Income" amount={data.directIncome} indent />
              <Row label="Less: Direct Expense" amount={data.directExpense} indent />
              <Row label="Gross Profit" amount={data.grossProfit} bold color={data.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
              <Row label="Add: Indirect Income" amount={data.indirectIncome} />
              <Row label="Less: Indirect Expense" amount={data.indirectExpense} />
              <Row label="Net Profit" amount={data.netProfit} bold color={data.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

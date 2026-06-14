'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Building2,
  BookOpen,
  Receipt,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DashboardData {
  totalSales: number;
  totalPurchase: number;
  receivables: number;
  payables: number;
  cashBankBalance: number;
  totalLedgers: number;
  totalVouchers: number;
  totalStockItems: number;
  recentVouchers: Array<{
    id: string;
    voucherNumber: string;
    voucherType: string;
    voucherDate: string;
    partyName: string;
    grandTotal: number;
  }>;
  salesTrend: { date: string; amount: number }[];
  purchaseTrend: { date: string; amount: number }[];
  lastSyncAt: string | null;
}

export default function DashboardPage() {
  const { activeCompany } = useCompanyStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    fetch(`/api/dashboard?companyId=${activeCompany.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success || res.ok) setData(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeCompany]);

  if (!activeCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[var(--text-secondary)]">Select a company to view dashboard</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 animate-pulse">
            <div className="h-4 bg-[var(--bg-secondary)] rounded w-24 mb-3" />
            <div className="h-8 bg-[var(--bg-secondary)] rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const statCards = [
    { label: 'Total Sales', value: formatCurrency(data.totalSales), icon: <TrendingUp size={20} />, color: 'green' as const },
    { label: 'Total Purchase', value: formatCurrency(data.totalPurchase), icon: <TrendingDown size={20} />, color: 'blue' as const },
    { label: 'Receivables', value: formatCurrency(data.receivables), icon: <ArrowUpRight size={20} />, color: 'green' as const },
    { label: 'Payables', value: formatCurrency(data.payables), icon: <ArrowDownRight size={20} />, color: 'red' as const },
    { label: 'Total Ledgers', value: String(data.totalLedgers), icon: <BookOpen size={20} />, color: 'purple' as const },
    { label: 'Total Vouchers', value: String(data.totalVouchers), icon: <Receipt size={20} />, color: 'blue' as const },
    { label: 'Stock Items', value: String(data.totalStockItems), icon: <Package size={20} />, color: 'yellow' as const },
    { label: 'Companies', value: '1', icon: <Building2 size={20} />, color: 'blue' as const },
  ];

  const chartData = data.salesTrend.map((s, i) => ({
    month: s.date,
    sales: s.amount,
    purchase: data.purchaseTrend[i]?.amount || 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {activeCompany.name} {data.lastSyncAt ? `• Last synced ${formatDate(data.lastSyncAt)}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">{card.label}</p>
                <p className="text-2xl font-bold text-[var(--text)] mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${
                card.color === 'green' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                card.color === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                card.color === 'yellow' ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' :
                card.color === 'purple' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' :
                'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
              }`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Sales vs Purchase Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
              />
              <Area type="monotone" dataKey="sales" stroke="#16a34a" fill="#16a34a20" name="Sales" />
              <Area type="monotone" dataKey="purchase" stroke="#2563eb" fill="#2563eb20" name="Purchase" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.recentVouchers.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--text)]">Recent Vouchers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase">Party</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-secondary)] uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.recentVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-[var(--bg-secondary)]">
                    <td className="px-4 py-3 text-sm text-[var(--text)]">{v.voucherNumber}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        {v.voucherType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{formatDate(v.voucherDate)}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text)]">{v.partyName}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-[var(--text)]">{formatCurrency(v.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

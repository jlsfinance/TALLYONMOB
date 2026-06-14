'use client';

import Link from 'next/link';
import {
  Scale,
  TrendingUp,
  ListChecks,
  FileText,
  AlertCircle,
  UserCheck,
} from 'lucide-react';

const reports = [
  { href: '/reports/balance-sheet', label: 'Balance Sheet', description: 'Assets vs liabilities snapshot', icon: Scale, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { href: '/reports/profit-loss', label: 'Profit & Loss', description: 'Income, expenses, and net profit', icon: TrendingUp, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  { href: '/reports/trial-balance', label: 'Trial Balance', description: 'Debit and credit totals per ledger', icon: ListChecks, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  { href: '/reports/gst', label: 'GST Reports', description: 'GSTR-1 and GSTR-3B summaries', icon: FileText, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { href: '/reports/outstanding', label: 'Outstanding', description: 'Receivables and payables aging', icon: AlertCircle, color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  { href: '/reports/party-statement', label: 'Party Statement', description: 'Transaction ledger for a party', icon: UserCheck, color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Reports</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Financial reports and analysis</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${report.color} flex-shrink-0`}>
                <report.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                  {report.label}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">{report.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

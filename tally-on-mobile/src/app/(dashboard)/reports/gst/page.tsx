'use client';

import { useEffect, useState } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { useUIStore } from '@/stores/ui-store';
import { fetchApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText } from 'lucide-react';
import Link from 'next/link';

interface GSTInvoice {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  partyName: string;
  grandTotal: number;
  gstDetails: { taxableValue: number; cgst: number; sgst: number; igst: number; cess: number };
}

interface GSTData {
  reportType: string;
  period: string;
  companyGstin: string;
  companyName: string;
  totalInvoices: number;
  totalTaxableValue: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalCess: number;
  totalTax: number;
  invoices: GSTInvoice[];
}

export default function GSTPage() {
  const { activeCompany } = useCompanyStore();
  const { dateRange } = useUIStore();
  const [data, setData] = useState<GSTData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('gstr1');
  const [fromDate, setFromDate] = useState(dateRange.fromDate);
  const [toDate, setToDate] = useState(dateRange.toDate);

  const load = () => {
    if (!activeCompany || !fromDate || !toDate) return;
    setLoading(true);
    fetchApi<GSTData>(`/api/reports/gst?companyId=${activeCompany.id}&fromDate=${fromDate}&toDate=${toDate}&type=${reportType}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeCompany, fromDate, toDate, reportType]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-[var(--primary)] text-sm hover:underline">Reports</Link>
        <span className="text-[var(--text-secondary)]">/</span>
        <h1 className="text-2xl font-bold text-[var(--text)]">GST Reports</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Report Type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
            <option value="gstr1">GSTR-1 (Outward Supplies)</option>
            <option value="gstr3b">GSTR-3B (Summary)</option>
          </select>
        </div>
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
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view GST reports.</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-[var(--text-secondary)]"><p>Failed to load GST report.</p></div>
      ) : (
        <>
          {/* GSTIN info */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-[var(--text-secondary)]">Company: </span><span className="font-medium text-[var(--text)]">{data.companyName}</span></div>
              <div><span className="text-[var(--text-secondary)]">GSTIN: </span><span className="font-mono text-[var(--text)]">{data.companyGstin || 'N/A'}</span></div>
              <div><span className="text-[var(--text-secondary)]">Period: </span><span className="text-[var(--text)]">{data.period}</span></div>
              <div><span className="text-[var(--text-secondary)]">Report: </span><span className="text-[var(--text)]">{data.reportType}</span></div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Taxable Value</p>
              <p className="text-lg font-bold text-[var(--text)] mt-1">{formatCurrency(data.totalTaxableValue)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">CGST</p>
              <p className="text-lg font-bold text-[var(--text)] mt-1">{formatCurrency(data.totalCGST)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">SGST</p>
              <p className="text-lg font-bold text-[var(--text)] mt-1">{formatCurrency(data.totalSGST)}</p>
            </div>
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-secondary)]">Total Tax</p>
              <p className="text-lg font-bold text-[var(--primary)] mt-1">{formatCurrency(data.totalTax)}</p>
            </div>
          </div>

          {/* Invoices table (GSTR-1) */}
          {reportType === 'gstr1' && data.invoices.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <h2 className="font-semibold text-[var(--text)]">Invoices ({data.totalInvoices})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-secondary)] border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <th className="px-5 py-3 font-medium">Invoice #</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Party</th>
                      <th className="px-5 py-3 font-medium text-right">Taxable</th>
                      <th className="px-5 py-3 font-medium text-right">CGST</th>
                      <th className="px-5 py-3 font-medium text-right">SGST</th>
                      <th className="px-5 py-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                        <td className="px-5 py-2.5 text-sm font-medium text-[var(--text)]">{inv.voucherNumber}</td>
                        <td className="px-5 py-2.5 text-sm text-[var(--text-secondary)]">{formatDate(inv.voucherDate)}</td>
                        <td className="px-5 py-2.5 text-sm text-[var(--text)]">{inv.partyName || '-'}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono">{formatCurrency(inv.gstDetails.taxableValue)}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono">{formatCurrency(inv.gstDetails.cgst)}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono">{formatCurrency(inv.gstDetails.sgst)}</td>
                        <td className="px-5 py-2.5 text-sm text-right font-mono font-medium">{formatCurrency(Number(inv.grandTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GSTR-3B Summary */}
          {reportType === 'gstr3b' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)] bg-green-50 dark:bg-green-900/10">
                  <h2 className="font-semibold text-[var(--text)]">3.1 Outward Supplies</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Taxable Value</span><span className="font-mono">{formatCurrency((data as any).outward?.taxableValue ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">CGST</span><span className="font-mono">{formatCurrency((data as any).outward?.cgst ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">SGST</span><span className="font-mono">{formatCurrency((data as any).outward?.sgst ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">IGST</span><span className="font-mono">{formatCurrency((data as any).outward?.igst ?? 0)}</span></div>
                </div>
              </div>
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)] bg-blue-50 dark:bg-blue-900/10">
                  <h2 className="font-semibold text-[var(--text)]">3.2 Inward Supplies</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">Taxable Value</span><span className="font-mono">{formatCurrency((data as any).inward?.taxableValue ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">CGST</span><span className="font-mono">{formatCurrency((data as any).inward?.cgst ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">SGST</span><span className="font-mono">{formatCurrency((data as any).inward?.sgst ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-secondary)]">IGST</span><span className="font-mono">{formatCurrency((data as any).inward?.igst ?? 0)}</span></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

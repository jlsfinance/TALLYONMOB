import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import { useQuery } from '@tanstack/react-query';
import { Building2, ArrowRight, TrendingUp, TrendingDown, Wallet, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CompanySummary {
    id: string;
    name: string;
    totalSales: number;
    totalPurchase: number;
    totalReceipts: number;
    totalPayments: number;
    receivables: number;
    payables: number;
    voucherCount: number;
    recentDate: string;
}

function formatCompact(amount: number) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

export default function MultiCompanyDashboard() {
    const { companies, selectedCompany, selectCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);

    const { data: summaries, isLoading } = useQuery({
        queryKey: ['multi-company', companies?.map((c: any) => c.id).join(',')],
        queryFn: async () => {
            if (!companies || companies.length <= 1) return [];
            const currentFY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
            const fyFrom = `${currentFY}-04-01`;
            const fyTo = `${currentFY + 1}-03-31`;

            const results = await Promise.all(
                companies.map(async (company: any) => {
                    const [vouchersRes, ledgersRes] = await Promise.all([
                        supabase.from('vouchers')
                            .select('voucher_type, grand_total, total_amount, voucher_date')
                            .eq('company_id', company.id).eq('is_deleted', false)
                            .gte('voucher_date', fyFrom).lte('voucher_date', fyTo),
                        supabase.from('ledgers')
                            .select('current_balance, parent')
                            .eq('company_id', company.id),
                    ]);

                    const vouchers = vouchersRes.data || [];
                    const ledgers = ledgersRes.data || [];

                    const sales = vouchers.filter((v: any) => v.voucher_type === 'Sales');
                    const purchases = vouchers.filter((v: any) => v.voucher_type === 'Purchase');
                    const receipts = vouchers.filter((v: any) => v.voucher_type === 'Receipt');
                    const payments = vouchers.filter((v: any) => v.voucher_type === 'Payment');

                    const debtors = ledgers.filter((l: any) => l.parent === 'Sundry Debtors');
                    const creditors = ledgers.filter((l: any) => l.parent === 'Sundry Creditors');

                    return {
                        id: company.id,
                        name: company.name,
                        totalSales: sales.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
                        totalPurchase: purchases.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
                        totalReceipts: receipts.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
                        totalPayments: payments.reduce((s: number, v: any) => s + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0),
                        receivables: debtors.reduce((s: number, d: any) => s + (Number(d.current_balance) || 0), 0),
                        payables: creditors.reduce((s: number, c: any) => s + Math.abs(Number(c.current_balance) || 0), 0),
                        voucherCount: vouchers.length,
                        recentDate: vouchers.length > 0 ? vouchers[vouchers.length - 1].voucher_date : '',
                    };
                })
            );
            return results;
        },
        enabled: !!companies && companies.length > 1,
        staleTime: 5 * 60 * 1000,
    });

    if (!companies || companies.length <= 1 || !summaries || summaries.length === 0) return null;

    const grandTotal = summaries.reduce((acc, s) => ({
        sales: acc.sales + s.totalSales,
        purchases: acc.purchases + s.totalPurchase,
        receivables: acc.receivables + s.receivables,
        payables: acc.payables + s.payables,
    }), { sales: 0, purchases: 0, receivables: 0, payables: 0 });

    return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                        <Building2 size={16} className="text-[var(--primary)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-[var(--on-surface)]">All Companies</h3>
                        <p className="text-[10px] text-[var(--text-muted)]">{summaries.length} companies · FY {new Date().getMonth() >= 3 ? `${new Date().getFullYear()}-${(new Date().getFullYear()+1).toString().slice(-2)}` : `${new Date().getFullYear()-1}-${new Date().getFullYear().toString().slice(-2)}`}</p>
                    </div>
                </div>
                <button onClick={() => setCollapsed(!collapsed)}
                    className="text-[10px] font-bold text-[var(--primary)] hover:underline flex items-center gap-0.5">
                    {collapsed ? 'Show' : 'Hide'} <ChevronRight size={10} className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
                </button>
            </div>

            {/* Grand Total Bar */}
            {!collapsed && (
                <div className="grid grid-cols-4 gap-px bg-[var(--border)]">
                    {[
                        { label: 'Total Sales', value: grandTotal.sales, color: 'text-emerald-600' },
                        { label: 'Total Purchase', value: grandTotal.purchases, color: 'text-rose-600' },
                        { label: 'Receivables', value: grandTotal.receivables, color: 'text-amber-600' },
                        { label: 'Payables', value: grandTotal.payables, color: 'text-blue-600' },
                    ].map(item => (
                        <div key={item.label} className="bg-[var(--surface)] p-3 text-center">
                            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase">{item.label}</p>
                            <p className={`text-sm font-black mt-0.5 ${item.color}`}>{formatCompact(item.value)}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Company Cards */}
            {!collapsed && (
                <div className="p-3 space-y-2">
                    {isLoading ? (
                        <div className="py-6 flex justify-center"><RefreshCw size={18} className="animate-spin text-[var(--primary)]" /></div>
                    ) : summaries.map(s => {
                        const isActive = selectedCompany?.id === s.id;
                        const profit = s.totalSales - s.totalPurchase;
                        return (
                            <button key={s.id}
                                onClick={() => { selectCompany(s.id); navigate('/dashboard'); }}
                                className={`w-full p-3 rounded-xl border transition-all text-left ${
                                    isActive
                                        ? 'border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]/20'
                                        : 'border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[var(--surface-container)]'
                                }`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                                            isActive ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-container)] text-[var(--text-muted)]'
                                        }`}>
                                            {s.name.charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold truncate">{s.name}</span>
                                        {isActive && <span className="text-[8px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-1.5 py-0.5 rounded">ACTIVE</span>}
                                    </div>
                                    <ArrowRight size={12} className="text-[var(--text-muted)] shrink-0" />
                                </div>

                                {/* Mini Stats */}
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Sales</p>
                                        <p className="text-xs font-black text-emerald-600">{formatCompact(s.totalSales)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Purchase</p>
                                        <p className="text-xs font-black text-rose-600">{formatCompact(s.totalPurchase)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Balance</p>
                                        <p className={`text-xs font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {profit >= 0 ? '+' : ''}{formatCompact(profit)}
                                        </p>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mt-2 flex gap-1">
                                    <div className="flex-1 h-1 rounded-full bg-[var(--surface-container)] overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((s.totalSales / (s.totalSales + s.totalPurchase || 1)) * 100, 100)}%` }} />
                                    </div>
                                    <div className="flex-1 h-1 rounded-full bg-[var(--surface-container)] overflow-hidden">
                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min((s.totalPurchase / (s.totalSales + s.totalPurchase || 1)) * 100, 100)}%` }} />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

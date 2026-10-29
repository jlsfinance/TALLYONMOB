import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useFY, getFYDates } from '@/contexts/FYContext';
import { supabase } from '@/lib/supabase';
import { CompactYearFilter } from '@/components/shared/CompactYearFilter';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import { EmptyState, Spinner } from '@/components/ui/GlassUI';
import './SoldQtyReport.css';
import './ReportsPage.css';

const PAGE = 1000;

type Row = { label: string; sub?: string; count?: number; value: number };

type ReportDef = {
    title: string;
    columns: [string, string, string];
    load: (cid: string, from: string, to: string) => Promise<Row[]>;
};

async function fetchAll(build: (from: number, to: number) => any) {
    const out: any[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return out;
}

const amount = (r: any) => Math.abs(Number(r.net_amount ?? r.grand_total ?? r.total_amount ?? r.amount) || 0);

function group(rows: any[], keyOf: (r: any) => string, valueOf: (r: any) => number, countOf?: (r: any) => number): Row[] {
    const map = new Map<string, Row>();
    for (const r of rows) {
        const key = keyOf(r) || 'Unspecified';
        const row = map.get(key) || { label: key, value: 0, count: 0 };
        row.value += valueOf(r);
        row.count = (row.count || 0) + (countOf ? countOf(r) : 1);
        map.set(key, row);
    }
    return [...map.values()];
}

const byValue = (rows: Row[]) => rows.sort((a, b) => b.value - a.value);
const byLabel = (rows: Row[]) => rows.sort((a, b) => a.label.localeCompare(b.label));

const salesRows = (cid: string, from: string, to: string) => fetchAll((i, j) =>
    supabase.from('sales')
        .select('invoice_number,invoice_date,party_ledger_name,net_amount,gross_amount')
        .eq('company_id', cid).gte('invoice_date', from).lte('invoice_date', to)
        .order('id').range(i, j));

const voucherRows = (cid: string, from: string, to: string) => fetchAll((i, j) =>
    supabase.from('vouchers')
        .select('voucher_type,voucher_date,party_name,grand_total,total_amount')
        .eq('company_id', cid).eq('is_deleted', false)
        .gte('voucher_date', from).lte('voucher_date', to)
        .order('id').range(i, j));

const soldItems = (cid: string, from: string, to: string) => fetchAll((i, j) =>
    supabase.from('sales_items')
        .select('stock_item_name,unit,quantity,amount,sales!inner(invoice_date)')
        .eq('company_id', cid)
        .gte('sales.invoice_date', from).lte('sales.invoice_date', to)
        .order('id').range(i, j));

const purchasedItems = (cid: string, from: string, to: string) => fetchAll((i, j) =>
    supabase.from('purchase_items')
        .select('stock_item_name,unit,quantity,amount,purchases!inner(invoice_date)')
        .eq('company_id', cid)
        .gte('purchases.invoice_date', from).lte('purchases.invoice_date', to)
        .order('id').range(i, j));

const monthLabel = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? 'Unknown' : dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const itemRows = (rows: any[], byQty: boolean): Row[] => {
    const map = new Map<string, Row>();
    for (const r of rows) {
        const key = `${r.stock_item_name || 'Unnamed'}${r.unit ? ` (${r.unit})` : ''}`;
        const row = map.get(key) || { label: key, value: 0, count: 0 };
        row.value += Math.abs(Number(r.amount) || 0);
        row.count = (row.count || 0) + Math.abs(Number(r.quantity) || 0);
        map.set(key, row);
    }
    return [...map.values()].sort((a, b) => (byQty ? (b.count || 0) - (a.count || 0) : b.value - a.value));
};

const REPORTS: Record<string, ReportDef> = {
    'sales-month': {
        title: 'Sales By Month', columns: ['Month', 'Bills', 'Amount'],
        load: async (cid, from, to) => byLabel(group(await salesRows(cid, from, to), r => monthLabel(r.invoice_date), amount)),
    },
    'sales-bills': {
        title: 'Sales By Bills', columns: ['Invoice', 'Date', 'Amount'],
        load: async (cid, from, to) => (await salesRows(cid, from, to))
            .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''))
            .map(r => ({ label: r.invoice_number || '-', sub: `${r.party_ledger_name || ''} · ${r.invoice_date || ''}`, value: amount(r) })),
    },
    'sales-ledger': {
        title: 'Sales By Ledger', columns: ['Party', 'Bills', 'Amount'],
        load: async (cid, from, to) => byValue(group(await salesRows(cid, from, to), r => r.party_ledger_name, amount)),
    },
    'sales-item': {
        title: 'Sales By Stock Item', columns: ['Item', 'Qty', 'Amount'],
        load: async (cid, from, to) => itemRows(await soldItems(cid, from, to), false),
    },
    'sales-vtype': {
        title: 'Sales By Voucher Type', columns: ['Voucher Type', 'Count', 'Amount'],
        load: async (cid, from, to) => byValue(group(await voucherRows(cid, from, to), r => r.voucher_type, amount)),
    },
    'sales-lg': {
        title: 'Sales By Ledger Group', columns: ['Group', 'Bills', 'Amount'],
        load: async (cid, from, to) => {
            const [sales, ledgers] = await Promise.all([
                salesRows(cid, from, to),
                fetchAll((i, j) => supabase.from('ledgers').select('name,parent').eq('company_id', cid).order('id').range(i, j)),
            ]);
            const parentOf = new Map(ledgers.map((l: any) => [String(l.name || '').toLowerCase(), l.parent || 'Unmapped']));
            return byValue(group(sales, r => parentOf.get(String(r.party_ledger_name || '').toLowerCase()) || 'Unmapped', amount));
        },
    },
    'top-customer': {
        title: 'Top Customers', columns: ['Party', 'Bills', 'Amount'],
        load: async (cid, from, to) => byValue(group(await salesRows(cid, from, to), r => r.party_ledger_name, amount)).slice(0, 50),
    },
    'top-supplier': {
        title: 'Top Suppliers', columns: ['Party', 'Bills', 'Amount'],
        load: async (cid, from, to) => byValue(group(
            (await voucherRows(cid, from, to)).filter(r => String(r.voucher_type || '').toLowerCase() === 'purchase'),
            r => r.party_name, amount)).slice(0, 50),
    },
    'items-sold-value': {
        title: 'Items Sold By Value', columns: ['Item', 'Qty', 'Amount'],
        load: async (cid, from, to) => itemRows(await soldItems(cid, from, to), false),
    },
    'items-sold-qty': {
        title: 'Items Sold By Qty', columns: ['Item', 'Qty', 'Amount'],
        load: async (cid, from, to) => itemRows(await soldItems(cid, from, to), true),
    },
    'items-purchased-value': {
        title: 'Items Purchased By Value', columns: ['Item', 'Qty', 'Amount'],
        load: async (cid, from, to) => itemRows(await purchasedItems(cid, from, to), false),
    },
    'items-purchased-qty': {
        title: 'Items Purchased By Qty', columns: ['Item', 'Qty', 'Amount'],
        load: async (cid, from, to) => itemRows(await purchasedItems(cid, from, to), true),
    },
    expenses: {
        title: 'Expenses', columns: ['Ledger', 'Payments', 'Amount'],
        load: async (cid, from, to) => byValue(group(
            (await voucherRows(cid, from, to)).filter(r => ['payment', 'purchase'].includes(String(r.voucher_type || '').toLowerCase())),
            r => r.party_name, amount)),
    },
    'trial-balance': {
        title: 'Trial Balance', columns: ['Ledger', 'Group', 'Balance'],
        load: async (cid) => {
            const ledgers = await fetchAll((i, j) => supabase.from('ledgers')
                .select('name,parent,current_balance').eq('company_id', cid).order('id').range(i, j));
            return ledgers
                .map((l: any) => ({
                    label: l.name || '-',
                    sub: l.parent || '',
                    value: Number(l.current_balance) || 0,
                }))
                .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        },
    },
    'inactive-items': {
        title: 'Inactive Items', columns: ['Item', 'Group', 'Closing Stock'],
        load: async (cid, from, to) => {
            const [items, sold] = await Promise.all([
                fetchAll((i, j) => supabase.from('stock_items')
                    .select('name,stock_group,current_stock').eq('company_id', cid).order('id').range(i, j)),
                soldItems(cid, from, to),
            ]);
            const soldNames = new Set(sold.map((s: any) => String(s.stock_item_name || '').toLowerCase()));
            return items
                .filter((s: any) => !soldNames.has(String(s.name || '').toLowerCase()))
                .map((s: any) => ({
                    label: s.name || '-',
                    sub: s.stock_group || '',
                    value: Number(s.current_stock) || 0,
                }));
        },
    },
};

export function prefetchReport(key: string, companyId: string, userId: string, from: string, to: string) {
    const def = REPORTS[key];
    if (!def || !companyId || !userId) return;
    void queryClient.prefetchQuery(['report-view', userId, key, companyId, from, to], () => def.load(companyId, from, to), { staleTime: 5 * 60 * 1000 });
}

export default function ReportViewPage() {
    const { key = '' } = useParams();
    const navigate = useNavigate();
    const { selectedCompany, user } = useAuth() as any;
    const { selectedFY, setSelectedFY } = useFY();
    const { from, to } = getFYDates(selectedFY);
    const def = REPORTS[key];

    const { data: rows, isLoading, isError, error, refetch, isFetching } = useQuery(
        ['report-view', user?.id, key, selectedCompany?.id, from, to],
        () => def!.load(selectedCompany.id, from, to),
        { enabled: !!def && !!selectedCompany?.id && !!user?.id, staleTime: 5 * 60 * 1000, cacheTime: 30 * 60 * 1000, refetchOnWindowFocus: false, refetchOnMount: true }
    );

    const list = rows || [];
    const total = useMemo(() => list.reduce((s, r) => s + (Number(r.value) || 0), 0), [list]);
    const count = useMemo(() => list.reduce((s, r) => s + (Number(r.count) || 0), 0), [list]);
    const money = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v || 0);

    if (!def) {
        return (
            <div className="max-w-[1200px] mx-auto p-6">
                <EmptyState icon={<FileText size={28} />} title="Report not found" description="This report is not available yet." />
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto space-y-4 pb-16">
            <HeaderPortal type="title">
                <div className={`flex items-center gap-2 min-w-0 ${key === 'items-sold-qty' ? 'sold-qty-header' : ''}`}>
                    <button aria-label="Back to reports" onClick={() => navigate('/reports')} className="w-8 h-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center text-[var(--on-surface-variant)]">
                        <ArrowLeft size={15} />
                    </button>
                    <div>
                        <h1 className="text-sm md:text-xl font-bold text-[var(--on-surface)] tracking-tight">{def.title}</h1>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                            {selectedCompany?.name} · {selectedFY}
                        </p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions"><button type="button" className="reports-header-search" aria-label="Refresh report" title="Refresh report" onClick={() => refetch()} disabled={isFetching}><RefreshCw size={17}/></button></HeaderPortal>

            <HeaderPortal type="filters">
                <CompactYearFilter selectedFy={selectedFY} onFyChange={setSelectedFY} />
            </HeaderPortal>

            {key === 'items-sold-qty' ? <div className="sold-qty-page">
                <div className="sold-qty-intro"><div><span>SALES REPORT</span><h2>Items sold by quantity</h2><p>{selectedFY} · {selectedCompany?.name}</p></div><span className="sold-qty-count">{list.length} items</span></div>
                {isLoading ? <div className="sold-qty-state"><Spinner size="lg"/><span>Loading items...</span></div> : isError ? <div className="sold-qty-state sold-qty-error">{(error as any)?.message || 'Failed to load report'}</div> : list.length === 0 ? <div className="sold-qty-state">No data for {selectedFY}.</div> : <>
                    <div className="sold-qty-summary"><span>Total amount</span><strong>{money(total)}</strong></div>
                    <div className="sold-qty-list"><div className="sold-qty-labels"><span>ITEM</span><span>QTY / AMOUNT</span></div>{list.map((r, i) => <div className="sold-qty-row" key={`${r.label}-${i}`}><span className="sold-qty-index">{String(i + 1).padStart(2,'0')}</span><div className="sold-qty-name"><strong>{r.label}</strong>{r.sub && <small>{r.sub}</small>}</div><div className="sold-qty-values"><strong>{(r.count || 0).toLocaleString('en-IN')}</strong><small>{money(r.value)}</small></div></div>)}</div>
                </>}
            </div> : <div className="px-4 md:px-0">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                        <span>{list.length} rows</span>
                        <span>{def.columns[0]} / {def.columns[1]} / {def.columns[2]}</span>
                    </div>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Spinner size="lg" />
                            <p className="text-xs text-[var(--text-muted)]">Loading {def.title.toLowerCase()}...</p>
                        </div>
                    ) : isError ? (
                        <div className="p-8 text-center text-sm text-rose-500">
                            {(error as any)?.message || 'Failed to load report'}
                        </div>
                    ) : list.length === 0 ? (
                        <div className="p-8 text-center text-sm text-[var(--text-muted)]">No data for {selectedFY}.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-[var(--surface-container)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                    <tr>
                                        <th className="text-left font-black px-4 py-2">{def.columns[0]}</th>
                                        <th className="text-right font-black px-4 py-2">{def.columns[1]}</th>
                                        <th className="text-right font-black px-4 py-2">{def.columns[2]}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {list.map((r, i) => (
                                        <tr key={`${r.label}-${i}`} className="hover:bg-[var(--surface-hover)]">
                                            <td className="px-4 py-2">
                                                <p className="font-medium text-[var(--on-surface)] truncate max-w-[420px]">{r.label}</p>
                                                {r.sub && <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[420px]">{r.sub}</p>}
                                            </td>
                                            <td className="px-4 py-2 text-right text-[var(--on-surface-variant)]">
                                                {key === 'trial-balance' || key === 'inactive-items'
                                                    ? (Number(r.value) || 0).toLocaleString('en-IN')
                                                    : (r.count || 0).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-2 text-right font-semibold text-[var(--on-surface)]">{money(r.value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-[var(--surface-container)] font-black text-[var(--on-surface)]">
                                    <tr>
                                        <td className="px-4 py-2">Total</td>
                                        <td className="px-4 py-2 text-right">{count.toLocaleString('en-IN')}</td>
                                        <td className="px-4 py-2 text-right">{money(total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>}
        </div>
    );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, BarChart3, CheckCircle2, Download, ExternalLink, Package, RefreshCw, ShoppingBag, TrendingDown, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import FinancialPeriodSelector from '@/components/shared/FinancialPeriodSelector';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { fetchBusinessInsightsData } from '@/lib/businessInsightsApi';
import {
  aggregateInventoryMovement,
  aggregateMonthlyTrend,
  aggregateTopParties,
  calculateAgeing,
  calculatePeriodComparison,
  getCurrentFinancialYearStart,
  getFinancialYearRange,
  getInventoryReliability,
  getPreviousFinancialYearRange,
  parseFinancialYearStart,
  sumVoucherAmounts,
} from '@/lib/businessInsights';

const currency = (value: number) => `₹${Math.round(Math.abs(value || 0)).toLocaleString('en-IN')}`;
const number = (value: number) => Math.round(value || 0).toLocaleString('en-IN');
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayString = () => new Date().toISOString().slice(0, 10);

function comparisonLabel(comparison: ReturnType<typeof calculatePeriodComparison>) {
  if (comparison.previous === 0) return 'No previous-period base';
  const sign = comparison.percentage !== null && comparison.percentage >= 0 ? '+' : '';
  return `${sign}${comparison.percentage?.toFixed(1)}% vs previous FY`;
}

function InsightCard({ title, value, subtitle, icon: Icon, tone, onClick }: any) {
  return (
    <button type="button" onClick={onClick} className="text-left w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-[var(--on-surface)]">{value}</p>
          <p className={`mt-1 text-[10px] font-bold ${tone || 'text-[var(--text-muted)]'}`}>{subtitle}</p>
        </div>
        <span className="rounded-xl bg-[var(--surface-variant)] p-2 text-[var(--primary)]"><Icon size={18} /></span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[var(--primary)]">Open detail <ExternalLink size={11} /></span>
    </button>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-black uppercase tracking-wider text-[var(--on-surface)]">{title}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p></div>{action}</div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center"><BarChart3 size={28} className="mb-3 text-[var(--text-muted)] opacity-60" /><p className="text-sm font-black text-[var(--on-surface)]">{title}</p><p className="mt-1 max-w-md text-xs text-[var(--text-muted)]">{description}</p>{action}</div>;
}

export default function BusinessInsightsPage() {
  const { selectedCompany } = useAuth() as any;
  const navigate = useNavigate();
  const defaultFy = `FY ${getCurrentFinancialYearStart()}-${String(getCurrentFinancialYearStart() + 1).slice(-2)}`;
  const [selectedFy, setSelectedFy] = useState(defaultFy);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!selectedCompany?.id) return;
    const key = `business_insights_fy_${selectedCompany.id}`;
    const saved = localStorage.getItem(key);
    if (saved) setSelectedFy(saved);
  }, [selectedCompany?.id]);

  const startYear = parseFinancialYearStart(selectedFy);
  const period = useMemo(() => getFinancialYearRange(startYear), [startYear]);
  const previousPeriod = useMemo(() => getPreviousFinancialYearRange(startYear), [startYear]);

  const load = useCallback(async (manual = false) => {
    if (!selectedCompany?.id) return;
    const id = ++requestId.current;
    setLoading(!manual);
    setRefreshing(manual);
    setError(null);
    try {
      const next = await fetchBusinessInsightsData(selectedCompany.id, period, previousPeriod, period.to);
      if (id !== requestId.current) return;
      setData(next);
      if (next.errors.length) toast.error('Some insight sections could not be loaded; affected sections are marked below.');
    } catch (err: any) {
      if (id !== requestId.current) return;
      setError(err?.message || 'Unable to load business insights');
      setData(null);
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [period, previousPeriod, selectedCompany?.id]);

  useEffect(() => { void load(); }, [load]);

  const changeFy = (value: string) => {
    setSelectedFy(value);
    if (selectedCompany?.id) localStorage.setItem(`business_insights_fy_${selectedCompany.id}`, value);
  };

  const currentRows = data?.current || [];
  const previousRows = data?.previous || [];
  const currentSales = sumVoucherAmounts(currentRows, 'sales');
  const currentPurchases = sumVoucherAmounts(currentRows, 'purchases');
  const previousSales = sumVoucherAmounts(previousRows, 'sales');
  const previousPurchases = sumVoucherAmounts(previousRows, 'purchases');
  const salesComparison = calculatePeriodComparison(currentSales, previousSales);
  const purchaseComparison = calculatePeriodComparison(currentPurchases, previousPurchases);
  const trend = useMemo(() => aggregateMonthlyTrend(currentRows, startYear), [currentRows, startYear]);
  const topCustomers = useMemo(() => aggregateTopParties(currentRows, 'sales'), [currentRows]);
  const topSuppliers = useMemo(() => aggregateTopParties(currentRows, 'purchases'), [currentRows]);
  const ageing = useMemo(() => calculateAgeing(data?.untilDate || [], data?.ledgers || [], period.to, 'receivable'), [data?.untilDate, data?.ledgers, period.to]);
  const payableAgeing = useMemo(() => calculateAgeing(data?.untilDate || [], data?.ledgers || [], period.to, 'payable'), [data?.untilDate, data?.ledgers, period.to]);
  const inventoryReliability = useMemo(() => getInventoryReliability(data?.stockItems || [], data?.stockEntries || []), [data?.stockItems, data?.stockEntries]);
  const inventory = useMemo(() => aggregateInventoryMovement(data?.stockItems || [], data?.stockEntries || [], currentRows, startYear), [data?.stockItems, data?.stockEntries, currentRows, startYear]);
  const lowStock = inventoryReliability.hasThreshold ? inventory.filter((item: any) => Number.isFinite(item.threshold) && item.currentStock <= item.threshold) : [];
  const overdueReceivables = ageing.parties.filter((party: any) => party.buckets['31-60'] + party.buckets['61-90'] + party.buckets['91-120'] + party.buckets['120+'] > 0).slice(0, 5);
  const partialErrors = data?.errors || [];

  const openVouchers = (type: string, from = period.from, to = period.to) => navigate(`/vouchers?type=${encodeURIComponent(type)}&from=${from}&to=${to}`);
  const openAgeing = (type: 'receivable' | 'payable') => navigate(`/aging-report?type=${type}&asOn=${period.to}`);

  const exportSummary = () => {
    const rows = [
      ['Company', selectedCompany?.name || ''], ['Financial Year', period.label], ['Generated', new Date().toISOString()],
      ['Sales', currentSales], ['Purchases', currentPurchases], ['Receivables', ageing.grandTotal], ['Payables', payableAgeing.grandTotal],
      [], ['Top Customers'], ['Party', 'Amount', 'Voucher Count'], ...topCustomers.map((row: any) => [row.name, row.amount, row.count]),
      [], ['Top Suppliers'], ['Party', 'Amount', 'Voucher Count'], ...topSuppliers.map((row: any) => [row.name, row.amount, row.count]),
    ];
    const csv = rows.map((row: any[]) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `business-insights-${selectedCompany?.id || 'company'}-${period.label.replace(/[^0-9-]/g, '')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!selectedCompany) return <div className="p-8 text-center text-sm text-[var(--text-muted)]">Please select a company first.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 pb-24 sm:px-6">
      <HeaderPortal type="title"><div><h1 className="text-sm font-black uppercase tracking-tight text-[var(--on-surface)] md:text-xl">Business Insights</h1><p className="hidden text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] md:block">Trustworthy reports for {selectedCompany.name}</p></div></HeaderPortal>
      <HeaderPortal type="filters"><FinancialPeriodSelector selectedFy={selectedFy} onFyChange={changeFy} /></HeaderPortal>
      <HeaderPortal type="actions"><div className="flex items-center gap-2"><button type="button" onClick={exportSummary} disabled={!data} className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[var(--on-surface)] disabled:opacity-40"><Download size={14} /> Export</button><button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--on-surface)] disabled:opacity-40" aria-label="Refresh business insights"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></button></div></HeaderPortal>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2 text-[10px] font-bold text-[var(--text-muted)]"><span>Scope: {selectedCompany.name} · {period.label}</span><span>As on: {dateLabel(period.to)} · Last sync: {dateLabel(selectedCompany.last_sync_at || null)}</span></div>
      {partialErrors.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>Partial data: {partialErrors.map((item: any) => item.section).join(', ')} could not be loaded. Affected sections are marked rather than shown as zero.</span></div>}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}<button type="button" className="ml-3 font-black underline" onClick={() => void load(true)}>Retry</button></div>}

      {loading ? <div className="flex justify-center py-24"><Spinner size="lg" /></div> : data && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InsightCard title="Sales" value={currency(currentSales)} subtitle={comparisonLabel(salesComparison)} tone={salesComparison.change >= 0 ? 'text-emerald-500' : 'text-red-500'} icon={TrendingUp} onClick={() => openVouchers('Sales')} />
          <InsightCard title="Purchases" value={currency(currentPurchases)} subtitle={comparisonLabel(purchaseComparison)} tone={purchaseComparison.change <= 0 ? 'text-emerald-500' : 'text-amber-500'} icon={ShoppingBag} onClick={() => openVouchers('Purchase')} />
          <InsightCard title="Receivables" value={currency(ageing.grandTotal)} subtitle={`${ageing.parties.length} parties · ageing as on FY end`} tone="text-amber-500" icon={ArrowUpRight} onClick={() => openAgeing('receivable')} />
          <InsightCard title="Payables" value={currency(payableAgeing.grandTotal)} subtitle={`${payableAgeing.parties.length} parties · ageing as on FY end`} tone="text-red-500" icon={ArrowDownLeft} onClick={() => openAgeing('payable')} />
        </section>

        <GlassCard className="p-4 sm:p-5"><SectionHeader title="Sales and purchase trend" description="Monthly totals for the selected April–March financial year. Click a bar to open the voucher list." action={<span className="text-[10px] font-black text-[var(--text-muted)]">{number(currentRows.length)} vouchers in scope</span>} />
          {currentRows.length === 0 ? <EmptyState title="No vouchers in this financial year" description="Choose another financial year or sync the company data." /> : <><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} /><Tooltip formatter={(value: any) => currency(Number(value))} /><Legend /><Bar dataKey="sales" name="Sales" fill="#10b981" radius={[4, 4, 0, 0]} onClick={(entry: any) => entry?.key && openVouchers('Sales', `${entry.key}-01`, `${entry.key}-31`)} /><Bar dataKey="purchases" name="Purchases" fill="#8b5cf6" radius={[4, 4, 0, 0]} onClick={(entry: any) => entry?.key && openVouchers('Purchase', `${entry.key}-01`, `${entry.key}-31`)} /></BarChart></ResponsiveContainer></div><div className="grid gap-2 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-3"><div><span className="text-[var(--text-muted)]">Highest sales month</span><p className="font-black text-[var(--on-surface)]">{trend.reduce((a: any, b: any) => b.sales > a.sales ? b : a, trend[0])?.label || '—'}</p></div><div><span className="text-[var(--text-muted)]">Highest purchase month</span><p className="font-black text-[var(--on-surface)]">{trend.reduce((a: any, b: any) => b.purchases > a.purchases ? b : a, trend[0])?.label || '—'}</p></div><div><span className="text-[var(--text-muted)]">Sales less purchases</span><p className="font-black text-[var(--on-surface)]">{currency(currentSales - currentPurchases)}</p></div></div></>}
        </GlassCard>

        <section className="grid gap-4 lg:grid-cols-2"><GlassCard className="p-4 sm:p-5"><SectionHeader title="Receivable ageing" description={`Outstanding allocation as on ${dateLabel(period.to)}`} action={<button type="button" onClick={() => openAgeing('receivable')} className="text-[10px] font-black uppercase text-[var(--primary)]">Open report</button>} />{ageing.grandTotal === 0 ? <EmptyState title="No receivables found" description="No reliable outstanding customer balance is available for this scope." /> : <><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{Object.entries(ageing.totals).map(([key, value]) => <div key={key} className="rounded-xl bg-[var(--surface-variant)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{key}</p><p className="mt-1 text-sm font-black text-[var(--on-surface)]">{currency(value as number)}</p></div>)}</div><div className="mt-4 space-y-2">{overdueReceivables.length === 0 ? <p className="text-xs text-[var(--text-muted)]">No overdue parties in the selected scope.</p> : overdueReceivables.map((party: any) => <button key={party.id} type="button" onClick={() => navigate(`/ledgers/${encodeURIComponent(party.id)}?from=business-insights&fy=${encodeURIComponent(period.label)}`)} className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-variant)]"><span><span className="block text-xs font-black text-[var(--on-surface)]">{party.name}</span><span className="text-[10px] text-[var(--text-muted)]">Oldest: {dateLabel(party.oldestDate)}</span></span><span className="text-sm font-black text-amber-500">{currency(party.total)}</span></button>)}</div></>}</GlassCard><GlassCard className="p-4 sm:p-5"><SectionHeader title="Payable ageing" description={`Supplier balances as on ${dateLabel(period.to)}`} action={<button type="button" onClick={() => openAgeing('payable')} className="text-[10px] font-black uppercase text-[var(--primary)]">Open report</button>} />{payableAgeing.grandTotal === 0 ? <EmptyState title="No payables found" description="No reliable outstanding supplier balance is available for this scope." /> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{Object.entries(payableAgeing.totals).map(([key, value]) => <div key={key} className="rounded-xl bg-[var(--surface-variant)] p-3"><p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">{key}</p><p className="mt-1 text-sm font-black text-[var(--on-surface)]">{currency(value as number)}</p></div>)}</div>}</GlassCard></section>

        <section className="grid gap-4 lg:grid-cols-2"><GlassCard className="p-4 sm:p-5"><SectionHeader title="Top customers" description="Sales amount in the selected financial year" action={<button type="button" onClick={() => openVouchers('Sales')} className="text-[10px] font-black uppercase text-[var(--primary)]">View sales</button>} />{topCustomers.length === 0 ? <EmptyState title="No customer sales data" description="Party names are required for customer ranking." /> : <div className="space-y-2">{topCustomers.map((row: any, index: number) => <button type="button" key={row.name} onClick={() => navigate(`/ledgers?search=${encodeURIComponent(row.name)}&from=business-insights`)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-variant)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-xs font-black text-emerald-500">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-[var(--on-surface)]">{row.name}</span><span className="text-[10px] text-[var(--text-muted)]">{row.count} vouchers · Last {dateLabel(row.lastDate)}</span></span><span className="text-sm font-black text-[var(--on-surface)]">{currency(row.amount)}</span></button>)}</div>}</GlassCard><GlassCard className="p-4 sm:p-5"><SectionHeader title="Top suppliers" description="Purchase amount in the selected financial year" action={<button type="button" onClick={() => openVouchers('Purchase')} className="text-[10px] font-black uppercase text-[var(--primary)]">View purchases</button>} />{topSuppliers.length === 0 ? <EmptyState title="No supplier purchase data" description="Party names are required for supplier ranking." /> : <div className="space-y-2">{topSuppliers.map((row: any, index: number) => <button type="button" key={row.name} onClick={() => navigate(`/ledgers?search=${encodeURIComponent(row.name)}&from=business-insights`)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-variant)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-black text-violet-500">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-[var(--on-surface)]">{row.name}</span><span className="text-[10px] text-[var(--text-muted)]">{row.count} vouchers · Last {dateLabel(row.lastDate)}</span></span><span className="text-sm font-black text-[var(--on-surface)]">{currency(row.amount)}</span></button>)}</div>}</GlassCard></section>

        <GlassCard className="p-4 sm:p-5"><SectionHeader title="Inventory movement" description="Live stock signals are shown only when synced source fields are available." action={<button type="button" onClick={() => navigate(`/stock?from=business-insights&fy=${encodeURIComponent(period.label)}`)} className="text-[10px] font-black uppercase text-[var(--primary)]">Open stock</button>} />{!inventoryReliability.reliable ? <EmptyState title="Inventory insights unavailable" description="Stock movement or current stock fields are not synced for this company. No fabricated inventory numbers are shown." action={<button type="button" onClick={() => navigate('/stock')} className="mt-4 rounded-lg bg-[var(--primary)] px-3 py-2 text-[10px] font-black uppercase text-[var(--on-primary)]">Open Stock</button>} /> : <><div className="mb-4 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-[var(--surface-variant)] px-3 py-2 font-bold">{number(inventory.length)} tracked items</span><span className="rounded-lg bg-[var(--surface-variant)] px-3 py-2 font-bold">{number(lowStock.length)} low-stock signals</span>{!inventoryReliability.hasThreshold && <span className="rounded-lg bg-amber-500/10 px-3 py-2 font-bold text-amber-600">No reorder thresholds configured</span>}</div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]"><th className="px-2 py-2">Item</th><th className="px-2 py-2 text-right">Inward</th><th className="px-2 py-2 text-right">Outward</th><th className="px-2 py-2 text-right">Current</th><th className="px-2 py-2 text-right">Value</th><th className="px-2 py-2 text-right">Signal</th></tr></thead><tbody>{inventory.slice(0, 12).map((item: any) => { const isLow = inventoryReliability.hasThreshold && Number.isFinite(item.threshold) && item.currentStock <= item.threshold; return <tr key={`${item.id}-${item.name}`} className="border-b border-[var(--border)]"><td className="px-2 py-3 font-black text-[var(--on-surface)]">{item.name}</td><td className="px-2 py-3 text-right text-emerald-500">{number(item.inward)}</td><td className="px-2 py-3 text-right text-red-500">{number(item.outward)}</td><td className="px-2 py-3 text-right font-bold">{number(item.currentStock)} {item.unit || ''}</td><td className="px-2 py-3 text-right font-bold">{currency(item.value)}</td><td className="px-2 py-3 text-right">{isLow ? <span className="font-black text-amber-500">Low stock</span> : <span className="text-[var(--text-muted)]">Tracked</span>}</td></tr>; })}</tbody></table></div></>}</GlassCard>

        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} className="shrink-0" /><span>All displayed totals are scoped to {selectedCompany.name} and {period.label}. Unknown or incomplete source data is shown as unavailable instead of being converted to zero.</span></div>
      </>}
    </div>
  );
}

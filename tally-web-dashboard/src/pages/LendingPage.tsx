import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../lib/insforge';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Wallet, DollarSign, Search,
  CheckCircle2, AlertCircle, XCircle, Minus, Download, Plus, MoreHorizontal,
  ArrowUpRight, Calculator, RefreshCw
} from 'lucide-react';
import { EmptyState } from '../components/ui/GlassUI';
import { CompactYearFilter } from '../components/shared/CompactYearFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { useFY } from '../contexts/FYContext';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../lib/exportToCSV';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { PieChart as ReChartsPie, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

// ---------- helpers ----------
const rs = (n: number, { compact = true }: { compact?: boolean } = {}) => {
  const v = Math.abs(Number(n) || 0);
  if (compact) {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
    return `₹${Math.round(v)}`;
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v);
};

const num = (n: any) => Math.abs(Number(n) || 0);

const statusMap: Record<string, { label: string; icon: any; badge: string }> = {
  active: { label: 'Active', icon: <RefreshCw className="w-3 h-3" />, badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  partially_settled: { label: 'Partial', icon: <Minus className="w-3 h-3" />, badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  overdue: { label: 'Overdue', icon: <AlertCircle className="w-3 h-3" />, badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  settled: { label: 'Settled', icon: <CheckCircle2 className="w-3 h-3" />, badge: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
  written_off: { label: 'Written Off', icon: <XCircle className="w-3 h-3" />, badge: 'bg-rose-500/15 text-rose-400 border-rose-500/20' },
};

const statusOrder: string[] = ['active', 'partially_settled', 'overdue', 'written_off', 'settled'];

// ---------- row windowing ----------
import { ListChildComponentProps } from 'react-window';

interface Props { rows: any[]; onRowClick: (r: any) => void; }

const RowWindowItem: React.FC<ListChildComponentProps & { onRowClick: (row: any) => void }> = ({ index, style, data, onRowClick }) => {
  const row = data.rows[index];
  const st = statusMap[row.status || 'active'];
  const rowStyle: React.CSSProperties = {
    top: style.top,
    left: style.left,
    width: style.width,
    height: 60,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  };
  return (
    <div style={rowStyle}>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onRowClick(row)}>
        <div className="flex items-center gap-2 font-semibold text-sm text-[var(--on-surface)] truncate">
          {row.name}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--on-surface-variant)] mt-0.5">
          <span>{row.parent_group || 'Sundry Debtors'}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="flex items-center gap-1">
            <DollarSign size={12} /> {rs(row.current_balance)}
          </span>
        </div>
      </div>
      <div className="hidden sm:block w-20">
        <div className="text-xs font-semibold text-[var(--on-surface)]">{rs(row.current_balance)}</div>
        <div className="text-[10px] text-[var(--text-muted)]">Outstanding</div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${st?.badge || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>
          {st?.label || 'Active'}
        </span>
      </div>
      <div className="flex items-center justify-end gap-1.5 pr-2">
        <button className="p-1.5 rounded-lg hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)] transition-colors" onClick={() => onRowClick(row)} aria-label="Actions">
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
};

const RowWindow: React.FC<Props> = ({ rows, onRowClick }) => {
  return (
    <List
      height={Math.min(rows.length, 40) * 60 + 20}
      width="100%"
      itemSize={60}
      itemCount={rows.length}
      overscanCount={4}
    >
      {({ index, style, data }) => <RowWindowItem index={index} style={style} data={data} onRowClick={onRowClick} />}
    </List>
  );
};

// ---------- page ----------
export default function LendingPage() {
  const { selectedCompany } = useAuth() as any;

  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const { selectedFY: selectedFy = 2025, setSelectedFY: setSelectedFy } = useFY();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<any>(null);

  const handleExportCSV = () => {
    if (!filteredRows.length) return;
    import('../lib/exportToCSV').then(({ exportToCSV }) => {
      exportToCSV(
        filteredRows,
        [
          { key: 'name', label: 'Ledger / Borrower' },
          { key: 'parent_group', label: 'Group' },
          { key: 'disbursed', label: 'Disbursed (Opening)' },
          { key: 'outstanding', label: 'Outstanding' },
          { key: 'repaid', label: 'Repaid' },
          { key: 'status', label: 'Status' },
        ],
        `Lending_Advance_Book_${selectedCompany?.name || 'Company'}_${selectedFy}.csv`
      );
    }).catch(err => toast.error('Export failed: ' + err.message));
  };

  const { data: ledgersData, isLoading } = useQuery(
    ['lending', selectedCompany?.id, selectedFy],
    async () => {
      const { data, error } = await ledgerApi.list(selectedCompany!.id, null);
      if (error) throw error;
      return (data || []).filter((l: any) => /loan|advance|debtor/i.test(l.ledger_type || '') || /debtor/i.test(String(l.parent_group || '') || ''));
    },
    { enabled: !!selectedCompany?.id, staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false, keepPreviousData: true }
  );

  const rows = useMemo(() => {
    const list = (ledgersData || []) as any[];
    return list
      .map((l) => {
        const disbursed = num(l.opening_balance) + num(l.current_balance); // approx total ever booked
        const outstanding = num(l.current_balance);
        const repaid = Math.max(0, disbursed - outstanding);
        const base = statusMap[l.status || 'active'] || statusMap['active'];
        const nextDue = l.due_date || (outstanding > 0 ? 'Awaiting payment' : '—');
        return { ...l, disbursed, outstanding, repaid, statusKey: l.status || 'active', statusLabel: base.label, nextDue };
      })
      .filter((l) => {
        const q = searchTerm.toLowerCase();
        const matchesSearch = !q || l.name?.toLowerCase().includes(q) || l.ledger_type?.toLowerCase().includes(q) || l.parent_group?.toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'all' || l.statusKey === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => (statusFilter === 'overdue' ? 0 : statusFilter === 'active' ? 1 : statusFilter === 'settled' ? 2 : b.outstanding - a.outstanding));
  }, [ledgersData, searchTerm, statusFilter]);

  const filteredRows = rows;

  const kpi = useMemo(() => {
    const book = rows.reduce((s, r) => s + r.outstanding, 0);
    const active = rows.filter((r) => r.statusKey === 'active' || r.statusKey === 'partially_settled' || r.statusKey === 'overdue').length;
    const disbursedTotal = rows.reduce((s, r) => s + r.disbursed, 0);
    const avg = active ? disbursedTotal / active : 0;
    return { book, active, disbursed: disbursedTotal, avg };
  }, [rows]);

  // charts
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { active: 0, partially_settled: 0, overdue: 0, settled: 0, written_off: 0 };
    rows.forEach((r) => { c[r.statusKey] = (c[r.statusKey] || 0) + 1; });
    return c;
  }, [rows]);

  const topOutliers = useMemo(() => {
    return [...rows].sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);
  }, [rows]);

  const COLORS = ['#E8B54A', '#42A5F5', '#66BB6A', '#F85149', '#90CAF9'];

  return (
    <div>
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--on-background)] flex items-center gap-2">
              <Banknote className="w-7 h-7 text-amber-400" />
              Lending &amp; Advances
            </h1>
            <p className="text-sm text-[var(--on-surface-variant)] mt-1">
              Track money given to customers &amp; traders as loans or advances — disbursed, outstanding and repayment status across your debtor book.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-light)] bg-[var(--surface)] text-sm font-semibold text-[var(--on-surface)] hover:bg-[var(--surface-hover)] transition-all shadow-sm">
              <Download size={15} /> Export CSV
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold text-sm shadow-lg hover:shadow-xl hover:brightness-105 transition-all active:scale-95">
              <Plus size={15} /> New Advance
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Outstanding Loan Book', value: rs(kpi.book), icon: <DollarSign className="w-5 h-5" />, color: 'from-amber-500/10 text-amber-400 border-amber-500/20', sub: 'All advances' },
            { label: 'Active Advances', value: String(kpi.active), icon: <Banknote className="w-5 h-5" />, color: 'from-emerald-500/10 text-emerald-400 border-emerald-500/20', sub: 'In repayment' },
            { label: 'Total Disbursed', value: rs(kpi.disbursed), icon: <DollarSign className="w-5 h-5" />, color: 'from-blue-500/10 text-blue-400 border-blue-500/20', sub: 'Opening + outstanding' },
            { label: 'Repaid', value: rs(Math.max(0, kpi.disbursed - kpi.book)), icon: <CheckCircle2 className="w-5 h-5" />, color: 'from-emerald-500/10 text-emerald-400 border-emerald-500/20', sub: 'Collected so far' },
            { label: 'Avg Loan Size', value: rs(kpi.avg), icon: <Calculator className="w-5 h-5" />, color: 'from-violet-500/10 text-violet-400 border-violet-500/20', sub: `Across ${kpi.active} active` },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${k.color} border-transparent`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{k.label}</p>
                  <p className="text-xl font-bold mt-0.5 text-white">{k.value}</p>
                  <p className="text-[11px] text-white/60 mt-0.5">{k.sub}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${k.color}`}>
                  {k.icon}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-5 pb-2">
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Status donut */}
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-sm text-[var(--on-surface)]">Book by status</h2>
                <p className="text-[11px] text-[var(--on-surface-variant)]">Advance portfolio allocation</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {[
                  ['active', '#E8B54A'],
                  ['partially_settled', '#42A5F5'],
                  ['overdue', '#F85149'],
                  ['settled', '#66BB6A'],
                  ['written_off', '#9CA3AF'],
                ].map(([s, c]) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                    <span className="text-[11px] text-[var(--on-surface-variant)]">{statusMap[s]?.label || s}</span>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer height={200}>
              <ReChartsPie>
                <Pie
                  data={Object.entries(statusCounts).map(([k, v]) => ({ name: statusMap[k]?.label || k, value: v }))}
                  innerRadius={62}
                  outerRadius={84}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {Object.entries(statusCounts).map(([k, _], i) => (
                    <Cell key={k} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </ReChartsPie>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-3 text-xs">
              {Object.entries(statusCounts).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 text-[var(--on-surface-variant)]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[[...statusOrder, 'settled', 'written_off'].indexOf(k) % COLORS.length] }} />
                  {statusMap[k]?.label || k}: {v}
                </div>
              ))}
            </div>
          </div>

          {/* Top outliers bar */}
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-sm text-[var(--on-surface)]">Top borrowers by outstanding</h2>
                <p className="text-[11px] text-[var(--on-surface-variant)]">Largest advance balances</p>
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">{topOutliers.length} parties</div>
            </div>
            <ResponsiveContainer height={200}>
              <BarChart data={topOutliers} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} interval={0} />
                <YAxis
                  type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 500 }}
                  tickLine={false} axisLine={false} interval={0}
                />
                <Tooltip cursor={{ fill: 'rgba(66,165,245,0.08)' }} contentStyle={{
                  background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--on-surface)', borderRadius: '10px', fontSize: '12px'
                }} />
                <Bar dataKey="outstanding" radius={[0, 6, 6, 0]}>
                  {topOutliers.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4 pb-8">
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--surface)] shadow-sm overflow-hidden">
          {/* Table head */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-[var(--border-light)]">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search borrower, ledger, group…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--surface-container)] border border-[var(--border-light)] text-sm text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/40"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--on-surface-variant)]">Status</span>
              {(['all', 'active', 'partially_settled', 'overdue', 'settled', 'written_off'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border ${
                    statusFilter === s
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-[var(--surface)] text-[var(--on-surface-variant)] border-[var(--border-light)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {s === 'all' ? `All (${rows.length})` : `${s} (${statusCounts[s] || 0})`}
                </button>
              ))}
            </div>
          </div>

          {/* Table body (virtualized) */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[var(--border-light)] border-t-amber-400 rounded-full animate-spin" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-[var(--text-muted)] mb-4 bg-[var(--surface-container)] p-6 rounded-2xl">
                <Wallet className="w-8 h-8 mx-auto" />
              </div>
              <h3 className="text-base font-bold text-[var(--on-surface)]">No advance ledgers found</h3>
              <p className="text-sm text-[var(--on-surface-variant)] mt-1 max-w-sm mx-auto">
                {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters or search term.' : "Advances given to customers are recorded under Sundry Debtors in Tally. Once synced, they'll appear here."}
              </p>
              {(searchTerm || statusFilter !== 'all') && (
                <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="mt-4 text-sm font-semibold text-amber-500 hover:text-amber-400">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <div className="min-w-[640px]">
                <div className="hidden sm:grid grid-cols-[1fr_1fr_1.2fr_1.2fr_1.2fr_1fr_auto] gap-3 px-5 py-3 border-b border-[var(--border-light)] text-[11px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
                  <span>Borrower</span>
                  <span>Group</span>
                  <span className="text-right">Disbursed</span>
                  <span className="text-right">Outstanding</span>
                  <span className="text-right">Repaid</span>
                  <span>Status</span>
                  <span />
                </div>
                <RowWindow rows={filteredRows} onRowClick={(r) => { setDetail(r); setExpanded((e) => ({ ...e, [r.id]: !e[r.id] })); }} />
                {/* expandable detail row */}
                {expanded[detail?.id || ''] && detail && (
                  <div className="grid grid-cols-[1fr_1fr_1.2fr_1.2fr_1.2fr_1fr_auto] gap-3 px-5 py-3 border-b border-[var(--border-light)] bg-[var(--surface-container)]">
                    <div className="font-semibold text-sm text-[var(--on-surface)]">{detail.name}</div>
                    <div>{detail.ledger_type || detail.parent_group}</div>
                    <div className="text-right text-sm">{rs(detail.disbursed)}</div>
                    <div className="text-right text-sm font-semibold text-amber-500">{rs(detail.outstanding)}</div>
                    <div className="text-right text-sm">{rs(detail.repaid)}</div>
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMap[detail.statusKey]?.badge || 'bg-slate-500/15 text-slate-400 border-slate-500/20'}`}>
                        {statusMap[detail.statusKey]?.label || 'Active'}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1 pr-2">
                      <button className="p-1.5 rounded-lg hover:bg-[var(--surface-container)] text-[var(--on-surface-variant)] transition-colors" onClick={() => {}} aria-label="Share">
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer summary */}
        {!isLoading && filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-[var(--on-surface-variant)]">
            <span>
              Showing <span className="font-semibold text-[var(--on-surface)]">{filteredRows.length}</span> of <span className="font-semibold text-[var(--on-surface)]">{rows.length}</span> advances
            </span>
            <button className="text-amber-500 hover:text-amber-400 font-semibold text-sm" onClick={handleExportCSV}>
              <Download size={14} className="inline mr-1" /> Export to CSV
            </button>
          </div>
        )}
      </div>

      {/* Footer disclaimer */}
      <p className="text-[10px] text-[var(--text-muted)] text-center max-w-7xl mx-auto px-4 pb-6">
        Bookings reflect the synced Tally ledger. "Repaid" is derived as Disbursed − Outstanding and is an estimate until the ledger is reconciled.
      </p>
    </div>
  );
}

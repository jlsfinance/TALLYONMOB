import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/insforge';
import { format, parseISO, isToday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Download,
  ChevronRight,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Banknote,
  FileText,
  ArrowLeftRight,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { HeaderPortal } from '../components/layout/HeaderPortal';

interface Voucher {
  id: string;
  vch_type?: string;
  voucher_type?: string;
  vch_number?: string;
  voucher_number?: string;
  party_name?: string;
  total_amount?: number;
  grand_total?: number;
  narration?: string;
  vch_date?: string;
  voucher_date?: string;
  created_at?: string;
  company_id?: string;
}

interface Summary {
  total: number;
  sales: number;
  purchases: number;
  payments: number;
  receipts: number;
}

const VOUCHER_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Sales: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  Purchase: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  Payment: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  Receipt: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  Journal: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  Contra: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
  'Credit Note': { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  'Debit Note': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
};

const VOUCHER_TABS = [
  'All',
  'Sales',
  'Purchase',
  'Payment',
  'Receipt',
  'Journal',
] as const;

const VOUCHER_ICONS: Record<string, React.ReactNode> = {
  Sales: <TrendingUp className="w-3.5 h-3.5" />,
  Purchase: <TrendingDown className="w-3.5 h-3.5" />,
  Payment: <CreditCard className="w-3.5 h-3.5" />,
  Receipt: <Banknote className="w-3.5 h-3.5" />,
  Journal: <FileText className="w-3.5 h-3.5" />,
  Contra: <ArrowLeftRight className="w-3.5 h-3.5" />,
  'Credit Note': <AlertCircle className="w-3.5 h-3.5" />,
  'Debit Note': <AlertCircle className="w-3.5 h-3.5" />,
};

export default function DayBookPage() {
  const { user, selectedCompany } = useAuth();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<string>('All');
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);

  const dateKey = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  const { data: vouchers = [], isLoading: loading } = useQuery({
    queryKey: ['daybook', selectedCompany?.id, dateKey],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .eq('is_deleted', false)
        .eq('voucher_date', dateStr)
        .order('voucher_date', { ascending: true });

      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        vch_type: r.vch_type || r.voucher_type,
        vch_number: r.vch_number || r.voucher_number,
        vch_date: r.vch_date || r.voucher_date,
        total_amount: r.total_amount || r.grand_total || 0,
      })) as Voucher[];
    },
    enabled: !!selectedCompany?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const summary = useMemo(() => {
    const s: Summary = { total: vouchers.length, sales: 0, purchases: 0, payments: 0, receipts: 0 };
    for (const r of vouchers) {
      const t = r.vch_type;
      const amt = r.total_amount || 0;
      if (t === 'Sales') s.sales += amt;
      else if (t === 'Purchase') s.purchases += amt;
      else if (t === 'Payment') s.payments += amt;
      else if (t === 'Receipt') s.receipts += amt;
    }
    return s;
  }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    if (activeTab === 'All') return vouchers;
    return vouchers.filter((v) => (v.vch_type || (v as any).voucher_type) === activeTab);
  }, [activeTab, vouchers]);

  const handleRowClick = (voucher: Voucher) => {
    if (voucher.vch_type === 'Sales') {
      navigate(`/invoice/${voucher.id}`);
    } else {
      setSelectedVoucher(voucher);
      setShowModal(true);
    }
  };

  const handleExportCSV = () => {
    if (filteredVouchers.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Time', 'Voucher Type', 'Voucher #', 'Party Name', 'Amount (₹)', 'Narration'];
    const rows = filteredVouchers.map((v) => [
      v.created_at ? format(parseISO(v.created_at), 'hh:mm a') : '',
      v.vch_type,
      v.vch_number,
      v.party_name,
      v.total_amount?.toFixed(2) || '0.00',
      v.narration,
    ]);

    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `day-book-${format(selectedDate, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);

  return (
    <div className="min-h-screen bg-zinc-950 px-[2px] pb-24">
      <HeaderPortal type="title">
        <h1 className="text-lg font-bold text-white">Day Book</h1>
      </HeaderPortal>

      <HeaderPortal type="filters">
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setShowDateInput(!showDateInput)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-300 hover:border-cyan-500/30 transition-colors text-xs"
          >
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>{format(selectedDate, 'd MMM yyyy')}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showDateInput && (
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(parseISO(e.target.value));
                  setShowDateInput(false);
                }
              }}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 text-xs focus:outline-none focus:border-cyan-500/50"
              autoFocus
            />
          )}

          <button
            onClick={() => { setSelectedDate(new Date()); setShowDateInput(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isToday(selectedDate)
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            Today
          </button>
        </div>
      </HeaderPortal>

      <HeaderPortal type="actions">
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </HeaderPortal>

      {/* Mobile date bar */}
      <div className="md:hidden flex items-center gap-1.5 mb-3 mt-3">
        <button
          onClick={() => setShowDateInput(!showDateInput)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-300 hover:border-cyan-500/30 transition-colors text-sm flex-1"
        >
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="flex-1 text-left">{format(selectedDate, 'd MMM yyyy')}</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        <button
          onClick={() => { setSelectedDate(new Date()); setShowDateInput(false); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            isToday(selectedDate)
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400'
          }`}
        >
          Today
        </button>
      </div>

      {showDateInput && (
        <div className="md:hidden mb-2">
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => {
              if (e.target.value) {
                setSelectedDate(parseISO(e.target.value));
                setShowDateInput(false);
              }
            }}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-sm focus:outline-none focus:border-cyan-500/50"
            autoFocus
          />
        </div>
      )}

      {/* Summary Cards — compact 5-column row */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {[
          { label: 'Total', value: summary.total.toString(), icon: <FileText className="w-3 h-3" />, color: 'text-cyan-400' },
          { label: 'Sales', value: formatCurrency(summary.sales), icon: <TrendingUp className="w-3 h-3" />, color: 'text-emerald-400' },
          { label: 'Purchases', value: formatCurrency(summary.purchases), icon: <TrendingDown className="w-3 h-3" />, color: 'text-blue-400' },
          { label: 'Payments', value: formatCurrency(summary.payments), icon: <CreditCard className="w-3 h-3" />, color: 'text-amber-400' },
          { label: 'Receipts', value: formatCurrency(summary.receipts), icon: <Banknote className="w-3 h-3" />, color: 'text-purple-400' },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2 min-w-0"
          >
            <div className={`flex items-center gap-1 ${item.color} mb-0.5`}>
              {item.icon}
              <span className="text-[8px] sm:text-[9px] font-bold text-zinc-500 uppercase truncate">{item.label}</span>
            </div>
            <p className="text-[10px] sm:text-xs font-bold text-white truncate">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Voucher Type Tabs — full-width scrollable */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-hide">
        {VOUCHER_TABS.map((tab) => {
          const count = tab === 'All' ? vouchers.length : vouchers.filter((v) => v.vch_type === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tab}
              <span className="text-[8px] px-1 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Voucher List — borderless dense rows */}
      <div className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Calendar className="w-10 h-10 mb-2 opacity-30" />
            <p className="font-medium text-sm">No vouchers found</p>
            <p className="text-xs mt-1">No {activeTab === 'All' ? '' : activeTab.toLowerCase()} vouchers for this date</p>
          </div>
        ) : (
          <>
            {/* Desktop header row */}
            <div className="hidden sm:grid grid-cols-[80px_90px_80px_1fr_110px_1fr_auto] gap-2 px-[2px] py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50">
              <div>Time</div>
              <div>Type</div>
              <div>#</div>
              <div>Party</div>
              <div className="text-right">Amount</div>
              <div className="hidden lg:block">Narration</div>
              <div className="w-4" />
            </div>

            {/* Rows */}
            <AnimatePresence>
              {filteredVouchers.map((v, i) => {
                const colors = VOUCHER_TYPE_COLORS[v.vch_type] || { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' };
                const isClickable = v.vch_type === 'Sales';
                return (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ delay: Math.min(i * 0.015, 0.2) }}
                    onClick={() => handleRowClick(v)}
                    className={`group grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[80px_90px_80px_1fr_110px_1fr_auto] gap-1 sm:gap-2 px-[2px] py-2 items-center hover:bg-zinc-800/40 active:bg-zinc-800/60 transition-colors border-b border-zinc-800/30 last:border-b-0 ${
                      isClickable ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {/* Time */}
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1 sm:col-span-1">
                      <Clock className="w-3 h-3 sm:hidden" />
                      <span className="hidden sm:inline text-zinc-600 text-[9px]">Clock</span>
                      {v.created_at ? format(parseISO(v.created_at), 'hh:mm a') : '--'}
                    </div>

                    {/* Type badge */}
                    <div className="sm:col-span-1">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}
                      >
                        {VOUCHER_ICONS[v.vch_type]}
                        <span className="hidden sm:inline">{v.vch_type}</span>
                        <span className="sm:hidden">{v.vch_type.slice(0, 3)}</span>
                      </span>
                    </div>

                    {/* Voucher # */}
                    <div className="text-[10px] sm:text-xs text-zinc-400 font-mono sm:col-span-1">{v.vch_number}</div>

                    {/* Party Name + Narration on desktop */}
                    <div className="min-w-0 sm:col-span-1">
                      <p className="text-xs sm:text-sm text-zinc-200 truncate font-medium">{v.party_name || '-'}</p>
                      <p className="text-[9px] text-zinc-600 truncate hidden lg:block">{v.narration || '-'}</p>
                    </div>

                    {/* Amount */}
                    <div className="text-[11px] sm:text-sm font-bold text-white text-right tabular-nums sm:col-span-1">
                      {formatCurrency(v.total_amount || 0)}
                    </div>

                    {/* Narration mobile */}
                    <div className="hidden sm:block lg:hidden text-[9px] text-zinc-600 truncate sm:col-span-1">{v.narration || '-'}</div>

                    {/* Chevron */}
                    <div className="sm:col-span-1">
                      {isClickable && (
                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-cyan-400 transition-colors" />
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Footer */}
            <div className="flex items-center justify-between px-[2px] py-2 border-t border-zinc-800/50 text-xs text-zinc-500">
              <span>{filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''}</span>
              <span className="font-bold text-white tabular-nums">
                Total: {formatCurrency(filteredVouchers.reduce((sum, v) => sum + (v.total_amount || 0), 0))}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Voucher Detail Modal */}
      <AnimatePresence>
        {showModal && selectedVoucher && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Voucher Details</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Type</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${
                      VOUCHER_TYPE_COLORS[selectedVoucher.vch_type]?.bg
                    } ${VOUCHER_TYPE_COLORS[selectedVoucher.vch_type]?.text} ${
                      VOUCHER_TYPE_COLORS[selectedVoucher.vch_type]?.border
                    }`}
                  >
                    {VOUCHER_ICONS[selectedVoucher.vch_type]}
                    {selectedVoucher.vch_type}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Voucher #</span>
                  <span className="text-sm text-zinc-200 font-mono">{selectedVoucher.vch_number}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Party</span>
                  <span className="text-sm text-zinc-200">{selectedVoucher.party_name || '-'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Amount</span>
                  <span className="text-lg font-bold text-white">{formatCurrency(selectedVoucher.total_amount || 0)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Date</span>
                  <span className="text-sm text-zinc-200">{selectedVoucher.vch_date ? format(parseISO(selectedVoucher.vch_date), 'd MMM yyyy') : '--'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Time</span>
                  <span className="text-sm text-zinc-200">{selectedVoucher.created_at ? format(parseISO(selectedVoucher.created_at), 'hh:mm a') : '--'}</span>
                </div>

                {selectedVoucher.narration && (
                  <div className="pt-2 border-t border-zinc-800">
                    <span className="text-xs text-zinc-500 block mb-1">Narration</span>
                    <p className="text-sm text-zinc-300 leading-relaxed">{selectedVoucher.narration}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  SlidersHorizontal,
  Plus,
  X,
  ChevronDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRightLeft,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Banknote,
  FileText,
  CreditCard,
  Landmark,
  Smartphone,
  Wallet,
  CircleDollarSign,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { HapticService } from '@/services/hapticService';

// ─── Type Definitions ───────────────────────────────────────────────────────

export type VoucherType =
  | 'Sales'
  | 'Purchase'
  | 'Payment'
  | 'Receipt'
  | 'Contra'
  | 'Journal'
  | 'CreditNote'
  | 'DebitNote';

export interface VoucherItem {
  id: string;
  type: VoucherType;
  number: string;
  partyName: string;
  amount: number;
  date: string;
  time?: string;
  paymentMode?: string;
  narration?: string;
  gstTotal?: number;
}

export interface VouchersPageProps {
  vouchers: VoucherItem[];
  onBack: () => void;
  onVoucherSelect: (voucher: VoucherItem) => void;
  onNewVoucher: (type: string) => void;
  onRefresh?: () => void;
}

// ─── Sample Data ────────────────────────────────────────────────────────────

const today = new Date();
const todayStr = today.toISOString().split('T')[0];
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().split('T')[0];
const thisWeekStart = new Date(today);
thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
const dayBeforeYesterday = new Date(today);
dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
const fourDaysAgo = new Date(today);
fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
const fourDaysAgoStr = fourDaysAgo.toISOString().split('T')[0];
const lastWeekDay = new Date(today);
lastWeekDay.setDate(lastWeekDay.getDate() - 7);
const lastWeekDayStr = lastWeekDay.toISOString().split('T')[0];

const SAMPLE_VOUCHERS: VoucherItem[] = [
  {
    id: 'v1',
    type: 'Sales',
    number: '#SALE-001',
    partyName: 'Rajesh Electronics',
    amount: 45200,
    date: todayStr,
    time: '10:30 AM',
    paymentMode: 'UPI',
    narration: 'Sale of electronic items',
    gstTotal: 8136,
  },
  {
    id: 'v2',
    type: 'Payment',
    number: '#PAY-023',
    partyName: 'Sharma Traders',
    amount: 18500,
    date: todayStr,
    time: '2:15 PM',
    paymentMode: 'Cash',
    narration: 'Payment for inventory purchase',
  },
  {
    id: 'v3',
    type: 'Receipt',
    number: '#REC-045',
    partyName: 'Priya Garments',
    amount: 32000,
    date: yesterdayStr,
    time: '11:45 AM',
    paymentMode: 'Bank Transfer',
    narration: 'Receipt against invoice #INV-089',
  },
  {
    id: 'v4',
    type: 'Purchase',
    number: '#PUR-012',
    partyName: 'Global Distributors',
    amount: 67500,
    date: yesterdayStr,
    time: '4:00 PM',
    paymentMode: 'Credit',
    narration: 'Stock purchase - wholesale',
    gstTotal: 12150,
  },
  {
    id: 'v5',
    type: 'Journal',
    number: '#JRN-008',
    partyName: 'Interest on Capital',
    amount: 15000,
    date: dayBeforeYesterdayStr,
    time: '9:00 AM',
    narration: 'Interest credited to capital account',
  },
  {
    id: 'v6',
    type: 'Contra',
    number: '#CTR-003',
    partyName: 'HDFC Bank → Cash',
    amount: 50000,
    date: fourDaysAgoStr,
    time: '10:00 AM',
    paymentMode: 'Bank Transfer',
    narration: 'Cash withdrawn from bank',
  },
  {
    id: 'v7',
    type: 'Sales',
    number: '#SALE-002',
    partyName: 'Mehta Furnitures',
    amount: 112800,
    date: fourDaysAgoStr,
    time: '3:30 PM',
    paymentMode: 'UPI',
    narration: 'Office furniture sale',
    gstTotal: 20304,
  },
  {
    id: 'v8',
    type: 'CreditNote',
    number: '#CN-005',
    partyName: 'Rajesh Electronics',
    amount: 5200,
    date: lastWeekDayStr,
    time: '12:00 PM',
    narration: 'Return of defective items',
    gstTotal: 936,
  },
  {
    id: 'v9',
    type: 'DebitNote',
    number: '#DN-002',
    partyName: 'Global Distributors',
    amount: 3200,
    date: lastWeekDayStr,
    time: '2:00 PM',
    narration: 'Short delivery adjustment',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const VOUCHER_TYPES: { label: string; value: string }[] = [
  { label: 'All', value: 'All' },
  { label: 'Sales', value: 'Sales' },
  { label: 'Purchase', value: 'Purchase' },
  { label: 'Payment', value: 'Payment' },
  { label: 'Receipt', value: 'Receipt' },
  { label: 'Contra', value: 'Contra' },
  { label: 'Journal', value: 'Journal' },
  { label: 'Credit Note', value: 'CreditNote' },
  { label: 'Debit Note', value: 'DebitNote' },
];

const QUICK_FILTERS = ['Today', 'This Week', 'This Month', 'Custom'] as const;
type QuickFilter = (typeof QUICK_FILTERS)[number];

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

  const target = new Date(today);
  target.setDate(target.getDate() - target.getDay());
  if (date >= target && date <= today) return 'This Week';

  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  };
  return date.toLocaleDateString('en-IN', options);
}

function formatAmount(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

// ─── Color Config ───────────────────────────────────────────────────────────

const VOUCHER_COLORS: Record<VoucherType, { bg: string; text: string; badge: string; iconBg: string }> = {
  Sales: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
  },
  Purchase: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    iconBg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400',
  },
  Payment: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    text: 'text-orange-700 dark:text-orange-300',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    iconBg: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400',
  },
  Receipt: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
  },
  Contra: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400',
  },
  Journal: {
    bg: 'bg-slate-50 dark:bg-slate-800/30',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
    iconBg: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400',
  },
  CreditNote: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
  },
  DebitNote: {
    bg: 'bg-pink-50 dark:bg-pink-950/30',
    text: 'text-pink-700 dark:text-pink-300',
    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300 border-pink-200 dark:border-pink-800',
    iconBg: 'bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-400',
  },
};

function getVoucherIcon(type: VoucherType, className?: string) {
  const props = { className: cn('w-5 h-5', className) };
  switch (type) {
    case 'Sales':
      return <TrendingUp {...props} />;
    case 'Purchase':
      return <ShoppingCart {...props} />;
    case 'Payment':
      return <ArrowUpRight {...props} />;
    case 'Receipt':
      return <ArrowDownRight {...props} />;
    case 'Contra':
      return <ArrowRightLeft {...props} />;
    case 'Journal':
      return <ScrollText {...props} />;
    case 'CreditNote':
      return <Receipt {...props} />;
    case 'DebitNote':
      return <FileText {...props} />;
    default:
      return <CircleDollarSign {...props} />;
  }
}

function getPaymentModeIcon(mode?: string) {
  const props = { className: 'w-3 h-3' };
  switch (mode) {
    case 'Cash':
      return <Wallet {...props} />;
    case 'UPI':
      return <Smartphone {...props} />;
    case 'Bank Transfer':
      return <Landmark {...props} />;
    case 'Credit':
      return <CreditCard {...props} />;
    case 'Cheque':
      return <Banknote {...props} />;
    default:
      return null;
  }
}

function getTypeDrCr(type: VoucherType): { label: string; positive: boolean } {
  switch (type) {
    case 'Sales':
    case 'Receipt':
    case 'CreditNote':
      return { label: 'Cr', positive: true };
    case 'Purchase':
    case 'Payment':
    case 'DebitNote':
      return { label: 'Dr', positive: false };
    case 'Contra':
    case 'Journal':
      return { label: '', positive: true };
    default:
      return { label: '', positive: true };
  }
}

function getNewVoucherTypes(): { label: string; value: string; icon: React.ReactNode }[] {
  return [
    { label: 'Sales Invoice', value: 'Sales', icon: <TrendingUp className="w-5 h-5 text-emerald-500" /> },
    { label: 'Purchase', value: 'Purchase', icon: <ShoppingCart className="w-5 h-5 text-rose-500" /> },
    { label: 'Payment', value: 'Payment', icon: <ArrowUpRight className="w-5 h-5 text-orange-500" /> },
    { label: 'Receipt', value: 'Receipt', icon: <ArrowDownRight className="w-5 h-5 text-blue-500" /> },
    { label: 'Contra', value: 'Contra', icon: <ArrowRightLeft className="w-5 h-5 text-purple-500" /> },
    { label: 'Journal', value: 'Journal', icon: <ScrollText className="w-5 h-5 text-slate-500" /> },
    { label: 'Credit Note', value: 'CreditNote', icon: <Receipt className="w-5 h-5 text-amber-500" /> },
    { label: 'Debit Note', value: 'DebitNote', icon: <FileText className="w-5 h-5 text-pink-500" /> },
  ];
}

// ─── Voucher Card Component ─────────────────────────────────────────────────

interface VoucherCardProps {
  voucher: VoucherItem;
  index: number;
  onSelect: (v: VoucherItem) => void;
}

const VoucherCard: React.FC<VoucherCardProps> = React.memo(
  ({ voucher, index, onSelect }) => {
    const colors = VOUCHER_COLORS[voucher.type];
    const drcr = getTypeDrCr(voucher.type);

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.03, ease: 'easeOut' }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          HapticService.light();
          onSelect(voucher);
        }}
        className={cn(
          'rounded-xl border p-3.5 cursor-pointer select-none',
          'active:scale-[0.98] transition-all duration-150',
          'bg-white dark:bg-slate-900',
          'border-slate-100 dark:border-slate-800',
          'shadow-sm hover:shadow-md',
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              colors.iconBg,
            )}
          >
            {getVoucherIcon(voucher.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: type + number */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-semibold px-2 py-0 border',
                    colors.badge,
                  )}
                >
                  {voucher.type}
                </Badge>
                {drcr.label && (
                  <span
                    className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded',
                      drcr.positive
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50'
                        : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50',
                    )}
                  >
                    {drcr.label}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                {voucher.number}
              </span>
            </div>

            {/* Party name */}
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1 truncate">
              {voucher.partyName}
            </p>

            {/* Bottom row: timestamp + payment mode */}
            <div className="flex items-center gap-2 mt-1.5">
              {voucher.time && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {voucher.time}
                </span>
              )}
              {voucher.paymentMode && (
                <Badge
                  variant="secondary"
                  className="text-[9px] font-medium px-1.5 py-0 h-4 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                >
                  {getPaymentModeIcon(voucher.paymentMode)}
                  {voucher.paymentMode === 'Bank Transfer' ? 'Bank' : voucher.paymentMode}
                </Badge>
              )}
              {voucher.gstTotal && (
                <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-auto">
                  GST: ₹{voucher.gstTotal.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p
              className={cn(
                'text-base font-bold leading-tight',
                drcr.positive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {formatAmount(voucher.amount)}
            </p>
            {voucher.narration && (
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-[100px] truncate">
                {voucher.narration}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    );
  },
);

VoucherCard.displayName = 'VoucherCard';

// ─── Date Header Component ──────────────────────────────────────────────────

const DateHeader: React.FC<{ label: string; count: number }> = ({
  label,
  count,
}) => (
  <div
    className={cn(
      'sticky top-0 z-10 py-2 px-1 mb-2',
      'backdrop-blur-xl bg-white/70 dark:bg-slate-900/70',
      'border-b border-slate-100 dark:border-slate-800',
    )}
  >
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
        {label}
      </h3>
      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
        {count} voucher{count !== 1 ? 's' : ''}
      </span>
    </div>
  </div>
);

// ─── Action Sheet ───────────────────────────────────────────────────────────

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const ActionSheet: React.FC<ActionSheetProps> = ({ open, onClose, onSelect }) => {
  const types = getNewVoucherTypes();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white dark:bg-slate-900 shadow-2xl max-h-[70vh] overflow-hidden pb-safe"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                New Voucher
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Options */}
            <div className="overflow-y-auto p-4 space-y-1 max-h-[50vh]">
              {types.map((type) => (
                <button
                  key={type.value}
                  onClick={() => {
                    HapticService.medium();
                    onSelect(type.value);
                    onClose();
                  }}
                  className={cn(
                    'w-full flex items-center gap-4 p-3.5 rounded-xl',
                    'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    'active:bg-slate-100 dark:active:bg-slate-800',
                    'transition-colors duration-150',
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    {type.icon}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {type.label}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Create a new {type.label.toLowerCase()} entry
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-auto rotate-[-90deg]" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const VouchersPage: React.FC<VouchersPageProps> = ({
  vouchers,
  onBack,
  onVoucherSelect,
  onNewVoucher,
}) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilter>('This Week');
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [_startDate] = useState('01 May 2026');
  const [_endDate] = useState('14 May 2026');

  const displayVouchers = vouchers.length > 0 ? vouchers : SAMPLE_VOUCHERS;

  // Filter by type
  const filteredByType = useMemo(() => {
    if (activeFilter === 'All') return displayVouchers;
    return displayVouchers.filter((v) => v.type === activeFilter);
  }, [displayVouchers, activeFilter]);

  // Group by date (more reliable version)
  const sortedGroups = useMemo(() => {
    const groups: { label: string; items: VoucherItem[] }[] = [];
    const seen = new Set<string>();

    // Collect unique labels preserving date order
    filteredByType.forEach((v) => {
      const label = getDateLabel(v.date);
      if (!seen.has(label)) {
        seen.add(label);
        groups.push({ label, items: [] });
      }
    });

    // Sort groups by their underlying date
    groups.sort((a, b) => {
      const getDateForLabel = (label: string) => {
        const v = filteredByType.find((v) => getDateLabel(v.date) === label);
        return v ? new Date(v.date).getTime() : 0;
      };
      return getDateForLabel(b.label) - getDateForLabel(a.label);
    });

    // Assign items
    groups.forEach((g) => {
      g.items = filteredByType.filter((v) => getDateLabel(v.date) === g.label);
    });

    return groups;
  }, [filteredByType]);

  const handleTypeFilter = useCallback((type: string) => {
    HapticService.light();
    setActiveFilter(type);
  }, []);

  const handleQuickFilter = useCallback((qf: QuickFilter) => {
    HapticService.light();
    setActiveQuickFilter(qf);
    setShowQuickFilters(false);
    // In a full implementation this would filter by date range
  }, []);

  const formatDisplayDateRange = () => {
    return `01 May 2026 - 14 May 2026`;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* ── Top Bar ── */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Vouchers
            </h1>
          </div>
          <button
            onClick={() => {
              HapticService.light();
              setShowQuickFilters(!showQuickFilters);
            }}
            className="p-2 rounded-full active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
          >
            <SlidersHorizontal className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── Quick Filter Dropdown ── */}
      <AnimatePresence>
        {showQuickFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                Quick Date Filters
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_FILTERS.map((qf) => (
                  <button
                    key={qf}
                    onClick={() => handleQuickFilter(qf)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                      activeQuickFilter === qf
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
                    )}
                  >
                    {qf}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter Chips Row ── */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div
          ref={chipScrollRef}
          className="flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar"
        >
          {VOUCHER_TYPES.map((chip) => {
            const isActive = activeFilter === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => handleTypeFilter(chip.value)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 shrink-0',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-transparent text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Date Range Selector ── */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5">
        <button
          onClick={() => setShowQuickFilters(!showQuickFilters)}
          className="flex items-center gap-2.5 w-full"
        >
          <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {formatDisplayDateRange()}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 ml-auto" />
        </button>
      </div>

      {/* ── Voucher List ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        {sortedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              No vouchers found
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
              Try changing the filter or create a new one
            </p>
          </div>
        ) : (
          <div className="px-4 pt-3 space-y-6">
            {sortedGroups.map((group) => (
              <div key={group.label}>
                <DateHeader label={group.label} count={group.items.length} />
                <div className="space-y-2.5">
                  {group.items.map((voucher, idx) => (
                    <VoucherCard
                      key={voucher.id}
                      voucher={voucher}
                      index={idx}
                      onSelect={onVoucherSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom padding for FAB */}
        <div className="h-24" />
      </div>

      {/* ── FAB ── */}
      <div className="fixed bottom-6 right-6 z-20">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            HapticService.medium();
            setShowActionSheet(true);
          }}
          className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center',
            'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
            'shadow-lg shadow-blue-600/30',
            'text-white',
            'transition-colors duration-200',
          )}
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </div>

      {/* ── FAB Label ── */}
      <div className="fixed bottom-20 right-6 z-20 pointer-events-none">
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg shadow-sm"
        >
          New Voucher
        </motion.span>
      </div>

      {/* ── Action Sheet ── */}
      <ActionSheet
        open={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onSelect={(type) => {
          onNewVoucher(type);
        }}
      />
    </div>
  );
};

export default VouchersPage;

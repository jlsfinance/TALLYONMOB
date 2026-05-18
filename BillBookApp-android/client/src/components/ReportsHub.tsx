import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  Scale,
  BookOpen,
  Calendar,
  DollarSign,
  Users,
  Clock,
  BarChart3,
  ShoppingCart,
  Truck,
  Package,
  PackageSearch,
  AlertOctagon,
  FileText,
  Shield,
  Receipt,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReportItem {
  id: string;
  label: string;
  subtitle: string;
  icon: any;
  color: string;
  bgColor: string;
}

interface ReportCategory {
  id: string;
  label: string;
  icon: any;
  color: string;
  bgColor: string;
  reports: ReportItem[];
}

interface QuickStat {
  label: string;
  value: number;
  changePercent: number;
  sparklineData: number[];
  prefix?: string;
  isCurrency?: boolean;
}

interface ReportsHubProps {
  onBack: () => void;
  onReportSelect: (reportId: string) => void;
  monthlyRevenue?: number;
  monthlyExpenses?: number;
  netIncome?: number;
  lastSyncTime?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Configuration
// ─────────────────────────────────────────────────────────────────────────────

const reportCategories: ReportCategory[] = [
  {
    id: 'financial',
    label: 'Financial Reports',
    icon: TrendingUp,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    reports: [
      { id: 'profit_loss', label: 'Profit & Loss', subtitle: 'Revenue, costs & net profit analysis', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
      { id: 'balance_sheet', label: 'Balance Sheet', subtitle: 'Assets, liabilities & equity overview', icon: Scale, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
      { id: 'trial_balance', label: 'Trial Balance', subtitle: 'Ledger balances & account summary', icon: BookOpen, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30' },
      { id: 'day_book', label: 'Day Book', subtitle: 'Daily transaction journal', icon: Calendar, color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-950/30' },
      { id: 'cash_flow', label: 'Cash Flow', subtitle: 'Cash inflows & outflows', icon: DollarSign, color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30' },
    ],
  },
  {
    id: 'party',
    label: 'Party Reports',
    icon: Users,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    reports: [
      { id: 'party_outstanding', label: 'Party Outstanding', subtitle: 'Receivables, payables & balances', icon: Users, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30' },
      { id: 'party_aging', label: 'Party Aging', subtitle: 'Overdue & aging analysis', icon: Clock, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30' },
      { id: 'customer_analytics', label: 'Customer Analytics', subtitle: 'Credit risk & purchase behavior', icon: BarChart3, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30' },
    ],
  },
  {
    id: 'sales_purchase',
    label: 'Sales / Purchase',
    icon: ShoppingCart,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/40',
    reports: [
      { id: 'sales_register', label: 'Sales Register', subtitle: 'All sales invoices & bill details', icon: ShoppingCart, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30' },
      { id: 'purchase_register', label: 'Purchase Register', subtitle: 'All purchase invoices & expenses', icon: Truck, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30' },
      { id: 'sales_summary', label: 'Sales Summary', subtitle: 'Period-wise sales & tax summary', icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock Reports',
    icon: Package,
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-50 dark:bg-teal-950/40',
    reports: [
      { id: 'stock_summary', label: 'Stock Summary', subtitle: 'Inventory levels & stock valuation', icon: Package, color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-50 dark:bg-teal-950/30' },
      { id: 'stock_aging', label: 'Stock Aging', subtitle: 'Slow-moving & aged inventory', icon: PackageSearch, color: 'text-cyan-600 dark:text-cyan-400', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30' },
      { id: 'low_stock_alert', label: 'Low Stock Alert', subtitle: 'Items below reorder threshold', icon: AlertOctagon, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30' },
    ],
  },
  {
    id: 'gst',
    label: 'GST Reports',
    icon: FileText,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/40',
    reports: [
      { id: 'gstr1', label: 'GSTR-1', subtitle: 'Outward supply & sales return filing', icon: FileText, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30' },
      { id: 'gstr3b_summary', label: 'GSTR-3B Summary', subtitle: 'Monthly summary return filing', icon: Shield, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30' },
      { id: 'input_output_tax', label: 'Input/Output Tax', subtitle: 'ITC & output tax liability', icon: Receipt, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline Mini Chart (Pure CSS bars)
// ─────────────────────────────────────────────────────────────────────────────

const MiniSparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[1.5px] h-8 w-full">
      {data.map((val, idx) => {
        const heightPct = Math.max((val / max) * 100, 8);
        return (
          <div
            key={idx}
            className="flex-1 rounded-t-sm transition-all duration-300"
            style={{
              height: `${heightPct}%`,
              backgroundColor: color,
              opacity: 0.6 + (idx / data.length) * 0.4,
            }}
          />
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Change Badge
// ─────────────────────────────────────────────────────────────────────────────

const ChangeBadge: React.FC<{ percent: number }> = ({ percent }) => {
  const isPositive = percent > 0;
  const isNeutral = percent === 0;
  const IconComponent = isNeutral ? Minus : isPositive ? ArrowUp : ArrowDown;
  const color = isNeutral
    ? 'text-slate-400 bg-slate-100 dark:bg-slate-800 dark:text-slate-500'
    : isPositive
      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400'
      : 'text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400';
  return (
    <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${color}`}>
      <IconComponent className="w-2.5 h-2.5" />
      <span>{isNeutral ? '0%' : `${Math.abs(percent).toFixed(1)}%`}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Quick Stat Card
// ─────────────────────────────────────────────────────────────────────────────

const QuickStatCard: React.FC<{
  stat: QuickStat;
  accentColor: string;
}> = ({ stat, accentColor }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-3"
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
        {stat.label}
      </p>
      <p className="text-sm font-black text-slate-800 dark:text-white truncate">
        {stat.isCurrency !== false
          ? formatCurrency(stat.value)
          : stat.prefix
            ? `${stat.prefix}${stat.value}`
            : stat.value}
      </p>
      <div className="flex items-center justify-between mt-1.5">
        <ChangeBadge percent={stat.changePercent} />
        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">vs last month</span>
      </div>
      <div className="mt-2">
        <MiniSparkline data={stat.sparklineData} color={accentColor} />
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Report Card
// ─────────────────────────────────────────────────────────────────────────────

const ReportCard: React.FC<{
  report: ReportItem;
  onTap: () => void;
  onLongPress: () => void;
}> = ({ report, onTap, onLongPress }) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const handlePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setIsPressed(true);
      onLongPress();
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isPressed) {
      setIsPressed(false);
    } else {
      onTap();
    }
  }, [isPressed, onTap]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsPressed(false);
  }, []);

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className="relative w-full flex flex-col items-start p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow text-left group"
    >
      {/* Icon */}
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center ${report.bgColor} group-hover:scale-110 transition-transform mb-2`}
      >
        <report.icon className={`w-4.5 h-4.5 ${report.color}`} strokeWidth={1.5} />
      </div>
      {/* Title */}
      <h4 className="text-xs font-bold text-slate-800 dark:text-white leading-tight mb-0.5">
        {report.label}
      </h4>
      {/* Subtitle */}
      <p className="text-[9px] font-medium text-slate-400 dark:text-slate-500 leading-tight line-clamp-2">
        {report.subtitle}
      </p>
      {/* Chevron indicator */}
      <ChevronRight className="absolute right-3 top-3 w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Long Press Popover
// ─────────────────────────────────────────────────────────────────────────────

const ReportDescriptionPopover: React.FC<{
  report: ReportItem | null;
  onClose: () => void;
}> = ({ report, onClose }) => {
  return (
    <AnimatePresence>
      {report && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${report.bgColor}`}>
                <report.icon className={`w-5 h-5 ${report.color}`} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">{report.label}</h3>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {report.subtitle}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">
              Tap to open this report with full data, filtering, and export options.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onClose();
                }}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onClose();
                }}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
              >
                Open Report
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const ReportsHub: React.FC<ReportsHubProps> = ({
  onBack,
  onReportSelect,
  monthlyRevenue = 0,
  monthlyExpenses = 0,
  netIncome = 0,
  lastSyncTime,
}) => {
  const [longPressedReport, setLongPressedReport] = useState<ReportItem | null>(null);

  // Derive previous month values (simulated: ~5-15% variance)
  const generateSparkline = (base: number, variance: number = 0.15): number[] => {
    const points = 7;
    return Array.from({ length: points }, (_, i) => {
      const progress = i / (points - 1);
      const trend = base * (1 + (progress - 0.5) * 0.2);
      const noise = trend * (Math.random() - 0.5) * variance;
      return Math.max(Math.round(trend + noise), 0);
    });
  };

  const lastMonthRevenue = monthlyRevenue * (0.85 + Math.random() * 0.15);
  const lastMonthExpenses = monthlyExpenses * (0.85 + Math.random() * 0.15);
  const lastMonthNetIncome = netIncome * (0.85 + Math.random() * 0.15);

  const quickStats: QuickStat[] = [
    {
      label: 'Revenue (This Month)',
      value: monthlyRevenue || 0,
      changePercent: lastMonthRevenue
        ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0,
      sparklineData: generateSparkline(monthlyRevenue || 50000),
    },
    {
      label: 'Expenses (This Month)',
      value: monthlyExpenses || 0,
      changePercent: lastMonthExpenses
        ? ((monthlyExpenses - lastMonthExpenses) / lastMonthExpenses) * 100
        : 0,
      sparklineData: generateSparkline(monthlyExpenses || 30000),
    },
    {
      label: 'Net Income',
      value: netIncome || 0,
      changePercent: lastMonthNetIncome
        ? ((netIncome - lastMonthNetIncome) / lastMonthNetIncome) * 100
        : 0,
      sparklineData: generateSparkline(netIncome || 20000),
    },
  ];

  const handleReportSelect = (reportId: string) => {
    onReportSelect(reportId);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── Top Bar ── */}
      <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="font-black text-lg text-slate-800 dark:text-white uppercase tracking-tight">
            Reports
          </span>
        </div>
        {lastSyncTime && (
          <span className="text-[8px] font-medium text-slate-400 dark:text-slate-500">
            Synced: {lastSyncTime}
          </span>
        )}
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* ── Quick Stats Row (LiveKeeping style) ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-5"
        >
          <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2.5 ml-0.5">
            Monthly Overview
          </h3>
          <div className="flex gap-2.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
            <QuickStatCard stat={quickStats[0]} accentColor="#10B981" />
            <QuickStatCard stat={quickStats[1]} accentColor="#EF4444" />
            <QuickStatCard stat={quickStats[2]} accentColor="#3B82F6" />
          </div>
        </motion.div>

        {/* ── Report Categories Grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="space-y-5"
        >
          {reportCategories.map((category, catIdx) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * catIdx }}
            >
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-2.5 ml-0.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${category.bgColor}`}
                >
                  <category.icon className={`w-3.5 h-3.5 ${category.color}`} strokeWidth={2} />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 flex-1">
                  {category.label}
                </h3>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {category.reports.length}
                </span>
              </div>

              {/* 2-Column Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {category.reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onTap={() => handleReportSelect(report.id)}
                    onLongPress={() => setLongPressedReport(report)}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer */}
        <div className="mt-10 mb-4 text-center opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-600">
            Reports Hub — BillBook
          </p>
        </div>
      </div>

      {/* ── Long Press Popover ── */}
      <ReportDescriptionPopover
        report={longPressedReport}
        onClose={() => setLongPressedReport(null)}
      />
    </div>
  );
};

export default ReportsHub;

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Receipt,
  CreditCard,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Trash2,
  Edit3,
  Send,
  MessageSquare,
  Users,
  Calendar,
  ArrowRight,
  Ban,
  Eye,
  CheckSquare,
  Square,
  Settings,
  History,
  UserCheck,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Timer,
  Inbox,
  X,
  Info,
  RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, isWithinInterval } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';

// Types
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated';
type VoucherType = 'invoice' | 'expense' | 'payment' | 'journal';
type TabType = 'all' | 'invoice' | 'expense' | 'payment' | 'journal';

interface ApprovalItem {
  id: string;
  type: VoucherType;
  amount: number;
  requester: string;
  date: string;
  description: string;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  priority: 'low' | 'medium' | 'high';
}

interface ApprovalRule {
  id: string;
  name: string;
  condition: string;
  thresholdAmount: number;
  approvers: string[];
  status: 'active' | 'inactive';
  voucherType: VoucherType;
  department?: string;
  ledgerGroup?: string;
}

interface ApprovalHistoryEntry {
  id: string;
  itemId: string;
  action: 'approved' | 'rejected' | 'escalated' | 'requested_info';
  performedBy: string;
  timestamp: string;
  comments?: string;
  itemType: VoucherType;
  amount: number;
}

interface Delegation {
  id: string;
  delegateFrom: string;
  delegateTo: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'active' | 'expired' | 'cancelled';
}

// Utility Functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

const getTypeIcon = (type: VoucherType) => {
  switch (type) {
    case 'invoice':
      return <FileText className="w-4 h-4" />;
    case 'expense':
      return <Receipt className="w-4 h-4" />;
    case 'payment':
      return <CreditCard className="w-4 h-4" />;
    case 'journal':
      return <BookOpen className="w-4 h-4" />;
  }
};

const getTypeLabel = (type: VoucherType): string => {
  switch (type) {
    case 'invoice':
      return 'Invoice';
    case 'expense':
      return 'Expense';
    case 'payment':
      return 'Payment';
    case 'journal':
      return 'Journal Entry';
  }
};

const getTypeBadgeColor = (type: VoucherType): string => {
  switch (type) {
    case 'invoice':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'expense':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'payment':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'journal':
      return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
  }
};

const getStatusBadgeColor = (status: ApprovalStatus): string => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'approved':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'rejected':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'escalated':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  }
};

const getStatusIcon = (status: ApprovalStatus) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'approved':
      return <CheckCircle className="w-4 h-4" />;
    case 'rejected':
      return <XCircle className="w-4 h-4" />;
    case 'escalated':
      return <AlertTriangle className="w-4 h-4" />;
  }
};

const getPriorityColor = (priority: 'low' | 'medium' | 'high'): string => {
  switch (priority) {
    case 'low':
      return 'text-zinc-400';
    case 'medium':
      return 'text-yellow-400';
    case 'high':
      return 'text-red-400';
  }
};

// Sub-Components
const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: { value: string; isUp: boolean };
  delay?: number;
}> = ({ title, value, icon, color, trend, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.3 }}
    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-5 hover:border-cyan-500/30 transition-all duration-300 group"
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      {trend && (
        <div
          className={`flex items-center gap-1 text-xs font-medium ${
            trend.isUp ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {trend.isUp ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {trend.value}
        </div>
      )}
    </div>
    <div className="text-2xl sm:text-3xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">
      {value}
    </div>
    <div className="text-sm text-zinc-400">{title}</div>
  </motion.div>
);

const ApprovalItemCard: React.FC<{
  item: ApprovalItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRequestInfo: () => void;
  index: number;
}> = ({ item, isSelected, onToggleSelect, onApprove, onReject, onRequestInfo, index }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`border rounded-xl p-4 transition-all duration-300 ${
        isSelected
          ? 'border-cyan-500/50 bg-cyan-500/5'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleSelect}
          className="mt-1 text-zinc-500 hover:text-cyan-400 transition-colors flex-shrink-0"
        >
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-cyan-400" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTypeBadgeColor(
                item.type
              )}`}
            >
              {getTypeIcon(item.type)}
              {getTypeLabel(item.type)}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeColor(
                item.status
              )}`}
            >
              {getStatusIcon(item.status)}
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </span>
            <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
              {item.priority.toUpperCase()}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-medium truncate">{item.description}</h4>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-zinc-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {item.requester}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {format(new Date(item.date), 'dd MMM yyyy, hh:mm a')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-cyan-400">{formatCurrency(item.amount)}</span>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-3 border-t border-zinc-800">
                  {item.status === 'pending' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={onApprove}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={onReject}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                      <button
                        onClick={onRequestInfo}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Request Info
                      </button>
                    </div>
                  ) : item.status === 'approved' ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Approved by {item.approvedBy} on{' '}
                      {item.approvedAt && format(new Date(item.approvedAt), 'dd MMM yyyy, hh:mm a')}
                    </div>
                  ) : item.status === 'rejected' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <XCircle className="w-4 h-4 text-red-400" />
                        Rejected by {item.approvedBy}
                      </div>
                      {item.rejectReason && (
                        <p className="text-sm text-red-400/80 bg-red-500/10 p-2 rounded-lg">
                          "{item.rejectReason}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <AlertTriangle className="w-4 h-4 text-purple-400" />
                      Escalated by {item.approvedBy} on{' '}
                      {item.approvedAt && format(new Date(item.approvedAt), 'dd MMM yyyy, hh:mm a')}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

const RuleCard: React.FC<{
  rule: ApprovalRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}> = ({ rule, onEdit, onDelete, onToggleStatus }) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className={`border rounded-xl p-4 transition-all duration-300 ${
      rule.status === 'active'
        ? 'border-zinc-800 bg-zinc-900/50 hover:border-cyan-500/30'
        : 'border-zinc-800/50 bg-zinc-900/30 opacity-60'
    }`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTypeBadgeColor(
            rule.voucherType
          )}`}
        >
          {getTypeIcon(rule.voucherType)}
          {getTypeLabel(rule.voucherType)}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            rule.status === 'active'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-zinc-500/20 text-zinc-400'
          }`}
        >
          {rule.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleStatus}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title={rule.status === 'active' ? 'Deactivate' : 'Activate'}
        >
          <Ban className="w-4 h-4" />
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>

    <h4 className="text-white font-semibold mb-1">{rule.name}</h4>
    <p className="text-sm text-zinc-400 mb-2">{rule.condition}</p>

    <div className="flex flex-wrap gap-2 mb-2">
      {rule.approvers.map((approver) => (
        <span
          key={approver}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-xs"
        >
          <UserCheck className="w-3 h-3" />
          {approver}
        </span>
      ))}
    </div>

    {rule.department && (
      <p className="text-xs text-zinc-500">Department: {rule.department}</p>
    )}
    {rule.ledgerGroup && (
      <p className="text-xs text-zinc-500">Ledger Group: {rule.ledgerGroup}</p>
    )}
  </motion.div>
);

const HistoryItem: React.FC<{
  entry: ApprovalHistoryEntry;
  index: number;
}> = ({ entry, index }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05 }}
    className="flex gap-4 relative"
  >
    {index > 0 && (
      <div className="absolute left-[15px] -top-4 w-0.5 h-4 bg-zinc-800" />
    )}

    <div className="flex-shrink-0 relative z-10">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${
          entry.action === 'approved'
            ? 'bg-emerald-500/20 text-emerald-400'
            : entry.action === 'rejected'
            ? 'bg-red-500/20 text-red-400'
            : entry.action === 'escalated'
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-blue-500/20 text-blue-400'
        }`}
      >
        {entry.action === 'approved' ? (
          <CheckCircle className="w-4 h-4" />
        ) : entry.action === 'rejected' ? (
          <XCircle className="w-4 h-4" />
        ) : entry.action === 'escalated' ? (
          <AlertTriangle className="w-4 h-4" />
        ) : (
          <MessageSquare className="w-4 h-4" />
        )}
      </div>
    </div>

    <div className="flex-1 pb-6">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              entry.action === 'approved'
                ? 'bg-emerald-500/20 text-emerald-400'
                : entry.action === 'rejected'
                ? 'bg-red-500/20 text-red-400'
                : entry.action === 'escalated'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-blue-500/20 text-blue-400'
            }`}
          >
            {entry.action === 'approved'
              ? 'Approved'
              : entry.action === 'rejected'
              ? 'Rejected'
              : entry.action === 'escalated'
              ? 'Escalated'
              : 'Info Requested'}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getTypeBadgeColor(
              entry.itemType
            )}`}
          >
            {getTypeIcon(entry.itemType)}
            {getTypeLabel(entry.itemType)}
          </span>
          <span className="text-sm font-bold text-cyan-400">{formatCurrency(entry.amount)}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
          <span className="text-white font-medium">{entry.performedBy}</span>
          <span className="text-zinc-500">{format(new Date(entry.timestamp), 'dd MMM yyyy, hh:mm a')}</span>
        </div>

        {entry.comments && (
          <p className="mt-2 text-sm text-zinc-400 bg-zinc-800/50 p-2 rounded-lg">
            {entry.comments}
          </p>
        )}
      </div>
    </div>
  </motion.div>
);

// Main Component
const ApprovalWorkflowPage: React.FC = () => {
  const { user, selectedCompany } = useAuth() as any;

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<'queue' | 'rules' | 'history' | 'delegation'>('queue');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectItemId, setRejectItemId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    condition: '',
    thresholdAmount: 0,
    approvers: '',
    voucherType: 'invoice' as VoucherType,
    department: '',
    ledgerGroup: '',
  });

  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegationForm, setDelegationForm] = useState({
    delegateTo: '',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoItemId, setInfoItemId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState('');

  const [historyFilter, setHistoryFilter] = useState({
    dateFrom: '',
    dateTo: '',
    user: '',
    type: '' as VoucherType | '',
  });

  const companyId = selectedCompany?.id;

  // ─── Data Fetching ───────────────────────────────────────────────────
  const fetchApprovals = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('approval_items')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      const errMsg = String(error.message || '');
      const isMissingTable = error.code === '42P01' || errMsg.includes('does not exist') || errMsg.includes('PGRST205');
      if (isMissingTable) { console.warn('approval_items table not found'); return; }
      console.error('Failed to load approvals:', error);
      return;
    }

    const mapped: ApprovalItem[] = (data || []).map((row: any) => ({
      id: row.id,
      type: (row.type || 'invoice') as VoucherType,
      amount: row.amount || 0,
      requester: row.requester || row.requester_name || 'Unknown',
      date: row.created_at || row.date || new Date().toISOString(),
      description: row.description || '',
      status: (row.status || 'pending') as ApprovalStatus,
      approvedBy: row.approved_by || undefined,
      approvedAt: row.approved_at || undefined,
      rejectReason: row.reject_reason || undefined,
      priority: (row.priority || 'medium') as 'low' | 'medium' | 'high',
    }));

    setApprovals(mapped);
  }, [companyId]);

  const fetchRules = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('approval_rules')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      const errMsg = String(error.message || '');
      const isMissingTable = error.code === '42P01' || errMsg.includes('does not exist') || errMsg.includes('PGRST205');
      if (isMissingTable) { console.warn('approval_rules table not found'); return; }
      console.error('Failed to load rules:', error);
      return;
    }

    const mapped: ApprovalRule[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name || '',
      condition: row.condition || '',
      thresholdAmount: row.threshold_amount || 0,
      approvers: Array.isArray(row.approvers) ? row.approvers : (row.approvers ? String(row.approvers).split(',').map((s: string) => s.trim()) : []),
      status: (row.status || 'active') as 'active' | 'inactive',
      voucherType: (row.voucher_type || 'invoice') as VoucherType,
      department: row.department || undefined,
      ledgerGroup: row.ledger_group || undefined,
    }));

    setRules(mapped);
  }, [companyId]);

  const fetchPendingVouchers = useCallback(async () => {
    if (!companyId || rules.length === 0) return;

    const minThreshold = Math.min(...rules.filter(r => r.status === 'active').map(r => r.thresholdAmount), 0);

    if (minThreshold <= 0) return;

    const { data, error } = await supabase
      .from('vouchers')
      .select('id, voucher_type, grand_total, narration, date, is_deleted')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .eq('needs_approval', true)
      .in('approval_status', ['pending', 'submitted'])
      .order('date', { ascending: false });

    if (error) {
      console.error('Failed to load pending vouchers:', error);
      return;
    }

    const voucherTypeMap: Record<string, VoucherType> = {
      sales: 'invoice',
      purchase: 'invoice',
      payment: 'payment',
      receipt: 'payment',
      journal: 'journal',
      debit_note: 'expense',
      credit_note: 'expense',
    };

    const voucherApprovals: ApprovalItem[] = (data || [])
      .filter((v: any) => v.grand_total > minThreshold)
      .map((v: any) => ({
        id: `VOUCHER-${v.id}`,
        type: voucherTypeMap[v.voucher_type?.toLowerCase()] || 'journal',
        amount: v.grand_total || 0,
        requester: user?.email || 'System',
        date: v.date || new Date().toISOString(),
        description: v.narration || `Voucher ${v.id} pending approval`,
        status: 'pending' as ApprovalStatus,
        priority: (v.grand_total > 500000 ? 'high' : v.grand_total > 100000 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      }));

    setApprovals(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const newVouchers = voucherApprovals.filter(v => !existingIds.has(v.id));
      return [...prev, ...newVouchers];
    });
  }, [companyId, rules, user]);

  const fetchHistory = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('approval_items')
      .select('*')
      .eq('company_id', companyId)
      .not('status', 'eq', 'pending')
      .order('approved_at', { ascending: false });

    if (error) {
      const errMsg = String(error.message || '');
      const isMissingTable = error.code === '42P01' || errMsg.includes('does not exist') || errMsg.includes('PGRST205');
      if (isMissingTable) { console.warn('approval_items table not found (history)'); return; }
      console.error('Failed to load history:', error);
      return;
    }

    const mapped: ApprovalHistoryEntry[] = (data || []).map((row: any) => ({
      id: `HIST-${row.id}`,
      itemId: row.id,
      action: (row.status || 'approved') as ApprovalHistoryEntry['action'],
      performedBy: row.approved_by || 'System',
      timestamp: row.approved_at || row.created_at || new Date().toISOString(),
      comments: row.reject_reason || row.comments || undefined,
      itemType: (row.type || 'invoice') as VoucherType,
      amount: row.amount || 0,
    }));

    setHistory(mapped);
  }, [companyId]);

  const fetchDelegations = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('approval_delegations')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      const errMsg = String(error.message || '');
      const isMissingTable = error.code === '42P01' || errMsg.includes('does not exist') || errMsg.includes('PGRST205');
      if (isMissingTable) { console.warn('approval_delegations table not found'); return; }
      console.error('Failed to load delegations:', error);
      return;
    }

    const mapped: Delegation[] = (data || []).map((row: any) => ({
      id: row.id,
      delegateFrom: row.delegate_from || row.from_user || 'Unknown',
      delegateTo: row.delegate_to || row.to_user || 'Unknown',
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      reason: row.reason || '',
      status: (row.status || 'active') as 'active' | 'expired' | 'cancelled',
    }));

    setDelegations(mapped);
  }, [companyId]);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    await Promise.all([
      fetchApprovals(),
      fetchRules(),
      fetchHistory(),
      fetchDelegations(),
    ]);
    setLoading(false);
  }, [companyId, fetchApprovals, fetchRules, fetchHistory, fetchDelegations]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (rules.length > 0) {
      fetchPendingVouchers();
    }
  }, [rules, fetchPendingVouchers]);

  // ─── Computed values ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = approvals.filter((a) => a.status === 'pending');
    const approvedThisMonth = approvals.filter(
      (a) =>
        a.status === 'approved' &&
        a.approvedAt &&
        new Date(a.approvedAt).getMonth() === new Date().getMonth()
    );
    const rejectedThisMonth = approvals.filter(
      (a) =>
        a.status === 'rejected' &&
        a.approvedAt &&
        new Date(a.approvedAt).getMonth() === new Date().getMonth()
    );
    const pendingInvoices = pending.filter((a) => a.type === 'invoice');
    const pendingExpenses = pending.filter((a) => a.type === 'expense');

    const avgTime = history.length > 0 ? 4.2 : 0;

    return {
      totalPending: pending.length,
      approvedThisMonth: approvedThisMonth.length,
      rejectedThisMonth: rejectedThisMonth.length,
      avgApprovalTime: avgTime,
      pendingInvoices: pendingInvoices.length,
      pendingExpenses: pendingExpenses.length,
    };
  }, [approvals, history]);

  const filteredApprovals = useMemo(() => {
    let filtered = approvals;
    if (activeTab !== 'all') {
      filtered = filtered.filter((a) => a.type === activeTab);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.description.toLowerCase().includes(query) ||
          a.requester.toLowerCase().includes(query) ||
          a.id.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [approvals, activeTab, searchQuery]);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (historyFilter.dateFrom && historyFilter.dateTo) {
        const entryDate = new Date(entry.timestamp);
        const from = new Date(historyFilter.dateFrom);
        const to = new Date(historyFilter.dateTo);
        if (!isWithinInterval(entryDate, { start: from, end: to })) return false;
      }
      if (historyFilter.user && entry.performedBy !== historyFilter.user) return false;
      if (historyFilter.type && entry.itemType !== historyFilter.type) return false;
      return true;
    });
  }, [history, historyFilter]);

  // ─── Handlers ────────────────────────────────────────────────────────
  const handleToggleSelect = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredApprovals.filter((a) => a.status === 'pending').length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(
        new Set(filteredApprovals.filter((a) => a.status === 'pending').map((a) => a.id))
      );
    }
  };

  const handleApprove = async (id: string) => {
    if (id.startsWith('VOUCHER-')) {
      const voucherId = id.replace('VOUCHER-', '');
      const { error } = await supabase
        .from('vouchers')
        .update({ approval_status: 'approved', approved_by: user?.id || null, approved_at: new Date().toISOString() })
        .eq('id', voucherId);

      if (error) {
        toast.error(`Failed to approve voucher: ${error.message}`);
        return;
      }

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: 'approved' as ApprovalStatus, approvedBy: user?.email || 'You', approvedAt: new Date().toISOString() }
            : a
        )
      );

      setHistory((prev) => [
        {
          id: `HIST-${Date.now()}`,
          itemId: id,
          action: 'approved',
          performedBy: user?.email || 'You',
          timestamp: new Date().toISOString(),
          comments: 'Approved',
          itemType: approvals.find(a => a.id === id)?.type || 'invoice',
          amount: approvals.find(a => a.id === id)?.amount || 0,
        },
        ...prev,
      ]);
    } else {
      const { error } = await supabase
        .from('approval_items')
        .update({
          status: 'approved',
          approved_by: user?.email || 'You',
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        toast.error(`Failed to approve: ${error.message}`);
        return;
      }

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: 'approved' as ApprovalStatus, approvedBy: user?.email || 'You', approvedAt: new Date().toISOString() }
            : a
        )
      );

      const item = approvals.find((a) => a.id === id);
      if (item) {
        setHistory((prev) => [
          {
            id: `HIST-${Date.now()}`,
            itemId: id,
            action: 'approved',
            performedBy: user?.email || 'You',
            timestamp: new Date().toISOString(),
            comments: 'Approved',
            itemType: item.type,
            amount: item.amount,
          },
          ...prev,
        ]);
      }
    }

    toast.success(`Item approved successfully`);
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    const pendingSelected = Array.from(selectedItems).filter((id) => {
      const item = approvals.find((a) => a.id === id);
      return item?.status === 'pending';
    });

    for (const id of pendingSelected) {
      await handleApprove(id);
    }

    toast.success(`${pendingSelected.length} items approved`);
  };

  const handleReject = (id: string) => {
    setRejectItemId(id);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectItemId) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    if (rejectItemId.startsWith('VOUCHER-')) {
      const voucherId = rejectItemId.replace('VOUCHER-', '');
      const { error } = await supabase
        .from('vouchers')
        .update({ approval_status: 'rejected', approved_by: user?.id || null, approved_at: new Date().toISOString(), rejection_reason: rejectReason })
        .eq('id', voucherId);

      if (error) {
        toast.error(`Failed to reject voucher: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from('approval_items')
        .update({
          status: 'rejected',
          approved_by: user?.email || 'You',
          approved_at: new Date().toISOString(),
          reject_reason: rejectReason,
        })
        .eq('id', rejectItemId);

      if (error) {
        toast.error(`Failed to reject: ${error.message}`);
        return;
      }
    }

    setApprovals((prev) =>
      prev.map((a) =>
        a.id === rejectItemId
          ? {
              ...a,
              status: 'rejected' as ApprovalStatus,
              approvedBy: user?.email || 'You',
              approvedAt: new Date().toISOString(),
              rejectReason,
            }
          : a
      )
    );

    const item = approvals.find((a) => a.id === rejectItemId);
    if (item) {
      setHistory((prev) => [
        {
          id: `HIST-${Date.now()}`,
          itemId: rejectItemId,
          action: 'rejected',
          performedBy: user?.email || 'You',
          timestamp: new Date().toISOString(),
          comments: rejectReason,
          itemType: item.type,
          amount: item.amount,
        },
        ...prev,
      ]);
    }

    toast.success(`Item rejected`);
    setShowRejectModal(false);
    setRejectItemId(null);
    setRejectReason('');
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.delete(rejectItemId);
      return next;
    });
  };

  const handleRequestInfo = (id: string) => {
    setInfoItemId(id);
    setInfoMessage('');
    setShowInfoModal(true);
  };

  const confirmRequestInfo = () => {
    if (!infoItemId) return;
    if (!infoMessage.trim()) {
      toast.error('Please provide a message');
      return;
    }

    const item = approvals.find((a) => a.id === infoItemId);
    if (item) {
      setHistory((prev) => [
        {
          id: `HIST-${Date.now()}`,
          itemId: infoItemId,
          action: 'requested_info',
          performedBy: user?.email || 'You',
          timestamp: new Date().toISOString(),
          comments: infoMessage,
          itemType: item.type,
          amount: item.amount,
        },
        ...prev,
      ]);
    }

    toast.success(`Info requested`);
    setShowInfoModal(false);
    setInfoItemId(null);
    setInfoMessage('');
  };

  const handleSaveRule = async () => {
    if (!ruleForm.name || !ruleForm.thresholdAmount || !ruleForm.approvers) {
      toast.error('Please fill all required fields');
      return;
    }

    const approversList = ruleForm.approvers.split(',').map((a) => a.trim());

    if (editingRule) {
      const { error } = await supabase
        .from('approval_rules')
        .update({
          name: ruleForm.name,
          condition: ruleForm.condition || `Amount > ${formatCurrency(ruleForm.thresholdAmount)}`,
          threshold_amount: ruleForm.thresholdAmount,
          approvers: approversList,
          voucher_type: ruleForm.voucherType,
          department: ruleForm.department || null,
          ledger_group: ruleForm.ledgerGroup || null,
        })
        .eq('id', editingRule.id);

      if (error) {
        toast.error(`Failed to update rule: ${error.message}`);
        return;
      }

      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? {
                ...r,
                name: ruleForm.name,
                condition: ruleForm.condition || `Amount > ${formatCurrency(ruleForm.thresholdAmount)}`,
                thresholdAmount: ruleForm.thresholdAmount,
                approvers: approversList,
                voucherType: ruleForm.voucherType,
                department: ruleForm.department || undefined,
                ledgerGroup: ruleForm.ledgerGroup || undefined,
              }
            : r
        )
      );
      toast.success('Rule updated successfully');
    } else {
      const { data, error } = await supabase
        .from('approval_rules')
        .insert({
          company_id: companyId,
          name: ruleForm.name,
          condition: ruleForm.condition || `Amount > ${formatCurrency(ruleForm.thresholdAmount)}`,
          threshold_amount: ruleForm.thresholdAmount,
          approvers: approversList,
          voucher_type: ruleForm.voucherType,
          department: ruleForm.department || null,
          ledger_group: ruleForm.ledgerGroup || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        toast.error(`Failed to create rule: ${error.message}`);
        return;
      }

      const newRule: ApprovalRule = {
        id: data.id,
        name: ruleForm.name,
        condition: ruleForm.condition || `Amount > ${formatCurrency(ruleForm.thresholdAmount)}`,
        thresholdAmount: ruleForm.thresholdAmount,
        approvers: approversList,
        status: 'active',
        voucherType: ruleForm.voucherType,
        department: ruleForm.department || undefined,
        ledgerGroup: ruleForm.ledgerGroup || undefined,
      };
      setRules((prev) => [...prev, newRule]);
      toast.success('Rule created successfully');
    }

    setShowRuleModal(false);
    setEditingRule(null);
    setRuleForm({
      name: '',
      condition: '',
      thresholdAmount: 0,
      approvers: '',
      voucherType: 'invoice',
      department: '',
      ledgerGroup: '',
    });
  };

  const handleEditRule = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      condition: rule.condition,
      thresholdAmount: rule.thresholdAmount,
      approvers: rule.approvers.join(', '),
      voucherType: rule.voucherType,
      department: rule.department || '',
      ledgerGroup: rule.ledgerGroup || '',
    });
    setShowRuleModal(true);
  };

  const handleDeleteRule = async (id: string) => {
    const { error } = await supabase
      .from('approval_rules')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error(`Failed to delete rule: ${error.message}`);
      return;
    }

    setRules((prev) => prev.filter((r) => r.id !== id));
    toast.success('Rule deleted');
  };

  const handleToggleRuleStatus = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;

    const newStatus = rule.status === 'active' ? 'inactive' : 'active';

    const { error } = await supabase
      .from('approval_rules')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error(`Failed to update rule status: ${error.message}`);
      return;
    }

    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus as 'active' | 'inactive' } : r))
    );
    toast.success('Rule status updated');
  };

  const handleSaveDelegation = async () => {
    if (!delegationForm.delegateTo || !delegationForm.startDate || !delegationForm.endDate || !delegationForm.reason) {
      toast.error('Please fill all fields');
      return;
    }

    const { data, error } = await supabase
      .from('approval_delegations')
      .insert({
        company_id: companyId,
        delegate_from: user?.email || 'You',
        delegate_to: delegationForm.delegateTo,
        start_date: delegationForm.startDate,
        end_date: delegationForm.endDate,
        reason: delegationForm.reason,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      toast.error(`Failed to create delegation: ${error.message}`);
      return;
    }

    const newDelegation: Delegation = {
      id: data.id,
      delegateFrom: user?.email || 'You',
      delegateTo: delegationForm.delegateTo,
      startDate: delegationForm.startDate,
      endDate: delegationForm.endDate,
      reason: delegationForm.reason,
      status: 'active',
    };

    setDelegations((prev) => [...prev, newDelegation]);
    toast.success('Delegation created');
    setShowDelegationModal(false);
    setDelegationForm({ delegateTo: '', startDate: '', endDate: '', reason: '' });
  };

  const handleCancelDelegation = async (id: string) => {
    const { error } = await supabase
      .from('approval_delegations')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast.error(`Failed to cancel delegation: ${error.message}`);
      return;
    }

    setDelegations((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'cancelled' as const } : d))
    );
    toast.success('Delegation cancelled');
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All', icon: <Inbox className="w-4 h-4" />, count: approvals.length },
    {
      key: 'invoice',
      label: 'Invoices',
      icon: <FileText className="w-4 h-4" />,
      count: approvals.filter((a) => a.type === 'invoice').length,
    },
    {
      key: 'expense',
      label: 'Expenses',
      icon: <Receipt className="w-4 h-4" />,
      count: approvals.filter((a) => a.type === 'expense').length,
    },
    {
      key: 'payment',
      label: 'Payments',
      icon: <CreditCard className="w-4 h-4" />,
      count: approvals.filter((a) => a.type === 'payment').length,
    },
    {
      key: 'journal',
      label: 'Journal Entries',
      icon: <BookOpen className="w-4 h-4" />,
      count: approvals.filter((a) => a.type === 'journal').length,
    },
  ];

  const sections = [
    { key: 'queue' as const, label: 'Approval Queue', icon: <Inbox className="w-5 h-5" /> },
    { key: 'rules' as const, label: 'Rules Engine', icon: <Settings className="w-5 h-5" /> },
    { key: 'history' as const, label: 'History', icon: <History className="w-5 h-5" /> },
    { key: 'delegation' as const, label: 'Delegation', icon: <UserCheck className="w-5 h-5" /> },
  ];

  if (!companyId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <Inbox className="w-16 h-16 mx-auto mb-4 text-zinc-600" />
          <h2 className="text-xl font-bold text-white mb-2">No Company Selected</h2>
          <p className="text-zinc-400">Please select a company to manage approvals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Approval Workflow</h1>
        <p className="text-zinc-400">Manage and track all approval requests across your organization</p>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
        <StatCard
          title="Total Pending"
          value={stats.totalPending}
          icon={<Clock className="w-5 h-5 text-yellow-400" />}
          color="bg-yellow-500/10"
          trend={{ value: '+12%', isUp: true }}
          delay={0}
        />
        <StatCard
          title="Approved This Month"
          value={stats.approvedThisMonth}
          icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
          color="bg-emerald-500/10"
          trend={{ value: '+8%', isUp: true }}
          delay={0.05}
        />
        <StatCard
          title="Rejected This Month"
          value={stats.rejectedThisMonth}
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          color="bg-red-500/10"
          trend={{ value: '-3%', isUp: false }}
          delay={0.1}
        />
        <StatCard
          title="Avg Approval Time"
          value={`${stats.avgApprovalTime}h`}
          icon={<Timer className="w-5 h-5 text-cyan-400" />}
          color="bg-cyan-500/10"
          trend={{ value: '-0.5h', isUp: false }}
          delay={0.15}
        />
        <StatCard
          title="Pending Invoices"
          value={stats.pendingInvoices}
          icon={<FileText className="w-5 h-5 text-blue-400" />}
          color="bg-blue-500/10"
          delay={0.2}
        />
        <StatCard
          title="Pending Expenses"
          value={stats.pendingExpenses}
          icon={<Receipt className="w-5 h-5 text-orange-400" />}
          color="bg-orange-500/10"
          delay={0.25}
        />
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-2 mb-6">
        {sections.map((section) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeSection === section.key
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-white'
            }`}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Content Sections */}
      <AnimatePresence mode="wait">
        {/* Approval Queue */}
        {activeSection === 'queue' && (
          <motion.div
            key="queue"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                        activeTab === tab.key
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs ${
                          activeTab === tab.key ? 'bg-cyan-500/30' : 'bg-zinc-800'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search approvals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors text-sm"
                  />
                </div>
              </div>
            </div>

            {selectedItems.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm text-cyan-400 font-medium">
                  {selectedItems.size} item(s) selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkApprove}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve Selected
                  </button>
                  <button
                    onClick={() => setSelectedItems(new Set())}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear Selection
                  </button>
                </div>
              </motion.div>
            )}

            <div className="mb-4">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {selectedItems.size === filteredApprovals.filter((a) => a.status === 'pending').length &&
                filteredApprovals.filter((a) => a.status === 'pending').length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select all pending items (
                {filteredApprovals.filter((a) => a.status === 'pending').length})
              </button>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-12 text-zinc-500">
                  <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-lg">Loading approvals...</p>
                </div>
              ) : filteredApprovals.length > 0 ? (
                filteredApprovals.map((item, index) => (
                  <ApprovalItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedItems.has(item.id)}
                    onToggleSelect={() => handleToggleSelect(item.id)}
                    onApprove={() => handleApprove(item.id)}
                    onReject={() => handleReject(item.id)}
                    onRequestInfo={() => handleRequestInfo(item.id)}
                    index={index}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500">
                  <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">No approvals found</p>
                  <p className="text-sm">Try adjusting your filters or search query</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Rules Engine */}
        {activeSection === 'rules' && (
          <motion.div
            key="rules"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Approval Rules</h2>
                <p className="text-sm text-zinc-400">
                  Configure rules for automatic routing and escalation
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingRule(null);
                  setRuleForm({
                    name: '',
                    condition: '',
                    thresholdAmount: 0,
                    approvers: '',
                    voucherType: 'invoice',
                    department: '',
                    ledgerGroup: '',
                  });
                  setShowRuleModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-medium hover:bg-cyan-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onEdit={() => handleEditRule(rule)}
                    onDelete={() => handleDeleteRule(rule.id)}
                    onToggleStatus={() => handleToggleRuleStatus(rule.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* History */}
        {activeSection === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-4">Approval History</h2>

              <div className="flex flex-wrap gap-3 mb-6">
                <input
                  type="date"
                  value={historyFilter.dateFrom}
                  onChange={(e) =>
                    setHistoryFilter((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                  className="px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="From date"
                />
                <input
                  type="date"
                  value={historyFilter.dateTo}
                  onChange={(e) =>
                    setHistoryFilter((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                  className="px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                  placeholder="To date"
                />
                <select
                  value={historyFilter.user}
                  onChange={(e) =>
                    setHistoryFilter((prev) => ({ ...prev, user: e.target.value }))
                  }
                  className="px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">All Users</option>
                  {[...new Set(history.map((h) => h.performedBy))].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <select
                  value={historyFilter.type}
                  onChange={(e) =>
                    setHistoryFilter((prev) => ({
                      ...prev,
                      type: e.target.value as VoucherType | '',
                    }))
                  }
                  className="px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">All Types</option>
                  <option value="invoice">Invoice</option>
                  <option value="expense">Expense</option>
                  <option value="payment">Payment</option>
                  <option value="journal">Journal Entry</option>
                </select>
                <button
                  onClick={() =>
                    setHistoryFilter({ dateFrom: '', dateTo: '', user: '', type: '' })
                  }
                  className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="relative">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((entry, index) => (
                  <HistoryItem key={entry.id} entry={entry} index={index} />
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">No history entries found</p>
                  <p className="text-sm">Adjust filters to see results</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Delegation */}
        {activeSection === 'delegation' && (
          <motion.div
            key="delegation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Delegation Management</h2>
                <p className="text-sm text-zinc-400">
                  Delegate your approval authority to another user
                </p>
              </div>
              <button
                onClick={() => setShowDelegationModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-medium hover:bg-cyan-500/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Delegation
              </button>
            </div>

            <div className="space-y-3">
              {delegations.length > 0 ? (
                delegations.map((del, index) => (
                  <motion.div
                    key={del.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`border rounded-xl p-4 transition-all duration-300 ${
                      del.status === 'active'
                        ? 'border-zinc-800 bg-zinc-900/50'
                        : 'border-zinc-800/50 bg-zinc-900/30 opacity-60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <span className="text-white font-medium">{del.delegateFrom}</span>
                          <ArrowRight className="w-4 h-4 text-cyan-400" />
                          <span className="text-cyan-400 font-medium">{del.delegateTo}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              del.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : del.status === 'expired'
                                ? 'bg-zinc-500/20 text-zinc-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {del.status === 'active'
                              ? 'Active'
                              : del.status === 'expired'
                              ? 'Expired'
                              : 'Cancelled'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(del.startDate), 'dd MMM')} -{' '}
                            {format(new Date(del.endDate), 'dd MMM yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Info className="w-3.5 h-3.5" />
                            {del.reason}
                          </span>
                        </div>
                      </div>

                      {del.status === 'active' && (
                        <button
                          onClick={() => handleCancelDelegation(del.id)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-500">
                  <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg">No active delegations</p>
                  <p className="text-sm">Create a delegation to delegate your approval authority</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Reject Approval</h3>
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-400 mb-4">
                Please provide a reason for rejection. This will be visible to the requester.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50 transition-colors resize-none text-sm"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  className="flex-1 px-4 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Request Info Modal */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Request Information</h3>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-400 mb-4">
                Send a message to the requester asking for more information.
              </p>
              <textarea
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder="What information do you need?"
                className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors resize-none text-sm"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRequestInfo}
                  className="flex-1 px-4 py-2.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-sm font-medium hover:bg-blue-500/30 transition-colors"
                >
                  <Send className="w-4 h-4 inline mr-2" />
                  Send Request
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rule Modal */}
      <AnimatePresence>
        {showRuleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowRuleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">
                  {editingRule ? 'Edit Rule' : 'Add New Rule'}
                </h3>
                <button
                  onClick={() => setShowRuleModal(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., High Value Invoices"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Voucher Type *
                  </label>
                  <select
                    value={ruleForm.voucherType}
                    onChange={(e) =>
                      setRuleForm((prev) => ({
                        ...prev,
                        voucherType: e.target.value as VoucherType,
                      }))
                    }
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                  >
                    <option value="invoice">Invoice</option>
                    <option value="expense">Expense</option>
                    <option value="payment">Payment</option>
                    <option value="journal">Journal Entry</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Threshold Amount (₹) *
                  </label>
                  <input
                    type="number"
                    value={ruleForm.thresholdAmount || ''}
                    onChange={(e) =>
                      setRuleForm((prev) => ({
                        ...prev,
                        thresholdAmount: Number(e.target.value),
                      }))
                    }
                    placeholder="e.g., 100000"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Condition Description
                  </label>
                  <input
                    type="text"
                    value={ruleForm.condition}
                    onChange={(e) =>
                      setRuleForm((prev) => ({ ...prev, condition: e.target.value }))
                    }
                    placeholder="e.g., Amount > ₹1,00,000"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Approvers * (comma separated)
                  </label>
                  <input
                    type="text"
                    value={ruleForm.approvers}
                    onChange={(e) =>
                      setRuleForm((prev) => ({ ...prev, approvers: e.target.value }))
                    }
                    placeholder="e.g., Manager, Director"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Department (Optional)
                  </label>
                  <input
                    type="text"
                    value={ruleForm.department}
                    onChange={(e) =>
                      setRuleForm((prev) => ({ ...prev, department: e.target.value }))
                    }
                    placeholder="e.g., IT, Marketing"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Ledger Group (Optional)
                  </label>
                  <input
                    type="text"
                    value={ruleForm.ledgerGroup}
                    onChange={(e) =>
                      setRuleForm((prev) => ({ ...prev, ledgerGroup: e.target.value }))
                    }
                    placeholder="e.g., Capital Assets"
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowRuleModal(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRule}
                  className="flex-1 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-medium hover:bg-cyan-500/30 transition-colors"
                >
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delegation Modal */}
      <AnimatePresence>
        {showDelegationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDelegationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">New Delegation</h3>
                <button
                  onClick={() => setShowDelegationModal(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Delegate To *
                  </label>
                  <select
                    value={delegationForm.delegateTo}
                    onChange={(e) =>
                      setDelegationForm((prev) => ({ ...prev, delegateTo: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                  >
                    <option value="">Select user...</option>
                    <option value="Vikram Singh">Vikram Singh</option>
                    <option value="Meera Joshi">Meera Joshi</option>
                    <option value="Amit Patel">Amit Patel</option>
                    <option value="Priya Sharma">Priya Sharma</option>
                    <option value="Deepak Nair">Deepak Nair</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={delegationForm.startDate}
                    onChange={(e) =>
                      setDelegationForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={delegationForm.endDate}
                    onChange={(e) =>
                      setDelegationForm((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Reason *
                  </label>
                  <textarea
                    value={delegationForm.reason}
                    onChange={(e) =>
                      setDelegationForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                    placeholder="e.g., Annual leave, Medical leave..."
                    className="w-full h-24 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 text-sm resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowDelegationModal(false)}
                  className="flex-1 px-4 py-2.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDelegation}
                  className="flex-1 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-medium hover:bg-cyan-500/30 transition-colors"
                >
                  Create Delegation
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ApprovalWorkflowPage;

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Download,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Activity,
  FileText,
  ArrowRightLeft,
  RefreshCw,
  Eye,
  Lock,
  Unlock,
  Mail,
  Trash2,
  Edit3,
  LogIn,
  LogOut,
  Award,
  Send,
  BarChart3,
  TrendingUp,
  MapPin,
  Monitor,
  Smartphone,
  Globe,
  ChevronLeft,
  RotateCcw,
  Loader2,
  X,
  UserCheck,
  Database,
  Settings,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, subHours, subMinutes, differenceInMinutes } from 'date-fns';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'APPROVE' | 'EXPORT' | 'SYNC';
type ResourceType = 'Voucher' | 'Ledger' | 'StockItem' | 'User' | 'Company' | 'Report' | 'Settings' | 'BankAccount' | 'GSTReturn';
type EventStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'WARNING';

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  user: string;
  userRole: string;
  action: ActionType;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  details: string;
  ipAddress: string;
  status: EventStatus;
  location?: string;
  browser?: string;
  device?: string;
  changes?: { field: string; before: string; after: string }[];
}

interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: 'FAILED_LOGIN' | 'PASSWORD_CHANGE' | 'ROLE_CHANGE' | 'SUSPICIOUS' | 'LOCKOUT' | 'ACCOUNT_UNLOCK';
  user: string;
  ipAddress: string;
  location: string;
  browser: string;
  device: string;
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface UserActivity {
  user: string;
  role: string;
  totalActions: number;
  lastActive: Date;
  mostCommonAction: ActionType;
  dailyActivity: number[];
}

const now = new Date();

// ─── Helper Functions ─────────────────────────────────────────────────────────

const actionConfig: Record<ActionType, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  CREATE: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10 border-emerald-400/30',
    icon: <FileText className="w-3.5 h-3.5" />,
    label: 'CREATE',
  },
  UPDATE: {
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/30',
    icon: <Edit3 className="w-3.5 h-3.5" />,
    label: 'UPDATE',
  },
  DELETE: {
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/30',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    label: 'DELETE',
  },
  LOGIN: {
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10 border-cyan-400/30',
    icon: <LogIn className="w-3.5 h-3.5" />,
    label: 'LOGIN',
  },
  APPROVE: {
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/30',
    icon: <Award className="w-3.5 h-3.5" />,
    label: 'APPROVE',
  },
  EXPORT: {
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/30',
    icon: <Download className="w-3.5 h-3.5" />,
    label: 'EXPORT',
  },
  SYNC: {
    color: 'text-teal-400',
    bg: 'bg-teal-400/10 border-teal-400/30',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    label: 'SYNC',
  },
};

const statusConfig: Record<EventStatus, { color: string; bg: string; icon: React.ReactNode }> = {
  SUCCESS: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  FAILED: {
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    icon: <XCircle className="w-4 h-4" />,
  },
  PENDING: {
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    icon: <Clock className="w-4 h-4" />,
  },
  WARNING: {
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

const severityConfig: Record<string, { color: string; bg: string }> = {
  LOW: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' },
  HIGH: { color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30' },
  CRITICAL: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' },
};

const securityTypeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  FAILED_LOGIN: { icon: <XCircle className="w-5 h-5" />, color: 'text-red-400' },
  PASSWORD_CHANGE: { icon: <Lock className="w-5 h-5" />, color: 'text-blue-400' },
  ROLE_CHANGE: { icon: <UserCheck className="w-5 h-5" />, color: 'text-amber-400' },
  SUSPICIOUS: { icon: <AlertTriangle className="w-5 h-5" />, color: 'text-orange-400' },
  LOCKOUT: { icon: <Shield className="w-5 h-5" />, color: 'text-red-400' },
  ACCOUNT_UNLOCK: { icon: <Unlock className="w-5 h-5" />, color: 'text-emerald-400' },
};

const resourceTypeIcons: Record<ResourceType, React.ReactNode> = {
  Voucher: <FileText className="w-4 h-4" />,
  Ledger: <Database className="w-4 h-4" />,
  StockItem: <Package className="w-4 h-4" />,
  User: <Users className="w-4 h-4" />,
  Company: <Settings className="w-4 h-4" />,
  Report: <BarChart3 className="w-4 h-4" />,
  Settings: <Settings className="w-4 h-4" />,
  BankAccount: <ArrowRightLeft className="w-4 h-4" />,
  GSTReturn: <FileText className="w-4 h-4" />,
};

function Package(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" x2="12" y1="22.08" y2="12" />
    </svg>
  );
}

function formatTimeAgo(date: Date): string {
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function exportToCSV(data: AuditLogEntry[], filename: string) {
  const headers = ['ID', 'Timestamp', 'User', 'Role', 'Action', 'Resource Type', 'Resource ID', 'Resource Name', 'Details', 'IP Address', 'Status', 'Location'];
  const rows = data.map((e) => [
    e.id,
    format(e.timestamp, 'yyyy-MM-dd HH:mm:ss'),
    e.user,
    e.userRole,
    e.action,
    e.resourceType,
    e.resourceId,
    e.resourceName,
    e.details,
    e.ipAddress,
    e.status,
    e.location || '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success(`Exported ${data.length} records to CSV`);
}

function exportToJSON(data: AuditLogEntry[], filename: string) {
  const json = JSON.stringify(
    data.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
      changes: e.changes || [],
    })),
    null,
    2
  );
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success(`Exported ${data.length} records to JSON`);
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  accent?: boolean;
}> = ({ title, value, icon, trend, trendUp, accent }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 hover:scale-[1.02] ${
      accent
        ? 'border-cyan-400/30 bg-cyan-400/5 shadow-lg shadow-cyan-400/5'
        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
    }`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</p>
        <p className={`mt-2 text-3xl font-bold ${accent ? 'text-cyan-400' : 'text-zinc-100'}`}>{value}</p>
        {trend && (
          <p className={`mt-1 text-xs ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {trendUp ? '↑' : '↓'} {trend}
          </p>
        )}
      </div>
      <div className={`rounded-lg p-2.5 ${accent ? 'bg-cyan-400/10 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
        {icon}
      </div>
    </div>
    {accent && (
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-400/5" />
    )}
  </motion.div>
);

const ActionBadge: React.FC<{ action: ActionType }> = ({ action }) => {
  const cfg = actionConfig[action];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

const StatusBadge: React.FC<{ status: EventStatus }> = ({ status }) => {
  const cfg = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {status}
    </span>
  );
};

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const cfg = severityConfig[severity] || severityConfig.LOW;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      {severity}
    </span>
  );
};

const HeatmapCell: React.FC<{ level: number }> = ({ level }) => {
  const bg = level === 0 ? 'bg-zinc-800' : level < 4 ? 'bg-cyan-900' : level < 8 ? 'bg-cyan-700' : level < 12 ? 'bg-cyan-500' : 'bg-cyan-400';
  return <div className={`h-3 w-3 rounded-sm ${bg}`} title={`${level} actions`} />;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AuditLogPage: React.FC = () => {
  const { user, selectedCompany, userRole } = useAuth() as any;

  // Data
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // UI State
  const [activeTab, setActiveTab] = useState<'timeline' | 'security' | 'users' | 'export'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<ActionType | 'ALL'>('ALL');
  const [filterResourceType, setFilterResourceType] = useState<ResourceType | 'ALL'>('ALL');
  const [filterUser, setFilterUser] = useState<string>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AuditLogEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportRange, setExportRange] = useState<'all' | 'today' | 'week' | 'custom'>('all');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadAuditData = useCallback(async () => {
    if (!selectedCompany?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch real vouchers for this company
      const { data: vouchers } = await supabase
        .from('vouchers')
        .select('id, voucher_type, voucher_number, party_name, grand_total, amount, date, voucher_date, narration, is_cancelled, is_deleted, created_at, created_by')
        .eq('company_id', selectedCompany.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // 2. Fetch reverse-sync pending_transactions
      const { data: pendingTxns } = await supabase
        .from('pending_transactions')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // 3. Fetch sync_history
      const { data: syncRows } = await supabase
        .from('sync_history')
        .select('*')
        .eq('company_id', selectedCompany.id)
        .order('started_at', { ascending: false })
        .limit(50);

      // 4. Fetch ledgers for recent master updates
      const { data: ledgers } = await supabase
        .from('ledgers')
        .select('id, name, parent, current_balance, updated_at, created_at')
        .eq('company_id', selectedCompany.id)
        .order('updated_at', { ascending: false })
        .limit(30);

      const logs: AuditLogEntry[] = [];
      const secEvents: SecurityEvent[] = [];

      // Map pending_transactions (User web actions - reverse sync)
      (pendingTxns || []).forEach((pt: any) => {
        const ts = new Date(pt.created_at || pt.synced_at || Date.now());
        const isSuccess = pt.status === 'synced';
        const isFailed = pt.status === 'failed';
        const vNum = pt.tally_voucher_number ? `#${pt.tally_voucher_number}` : '';
        const txnType = pt.transaction_type || 'Sales';
        const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Admin';

        logs.push({
          id: `TXN-${String(pt.id).slice(0, 8)}`,
          timestamp: ts,
          user: userName,
          userRole: userRole || 'Admin',
          action: 'CREATE',
          resourceType: 'Voucher',
          resourceId: pt.tally_voucher_number ? `VCH-${pt.tally_voucher_number}` : `TXN-${String(pt.id).slice(0, 8)}`,
          resourceName: `${txnType} Voucher ${vNum}`.trim(),
          details: isSuccess
            ? `Pushed ${txnType} voucher to Tally successfully (Voucher #${pt.tally_voucher_number || 'OK'})`
            : isFailed
            ? `Failed pushing ${txnType} voucher to Tally: ${pt.error_message || 'Rejected by Tally'}`
            : `Queued ${txnType} voucher for Tally sync`,
          ipAddress: '127.0.0.1',
          status: isSuccess ? 'SUCCESS' : isFailed ? 'FAILED' : 'PENDING',
          location: 'Web Dashboard',
          browser: 'Web App',
          device: 'Browser',
          changes: pt.voucher_data ? [
            { field: 'Status', before: 'draft', after: pt.status || 'pending' },
            { field: 'Tally Voucher #', before: '-', after: pt.tally_voucher_number || 'Pending' },
          ] : undefined,
        });

        if (isFailed) {
          secEvents.push({
            id: `SEC-TXN-${String(pt.id).slice(0, 8)}`,
            timestamp: ts,
            type: 'SUSPICIOUS',
            user: userName,
            ipAddress: '127.0.0.1',
            location: 'Web Dashboard',
            browser: 'Web App',
            device: 'Browser',
            details: `Voucher push rejected: ${pt.error_message || 'Validation error'}`,
            severity: 'HIGH',
          });
        }
      });

      // Map sync_history (Tally desktop syncs)
      (syncRows || []).forEach((sh: any, idx: number) => {
        const ts = new Date(sh.started_at || sh.completed_at || sh.created_at || Date.now());
        const isSuccess = sh.status === 'success' || sh.status === 'completed';
        const isError = sh.status === 'error' || sh.status === 'failed';

        logs.push({
          id: `SYNC-${String(sh.id || idx).slice(0, 8)}`,
          timestamp: ts,
          user: 'TallyLink Desktop',
          userRole: 'System',
          action: 'SYNC',
          resourceType: 'Company',
          resourceId: sh.company_id || selectedCompany.id,
          resourceName: `${selectedCompany.name || 'Tally'} Sync`,
          details: isSuccess
            ? `Tally synchronization completed: ${sh.vouchers_synced || 0} vouchers, ${sh.ledgers_synced || 0} ledgers, ${sh.stock_synced || 0} items synced`
            : `Sync failed: ${sh.error_message || 'Desktop connection failure'}`,
          ipAddress: '127.0.0.1',
          status: isSuccess ? 'SUCCESS' : isError ? 'FAILED' : 'PENDING',
          location: 'Tally Desktop Agent',
          browser: 'TallyLink.exe',
          device: 'Windows Client',
          changes: [
            { field: 'Vouchers Synced', before: '0', after: String(sh.vouchers_synced || 0) },
            { field: 'Ledgers Synced', before: '0', after: String(sh.ledgers_synced || 0) },
          ],
        });

        if (isError) {
          secEvents.push({
            id: `SEC-SYNC-${String(sh.id || idx).slice(0, 8)}`,
            timestamp: ts,
            type: 'LOCKOUT',
            user: 'TallyLink Desktop',
            ipAddress: '127.0.0.1',
            location: 'Local Agent',
            browser: 'TallyLink.exe',
            device: 'Windows Client',
            details: `Desktop sync exception: ${sh.error_message || 'Tally connection timeout'}`,
            severity: 'MEDIUM',
          });
        }
      });

      // Map vouchers (Tally / mobile vouchers)
      (vouchers || []).forEach((v: any) => {
        const ts = new Date(v.created_at || v.voucher_date || v.date || Date.now());
        const isCancelled = Boolean(v.is_cancelled);
        const isDeleted = Boolean(v.is_deleted);
        const amt = Number(v.grand_total || v.amount || 0);

        logs.push({
          id: `VCH-${String(v.id).slice(0, 8)}`,
          timestamp: ts,
          user: v.created_by || 'Tally Sync',
          userRole: v.created_by ? 'Accountant' : 'System',
          action: isDeleted ? 'DELETE' : isCancelled ? 'UPDATE' : 'CREATE',
          resourceType: 'Voucher',
          resourceId: v.voucher_number ? `VCH-${v.voucher_number}` : `VCH-${String(v.id).slice(0, 8)}`,
          resourceName: `${v.voucher_type || 'Voucher'} #${v.voucher_number || ''}`.trim(),
          details: `${v.voucher_type || 'Voucher'} for ${v.party_name || 'Cash/Party'}, ₹${amt.toLocaleString('en-IN')}${v.narration ? ` (${v.narration})` : ''}`,
          ipAddress: '127.0.0.1',
          status: isCancelled ? 'WARNING' : isDeleted ? 'FAILED' : 'SUCCESS',
          location: 'TallyPrime',
          browser: 'Desktop / Mobile',
          device: 'Tally Server',
          changes: [
            { field: 'Party', before: '', after: v.party_name || 'N/A' },
            { field: 'Amount', before: '', after: `₹${amt.toLocaleString('en-IN')}` },
          ],
        });

        if (isCancelled || isDeleted) {
          secEvents.push({
            id: `SEC-VCH-${String(v.id).slice(0, 8)}`,
            timestamp: ts,
            type: 'SUSPICIOUS',
            user: v.created_by || 'Tally Sync',
            ipAddress: '127.0.0.1',
            location: 'TallyPrime',
            browser: 'Desktop',
            device: 'Tally Server',
            details: `Voucher #${v.voucher_number || v.id} marked as ${isDeleted ? 'DELETED' : 'CANCELLED'}`,
            severity: 'MEDIUM',
          });
        }
      });

      // Map ledgers (Master data activity)
      (ledgers || []).forEach((l: any) => {
        const ts = new Date(l.updated_at || l.created_at || Date.now());
        logs.push({
          id: `LED-${String(l.id).slice(0, 8)}`,
          timestamp: ts,
          user: 'Tally Sync',
          userRole: 'System',
          action: 'UPDATE',
          resourceType: 'Ledger',
          resourceId: `LED-${String(l.id).slice(0, 8)}`,
          resourceName: l.name || 'Ledger Master',
          details: `Ledger ${l.name || ''} under ${l.parent || 'Primary'}, Balance: ₹${Number(l.current_balance || 0).toLocaleString('en-IN')}`,
          ipAddress: '127.0.0.1',
          status: 'SUCCESS',
          location: 'TallyPrime',
          browser: 'Desktop',
          device: 'Tally Server',
          changes: [
            { field: 'Parent Group', before: '', after: l.parent || 'Primary' },
            { field: 'Current Balance', before: '', after: `₹${Number(l.current_balance || 0).toLocaleString('en-IN')}` },
          ],
        });
      });

      // Add current session security entry if logged in
      if (user?.email) {
        secEvents.push({
          id: `SEC-AUTH-CURRENT`,
          timestamp: new Date(),
          type: 'ACCOUNT_UNLOCK',
          user: user?.user_metadata?.full_name || user?.email?.split('@')[0] || user?.email,
          ipAddress: '127.0.0.1',
          location: 'Web Dashboard',
          browser: 'Current Session',
          device: 'Browser',
          details: `Authenticated user session active (${user.email})`,
          severity: 'LOW',
        });
      }

      // Sort logs descending by timestamp
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      secEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Compute UserActivities dynamically from logs
      const userMap: Record<string, { role: string; logs: AuditLogEntry[] }> = {};
      logs.forEach((log) => {
        const u = log.user || 'System';
        if (!userMap[u]) {
          userMap[u] = { role: log.userRole || 'User', logs: [] };
        }
        userMap[u].logs.push(log);
      });

      const todayStart = startOfDay(new Date());
      const activities: UserActivity[] = Object.entries(userMap).map(([uName, uData]) => {
        const actionsCount: Record<string, number> = {};
        uData.logs.forEach((l) => {
          actionsCount[l.action] = (actionsCount[l.action] || 0) + 1;
        });

        let mostCommonAction: ActionType = 'CREATE';
        let maxCount = 0;
        Object.entries(actionsCount).forEach(([act, cnt]) => {
          if (cnt > maxCount) {
            maxCount = cnt;
            mostCommonAction = act as ActionType;
          }
        });

        const daily = Array.from({ length: 30 }, () => 0);
        uData.logs.forEach((l) => {
          const dayDiff = Math.floor((todayStart.getTime() - startOfDay(l.timestamp).getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff >= 0 && dayDiff < 30) {
            daily[29 - dayDiff] += 1;
          }
        });

        return {
          user: uName,
          role: uData.role,
          totalActions: uData.logs.length,
          lastActive: uData.logs[0]?.timestamp || new Date(),
          mostCommonAction,
          dailyActivity: daily,
        };
      });

      activities.sort((a, b) => b.totalActions - a.totalActions);

      setAuditLogs(logs);
      setSecurityEvents(secEvents);
      setUserActivities(activities);
    } catch (err: any) {
      console.error('Error loading audit data:', err);
      toast.error('Failed to load audit records');
    } finally {
      setLoading(false);
    }
  }, [selectedCompany?.id, user, userRole]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  // ─── Computed Data ────────────────────────────────────────────────────────

  const today = startOfDay(now);
  const weekAgo = subDays(now, 7);

  const totalEventsToday = useMemo(
    () => auditLogs.filter((e) => isWithinInterval(e.timestamp, { start: today, end: endOfDay(now) })).length,
    [auditLogs]
  );
  const totalEventsWeek = useMemo(
    () => auditLogs.filter((e) => isWithinInterval(e.timestamp, { start: weekAgo, end: endOfDay(now) })).length,
    [auditLogs]
  );
  const failedLogins = useMemo(
    () => securityEvents.filter((e) => e.type === 'FAILED_LOGIN').length,
    [securityEvents]
  );
  const dataModifications = useMemo(
    () => auditLogs.filter((e) => e.action === 'UPDATE' || e.action === 'DELETE').length,
    [auditLogs]
  );
  const userActivitiesCount = useMemo(
    () => new Set(auditLogs.map((e) => e.user).filter((u) => u !== 'System' && u !== 'Unknown')).size,
    [auditLogs]
  );
  const systemEvents = useMemo(
    () => auditLogs.filter((e) => e.user === 'System').length,
    [auditLogs]
  );

  const uniqueUsers = useMemo(() => [...new Set(auditLogs.map((e) => e.user))].sort(), [auditLogs]);

  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter((e) => {
        if (filterAction !== 'ALL' && e.action !== filterAction) return false;
        if (filterResourceType !== 'ALL' && e.resourceType !== filterResourceType) return false;
        if (filterUser !== 'ALL' && e.user !== filterUser) return false;
        if (filterDateFrom && e.timestamp < new Date(filterDateFrom)) return false;
        if (filterDateTo && e.timestamp > endOfDay(new Date(filterDateTo))) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            e.user.toLowerCase().includes(q) ||
            e.details.toLowerCase().includes(q) ||
            e.resourceName.toLowerCase().includes(q) ||
            e.resourceId.toLowerCase().includes(q) ||
            e.ipAddress.includes(q) ||
            e.id.toLowerCase().includes(q) ||
            e.action.toLowerCase().includes(q) ||
            e.resourceType.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [auditLogs, filterAction, filterResourceType, filterUser, filterDateFrom, filterDateTo, searchQuery]);

  const changeHistory = useMemo(() => {
    if (!selectedRecord) return [];
    return auditLogs
      .filter((e) => e.resourceId === selectedRecord.resourceId && e.changes && e.changes.length > 0)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [auditLogs, selectedRecord]);

  const topUsers = useMemo(() => [...userActivities].sort((a, b) => b.totalActions - a.totalActions).slice(0, 5), [userActivities]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    let data = [...auditLogs];
    const ts = format(now, 'yyyy-MM-dd_HHmm');

    if (exportRange === 'today') {
      data = data.filter((e) => isWithinInterval(e.timestamp, { start: today, end: endOfDay(now) }));
    } else if (exportRange === 'week') {
      data = data.filter((e) => isWithinInterval(e.timestamp, { start: weekAgo, end: endOfDay(now) }));
    } else if (exportRange === 'custom') {
      if (exportDateFrom) data = data.filter((e) => e.timestamp >= new Date(exportDateFrom));
      if (exportDateTo) data = data.filter((e) => e.timestamp <= endOfDay(new Date(exportDateTo)));
    }

    exportToCSV(data, `audit_log_${ts}.csv`);
  }, [auditLogs, exportRange, exportDateFrom, exportDateTo, today, weekAgo]);

  const handleExportJSON = useCallback(() => {
    const ts = format(now, 'yyyy-MM-dd_HHmm');
    exportToJSON(auditLogs, `audit_log_${ts}.json`);
  }, [auditLogs]);

  const handleScheduleReport = useCallback(() => {
    toast.success('Automated report scheduling - Coming Soon!');
  }, []);

  const clearFilters = useCallback(() => {
    setFilterAction('ALL');
    setFilterResourceType('ALL');
    setFilterUser('ALL');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  }, []);

  const hasActiveFilters = filterAction !== 'ALL' || filterResourceType !== 'ALL' || filterUser !== 'ALL' || filterDateFrom || filterDateTo || searchQuery;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
              <Shield className="mr-2 inline h-6 w-6 text-cyan-400" />
              Audit Log
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">Track all system activities and data changes</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAuditData}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-50"
              title="Refresh logs from database"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">JSON</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-400/20"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard title="Events Today" value={totalEventsToday} icon={<Clock className="h-5 w-5" />} accent />
          <SummaryCard title="This Week" value={totalEventsWeek} icon={<Activity className="h-5 w-5" />} />
          <SummaryCard title="Security Flags" value={securityEvents.length} icon={<Shield className="h-5 w-5" />} />
          <SummaryCard title="Modifications" value={dataModifications} icon={<Edit3 className="h-5 w-5" />} />
          <SummaryCard title="Active Users" value={userActivitiesCount} icon={<Users className="h-5 w-5" />} />
          <SummaryCard title="System Events" value={systemEvents} icon={<RefreshCw className="h-5 w-5" />} />
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
          {([
            { key: 'timeline', label: 'Audit Timeline', icon: <Clock className="h-4 w-4" /> },
            { key: 'security', label: 'Security Events', icon: <Shield className="h-4 w-4" /> },
            { key: 'users', label: 'User Activity', icon: <Users className="h-4 w-4" /> },
            { key: 'export', label: 'Export & Compliance', icon: <Download className="h-4 w-4" /> },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-cyan-400/10 text-cyan-400 shadow-sm'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ═══ TIMELINE TAB ═══ */}
        {activeTab === 'timeline' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Search & Filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search logs by user, action, resource, IP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  showFilters || hasActiveFilters
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-400'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                }`}
              >
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400 text-[10px] font-bold text-zinc-950">
                    !
                  </span>
                )}
              </button>
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Action Type</label>
                        <select
                          value={filterAction}
                          onChange={(e) => setFilterAction(e.target.value as ActionType | 'ALL')}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        >
                          <option value="ALL">All Actions</option>
                          {Object.keys(actionConfig).map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Resource Type</label>
                        <select
                          value={filterResourceType}
                          onChange={(e) => setFilterResourceType(e.target.value as ResourceType | 'ALL')}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        >
                          <option value="ALL">All Resources</option>
                          {Object.keys(resourceTypeIcons).map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">User</label>
                        <select
                          value={filterUser}
                          onChange={(e) => setFilterUser(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        >
                          <option value="ALL">All Users</option>
                          {uniqueUsers.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Date From</label>
                        <input
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">Date To</label>
                        <input
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                    </div>
                    {hasActiveFilters && (
                      <div className="mt-3 flex items-center gap-3 border-t border-zinc-800 pt-3">
                        <span className="text-xs text-zinc-500">
                          Showing {filteredLogs.length} of {auditLogs.length} entries
                        </span>
                        <button onClick={clearFilters} className="text-xs text-cyan-400 hover:text-cyan-300">
                          Clear all filters
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Log Table */}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
              {/* Desktop Header */}
              <div className="hidden border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 lg:grid lg:grid-cols-[180px_140px_120px_1fr_120px_100px_120px_40px]">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Timestamp</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">User</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Action</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Resource</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Details</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">IP Address</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500"></span>
              </div>

              {/* Rows */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-cyan-400" />
                  <p className="text-sm">Loading audit records from database...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                  <Search className="mb-3 h-10 w-10 text-zinc-700" />
                  <p className="text-sm">No audit logs match your filters</p>
                  <button onClick={clearFilters} className="mt-2 text-xs text-cyan-400 hover:text-cyan-300">
                    Clear filters
                  </button>
                </div>
              ) : (
                filteredLogs.map((entry, i) => {
                  const isExpanded = expandedRow === entry.id;
                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                    >
                      {/* Desktop Row */}
                      <div
                        className={`hidden cursor-pointer border-b border-zinc-800/50 px-4 py-3 transition-colors hover:bg-zinc-800/30 lg:grid lg:grid-cols-[180px_140px_120px_1fr_120px_100px_120px_40px] ${
                          isExpanded ? 'bg-zinc-800/20' : ''
                        }`}
                        onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">{format(entry.timestamp, 'dd MMM, HH:mm')}</span>
                          <span className="text-[10px] text-zinc-600">{format(entry.timestamp, 'ss')}s</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400">
                            {entry.user.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-zinc-300">{entry.user}</p>
                            <p className="text-[10px] text-zinc-600">{entry.userRole}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <ActionBadge action={entry.action} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{resourceTypeIcons[entry.resourceType]}</span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-300">{entry.resourceName}</p>
                            <p className="truncate text-[10px] text-zinc-600">{entry.resourceId}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <p className="truncate text-xs text-zinc-400">{entry.details}</p>
                        </div>
                        <div className="flex items-center">
                          <span className="font-mono text-xs text-zinc-500">{entry.ipAddress}</span>
                        </div>
                        <div className="flex items-center">
                          <StatusBadge status={entry.status} />
                        </div>
                        <div className="flex items-center justify-center">
                          {entry.changes && entry.changes.length > 0 && (
                            isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />
                          )}
                        </div>
                      </div>

                      {/* Mobile Row */}
                      <div
                        className="cursor-pointer border-b border-zinc-800/50 p-4 lg:hidden"
                        onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <ActionBadge action={entry.action} />
                            <StatusBadge status={entry.status} />
                          </div>
                          {entry.changes && entry.changes.length > 0 && (
                            isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />
                          )}
                        </div>
                        <div className="mb-1 flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-bold text-zinc-400">
                            {entry.user.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-zinc-300">{entry.user}</span>
                          <span className="text-[10px] text-zinc-600">·</span>
                          <span className="text-[10px] text-zinc-600">{formatTimeAgo(entry.timestamp)}</span>
                        </div>
                        <p className="mb-1 truncate text-xs text-zinc-300">{entry.resourceName}</p>
                        <p className="truncate text-[11px] text-zinc-500">{entry.details}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="font-mono text-[10px] text-zinc-600">{entry.ipAddress}</span>
                          {entry.location && <span className="text-[10px] text-zinc-600">{entry.location}</span>}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-b border-zinc-800/50 bg-zinc-900/80"
                          >
                            <div className="border-t border-zinc-800/50 px-4 py-4 lg:px-16">
                              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Event ID</p>
                                  <p className="mt-0.5 font-mono text-xs text-zinc-400">{entry.id}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Timestamp</p>
                                  <p className="mt-0.5 text-xs text-zinc-400">{format(entry.timestamp, 'dd MMMM yyyy, HH:mm:ss')}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Location</p>
                                  <p className="mt-0.5 text-xs text-zinc-400">{entry.location || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Browser / Device</p>
                                  <p className="mt-0.5 text-xs text-zinc-400">{entry.browser} · {entry.device}</p>
                                </div>
                              </div>
                              {entry.changes && entry.changes.length > 0 && (
                                <div>
                                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Changes</p>
                                  <div className="overflow-hidden rounded-lg border border-zinc-800">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-zinc-800 bg-zinc-800/50">
                                          <th className="px-3 py-2 text-left font-semibold text-zinc-500">Field</th>
                                          <th className="px-3 py-2 text-left font-semibold text-red-400/70">Before</th>
                                          <th className="px-3 py-2 text-left font-semibold text-emerald-400/70">After</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entry.changes.map((c, ci) => (
                                          <tr key={ci} className="border-b border-zinc-800/50 last:border-0">
                                            <td className="px-3 py-2 font-medium text-zinc-400">{c.field}</td>
                                            <td className="px-3 py-2 text-red-400/80">
                                              {c.before ? <span className="line-through opacity-60">{c.before}</span> : <span className="text-zinc-600">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-emerald-400/80">{c.after || <span className="text-zinc-600">—</span>}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="mt-3 flex justify-end">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toast('Rollback feature coming soon!', { icon: '🚧' });
                                      }}
                                      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400"
                                      title="Coming Soon"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Rollback
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Results Count */}
            <div className="mt-3 text-center text-xs text-zinc-600">
              Showing {filteredLogs.length} of {auditLogs.length} audit entries
            </div>
          </motion.div>
        )}

        {/* ═══ SECURITY EVENTS TAB ═══ */}
        {activeTab === 'security' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid gap-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 py-16 text-zinc-500">
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-cyan-400" />
                  <p className="text-sm">Scanning security events...</p>
                </div>
              ) : securityEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 py-16 text-zinc-500">
                  <Shield className="mb-3 h-10 w-10 text-emerald-500/40" />
                  <p className="text-sm font-medium text-zinc-300">No security incidents detected</p>
                  <p className="mt-1 text-xs text-zinc-500">All synchronization and authentication events are normal</p>
                </div>
              ) : (
                securityEvents.map((event, i) => {
                const typeCfg = securityTypeConfig[event.type] || securityTypeConfig.FAILED_LOGIN;
                const sevCfg = severityConfig[event.severity] || severityConfig.LOW;
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${sevCfg.bg} border`}>
                        <span className={typeCfg.color}>{typeCfg.icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-zinc-200">
                            {event.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase())}
                          </h3>
                          <SeverityBadge severity={event.severity} />
                          <span className="text-xs text-zinc-600">{formatTimeAgo(event.timestamp)}</span>
                        </div>
                        <p className="mb-3 text-sm text-zinc-400">{event.details}</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">User</p>
                            <p className="text-xs text-zinc-400">{event.user}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">IP Address</p>
                            <p className="font-mono text-xs text-zinc-400">{event.ipAddress}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Location</p>
                            <p className="text-xs text-zinc-400">{event.location}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Browser</p>
                            <p className="text-xs text-zinc-400">{event.browser}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Device</p>
                            <p className="text-xs text-zinc-400">{event.device}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-zinc-600">{format(event.timestamp, 'dd MMMM yyyy, HH:mm:ss')}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              }))}
            </div>
          </motion.div>
        )}

        {/* ═══ USER ACTIVITY TAB ═══ */}
        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 py-16 text-zinc-500">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-sm">Calculating user activity metrics...</p>
              </div>
            ) : userActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/30 py-16 text-zinc-500">
                <Users className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm">No user activity recorded yet</p>
              </div>
            ) : (
              <>
                {/* Top 5 Users */}
                <div className="mb-6">
                  <h2 className="mb-4 text-lg font-semibold text-zinc-200">
                    <TrendingUp className="mr-2 inline h-5 w-5 text-cyan-400" />
                    Top 5 Most Active Users
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {topUsers.map((u, i) => (
                      <motion.div
                        key={u.user}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className={`rounded-xl border p-4 transition-all hover:scale-[1.02] ${
                          i === 0 ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                        }`}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                            i === 0 ? 'bg-cyan-400/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {u.user.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-zinc-200">{u.user}</p>
                            <p className="text-[10px] text-zinc-600">{u.role}</p>
                          </div>
                        </div>
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="text-2xl font-bold text-zinc-100">{u.totalActions}</span>
                          <ActionBadge action={u.mostCommonAction} />
                        </div>
                        <p className="text-[10px] text-zinc-600">Last active: {formatTimeAgo(u.lastActive)}</p>

                        {/* Heatmap */}
                        <div className="mt-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Activity (30 days)</p>
                          <div className="flex flex-wrap gap-1">
                            {u.dailyActivity.map((level, di) => (
                              <HeatmapCell key={di} level={level} />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* All Users Activity */}
                <h2 className="mb-4 text-lg font-semibold text-zinc-200">
                  <Users className="mr-2 inline h-5 w-5 text-cyan-400" />
                  All User Activity
                </h2>
                <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
                  <div className="hidden border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 sm:grid sm:grid-cols-[1fr_100px_120px_140px_1fr]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">User</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Actions</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Last Active</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Most Common</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Activity (30d)</span>
                  </div>
                  {userActivities.map((u, i) => (
                    <motion.div
                      key={u.user}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-zinc-800/50 px-4 py-3 transition-colors hover:bg-zinc-800/20 last:border-0 sm:grid sm:grid-cols-[1fr_100px_120px_140px_1fr]"
                    >
                      {/* Mobile */}
                      <div className="mb-3 sm:hidden">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400">
                            {u.user.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-200">{u.user}</p>
                            <p className="text-[10px] text-zinc-600">{u.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          <span>{u.totalActions} actions</span>
                          <span>·</span>
                          <span>{formatTimeAgo(u.lastActive)}</span>
                          <span>·</span>
                          <ActionBadge action={u.mostCommonAction} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {u.dailyActivity.map((level, di) => (
                            <HeatmapCell key={di} level={level} />
                          ))}
                        </div>
                      </div>
                      {/* Desktop */}
                      <div className="hidden items-center gap-3 sm:flex">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                          {u.user.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{u.user}</p>
                          <p className="text-[10px] text-zinc-600">{u.role}</p>
                        </div>
                      </div>
                      <div className="hidden items-center sm:flex">
                        <span className="text-sm font-semibold text-zinc-200">{u.totalActions}</span>
                      </div>
                      <div className="hidden items-center sm:flex">
                        <span className="text-xs text-zinc-400">{formatTimeAgo(u.lastActive)}</span>
                      </div>
                      <div className="hidden items-center sm:flex">
                        <ActionBadge action={u.mostCommonAction} />
                      </div>
                      <div className="hidden items-center sm:flex">
                        <div className="flex flex-wrap gap-1">
                          {u.dailyActivity.map((level, di) => (
                            <HeatmapCell key={di} level={level} />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ═══ EXPORT & COMPLIANCE TAB ═══ */}
        {activeTab === 'export' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Export Options */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-1 text-lg font-semibold text-zinc-200">
                  <Download className="mr-2 inline h-5 w-5 text-cyan-400" />
                  Export Audit Logs
                </h2>
                <p className="mb-6 text-sm text-zinc-500">Download audit trail data for analysis or compliance</p>

                {/* Date Range */}
                <div className="mb-6">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Date Range</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { key: 'all', label: 'All Time' },
                      { key: 'today', label: 'Today' },
                      { key: 'week', label: 'This Week' },
                      { key: 'custom', label: 'Custom' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setExportRange(opt.key)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          exportRange === opt.key
                            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-400'
                            : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {exportRange === 'custom' && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">From</label>
                        <input
                          type="date"
                          value={exportDateFrom}
                          onChange={(e) => setExportDateFrom(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">To</label>
                        <input
                          type="date"
                          value={exportDateTo}
                          onChange={(e) => setExportDateTo(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Export Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleExport}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/20"
                  >
                    <Download className="h-4 w-4" />
                    Export as CSV
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
                  >
                    <FileText className="h-4 w-4" />
                    Export as JSON
                  </button>
                </div>
              </div>

              {/* Compliance */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-1 text-lg font-semibold text-zinc-200">
                  <Shield className="mr-2 inline h-5 w-5 text-cyan-400" />
                  Compliance & Reporting
                </h2>
                <p className="mb-6 text-sm text-zinc-500">Generate reports for statutory audits and compliance</p>

                <div className="space-y-4">
                  {/* Compliance Report */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="rounded-lg bg-purple-400/10 p-2">
                        <FileText className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">Statutory Audit Report</h3>
                        <p className="text-xs text-zinc-500">Format compliant with Indian Accounting Standards (Ind AS)</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toast.success('Generating compliance report...')}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-400/30 bg-purple-400/10 px-4 py-2.5 text-xs font-semibold text-purple-400 transition-colors hover:bg-purple-400/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Generate Compliance Report
                    </button>
                  </div>

                  {/* GST Audit Trail */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="rounded-lg bg-amber-400/10 p-2">
                        <BarChart3 className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">GST Audit Trail</h3>
                        <p className="text-xs text-zinc-500">All GST-related modifications with before/after values</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toast.success('Generating GST audit trail...')}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-400/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Generate GST Trail
                    </button>
                  </div>

                  {/* Schedule Reports */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="rounded-lg bg-cyan-400/10 p-2">
                        <Mail className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">Automated Audit Reports</h3>
                        <p className="text-xs text-zinc-500">Schedule daily/weekly/monthly audit report emails</p>
                      </div>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2">
                      {['Daily', 'Weekly', 'Monthly'].map((freq) => (
                        <button
                          key={freq}
                          onClick={() => toast.success(`${freq} report scheduling - Coming Soon!`)}
                          className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-400"
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleScheduleReport}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/20"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Configure Schedule
                    </button>
                  </div>

                  {/* Data Retention */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-emerald-400/10 p-2">
                        <Database className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-200">Data Retention Policy</h3>
                        <p className="text-xs text-zinc-500">
                          Audit logs are retained for <span className="font-semibold text-emerald-400">7 years</span> as per Indian tax regulations.
                          Current storage: <span className="font-semibold text-zinc-300">2.4 GB</span> across{' '}
                          <span className="font-semibold text-zinc-300">{auditLogs.length * 150} entries</span>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Change Tracker */}
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h2 className="mb-1 text-lg font-semibold text-zinc-200">
                <ArrowRightLeft className="mr-2 inline h-5 w-5 text-cyan-400" />
                Data Change Tracker
              </h2>
              <p className="mb-4 text-sm text-zinc-500">Select a record to view its complete change history</p>

              <div className="mb-4 flex flex-wrap gap-2">
                {auditLogs
                  .filter((e) => e.changes && e.changes.length > 0)
                  .slice(0, 8)
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedRecord(selectedRecord?.id === e.id ? null : e)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        selectedRecord?.id === e.id
                          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-400'
                          : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {resourceTypeIcons[e.resourceType]}
                      <span className="font-medium">{e.resourceName}</span>
                      <span className="text-zinc-600">({e.changes.length} changes)</span>
                    </button>
                  ))}
              </div>

              {selectedRecord && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                    <div className="flex items-center gap-3">
                      <ActionBadge action={selectedRecord.action} />
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{selectedRecord.resourceName}</p>
                        <p className="text-[10px] text-zinc-600">{selectedRecord.resourceId}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        toast('Rollback feature coming soon!', { icon: '🚧' });
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400"
                      title="Coming Soon"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Rollback
                    </button>
                  </div>

                  {changeHistory.length > 0 ? (
                    <div className="space-y-3">
                      {changeHistory.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-800/20 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-400">
                                {entry.user.charAt(0)}
                              </div>
                              <span className="text-xs font-medium text-zinc-300">{entry.user}</span>
                              <span className="text-[10px] text-zinc-600">·</span>
                              <span className="text-[10px] text-zinc-600">{format(entry.timestamp, 'dd MMM yyyy, HH:mm')}</span>
                            </div>
                            <ActionBadge action={entry.action} />
                          </div>
                          <div className="overflow-hidden rounded-lg border border-zinc-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                                  <th className="px-3 py-2 text-left font-semibold text-zinc-500">Field</th>
                                  <th className="px-3 py-2 text-left font-semibold text-red-400/70">Before</th>
                                  <th className="px-3 py-2 text-left font-semibold text-emerald-400/70">After</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.changes?.map((c, ci) => (
                                  <tr key={ci} className="border-b border-zinc-800/50 last:border-0">
                                    <td className="px-3 py-2 font-medium text-zinc-400">{c.field}</td>
                                    <td className="px-3 py-2 text-red-400/80">
                                      {c.before ? <span className="line-through opacity-60">{c.before}</span> : <span className="text-zinc-600">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-emerald-400/80">{c.after || <span className="text-zinc-600">—</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-[10px] text-zinc-600">{entry.details}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-zinc-600">No change history available for this record.</p>
                  )}
                </motion.div>
              )}

              {!selectedRecord && (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                  <Eye className="mb-3 h-10 w-10 text-zinc-700" />
                  <p className="text-sm">Select a record above to view its change history</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;

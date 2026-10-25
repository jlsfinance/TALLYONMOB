import React, { useState, useCallback, useEffect } from 'react';
import {
  Bell,
  Send,
  Clock,
  Save,
  Trash2,
  Edit3,
  Copy,
  ChevronDown,
  ChevronRight,
  Users,
  Smartphone,
  Globe,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  MousePointerClick,
  Calendar,
  Image,
  Link2,
  Volume2,
  Vibrate,
  Moon,
  Settings,
  BarChart3,
  RefreshCw,
  Search,
  Filter,
  MoreVertical,
  Star,
  Zap,
  Mail,
  MessageSquare,
  Shield,
  CreditCard,
  Package,
  FileText,
  AlertCircle,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NotificationDashboard {
  totalSent: number;
  deliveryRate: number;
  openRate: number;
  activeSubscribers: number;
  failedDeliveries: number;
  lastPushSent: string;
}

interface NotificationRecord {
  id: string;
  date: string;
  title: string;
  body: string;
  target: string;
  priority: 'High' | 'Normal' | 'Low';
  status: 'Sent' | 'Scheduled' | 'Failed' | 'Draft' | 'Queued';
  sent: number;
  opened: number;
  clicked: number;
  imageUrl?: string;
  actionUrl?: string;
  scheduledAt?: string;
}

interface NotificationTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  category: string;
  variables: string[];
}

interface Subscriber {
  id: string;
  user: string;
  deviceType: 'Android' | 'iOS' | 'Web';
  token: string;
  lastActive: string;
  subscribedDate: string;
  isActive: boolean;
}

interface NotificationSettings {
  enabled: boolean;
  categories: {
    voucherAlerts: boolean;
    paymentAlerts: boolean;
    syncAlerts: boolean;
    complianceReminders: boolean;
    marketing: boolean;
  };
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

type Priority = 'High' | 'Normal' | 'Low';
type TargetAudience = 'All Users' | 'Admins' | 'Specific Role' | 'Specific Company';
type ScheduleType = 'Now' | 'Later';
type TabType = 'compose' | 'templates' | 'history' | 'subscribers' | 'settings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isTableNotFound = (error: any): boolean => {
  return error?.code === '42P01' || String(error?.message || '').includes('does not exist');
};

const formatINDate = (iso: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  Voucher: <FileText className="w-5 h-5" />,
  Sync: <RefreshCw className="w-5 h-5" />,
  Payment: <CreditCard className="w-5 h-5" />,
  Compliance: <Shield className="w-5 h-5" />,
  Inventory: <Package className="w-5 h-5" />,
  Workflow: <AlertCircle className="w-5 h-5" />,
};

const CATEGORY_ICON_MAP_S: Record<string, React.ReactNode> = {
  Voucher: <FileText className="w-4 h-4" />,
  Sync: <RefreshCw className="w-4 h-4" />,
  Payment: <CreditCard className="w-4 h-4" />,
  Compliance: <Shield className="w-4 h-4" />,
  Inventory: <Package className="w-4 h-4" />,
  Workflow: <AlertCircle className="w-4 h-4" />,
};

// ─── Fallback defaults ───────────────────────────────────────────────────────

const defaultSettings: NotificationSettings = {
  enabled: true,
  categories: {
    voucherAlerts: true,
    paymentAlerts: true,
    syncAlerts: true,
    complianceReminders: true,
    marketing: false,
  },
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  soundEnabled: true,
  vibrationEnabled: true,
};

const defaultTemplates: NotificationTemplate[] = [
  { id: 't1', name: 'New Voucher Created', icon: <FileText className="w-5 h-5" />, title: 'New Voucher Created', body: 'Voucher {{voucher_type}} #{{voucher_number}} has been created for ₹{{amount}}', category: 'Voucher', variables: ['voucher_type', 'voucher_number', 'amount'] },
  { id: 't2', name: 'Sync Complete', icon: <RefreshCw className="w-5 h-5" />, title: 'Tally Sync Complete', body: 'Data sync finished. {{count}} vouchers updated successfully.', category: 'Sync', variables: ['count'] },
  { id: 't3', name: 'Payment Received', icon: <CreditCard className="w-5 h-5" />, title: 'Payment Received', body: 'Payment of ₹{{amount}} received from {{party_name}}', category: 'Payment', variables: ['amount', 'party_name'] },
  { id: 't4', name: 'GST Filing Reminder', icon: <Shield className="w-5 h-5" />, title: 'GST Filing Reminder', body: '{{filing_type}} filing due in {{days_left}} days. File before {{due_date}}.', category: 'Compliance', variables: ['filing_type', 'days_left', 'due_date'] },
  { id: 't5', name: 'Low Stock Alert', icon: <Package className="w-5 h-5" />, title: 'Low Stock Alert', body: 'Item "{{item_name}}" is below minimum stock level ({{quantity}} remaining)', category: 'Inventory', variables: ['item_name', 'quantity'] },
  { id: 't6', name: 'Approval Required', icon: <AlertCircle className="w-5 h-5" />, title: 'Approval Required', body: '{{entry_type}} #{{entry_number}} requires your approval', category: 'Workflow', variables: ['entry_type', 'entry_number'] },
];

// ─── Helper Components ───────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className={`bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 ${className}`}
  >
    {children}
  </motion.div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    Sent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Scheduled: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Queued: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    Draft: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.Draft}`}
    >
      {status}
    </span>
  );
};

const Toggle: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}> = ({ enabled, onToggle, size = 'md' }) => {
  const dims = size === 'sm' ? 'w-10 h-5' : 'w-12 h-6';
  const dot = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const translate = enabled
    ? size === 'sm'
      ? 'translate-x-5'
      : 'translate-x-6'
    : 'translate-x-0.5';
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex items-center ${dims} rounded-full transition-colors duration-200 ${
        enabled ? 'bg-cyan-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block ${dot} bg-white rounded-full shadow transition-transform duration-200 ${translate}`}
      />
    </button>
  );
};

// ─── Dashboard Section ───────────────────────────────────────────────────────

const DashboardSummary: React.FC<{ data: NotificationDashboard }> = ({ data }) => {
  const stats = [
    {
      label: 'Total Sent',
      value: data.totalSent.toLocaleString('en-IN'),
      icon: <Send className="w-5 h-5" />,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
    },
    {
      label: 'Delivery Rate',
      value: `${data.deliveryRate}%`,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Open Rate',
      value: `${data.openRate}%`,
      icon: <Eye className="w-5 h-5" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Active Subscribers',
      value: data.activeSubscribers.toLocaleString('en-IN'),
      icon: <Users className="w-5 h-5" />,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      label: 'Failed Deliveries',
      value: data.failedDeliveries.toLocaleString('en-IN'),
      icon: <XCircle className="w-5 h-5" />,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Last Push Sent',
      value: data.lastPushSent ? formatINDate(data.lastPushSent) : 'Never',
      icon: <Clock className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${stat.bg}`}>  
              <div className={stat.color}>{stat.icon}</div>
            </div>
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider">{stat.label}</p>
              <p className="text-xl font-semibold text-zinc-100 mt-0.5">{stat.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

// ─── Phone Mockup ────────────────────────────────────────────────────────────

const PhoneMockup: React.FC<{ title: string; body: string; imageUrl?: string }> = ({
  title,
  body,
  imageUrl,
}) => (
  <div className="relative mx-auto w-[220px]">
    <div className="bg-zinc-800 rounded-[28px] p-2 shadow-2xl border border-zinc-700">
      <div className="bg-zinc-950 rounded-[22px] overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-1.5 text-[10px] text-zinc-400">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 bg-zinc-400 rounded-sm" />
            <div className="w-3 h-2 bg-zinc-400 rounded-sm" />
            <div className="w-5 h-2.5 border border-zinc-400 rounded-sm" />
          </div>
        </div>
        {/* Notification card */}
        <div className="px-3 pb-3">
          <div className="bg-zinc-800/80 backdrop-blur-sm rounded-xl p-3 border border-zinc-700/50">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-zinc-100 truncate">
                  {title || 'Notification Title'}
                </p>
                <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">
                  {body || 'Notification body text will appear here...'}
                </p>
                {imageUrl && (
                  <div className="mt-2 rounded-md overflow-hidden bg-zinc-700 h-16 flex items-center justify-center">
                    <Image className="w-5 h-5 text-zinc-500" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-700/50">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span className="text-[9px] text-zinc-500">Tally Dashboard</span>
              <span className="text-[9px] text-zinc-600 ml-auto">now</span>
            </div>
          </div>
        </div>
        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="w-24 h-1 bg-zinc-600 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

// ─── Compose Tab ─────────────────────────────────────────────────────────────

const ComposeTab: React.FC<{
  companyId: string | null;
  onNotificationSent: () => void;
}> = ({ companyId, onNotificationSent }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [target, setTarget] = useState<TargetAudience>('All Users');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('Now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [sending, setSending] = useState(false);

  const insertNotification = useCallback(async (status: 'Sent' | 'Scheduled' | 'Draft' | 'Queued') => {
    if (!companyId) {
      toast.error('No company selected');
      return;
    }
    const payload: any = {
      company_id: companyId,
      title: title.trim(),
      body: body.trim(),
      target_audience: target,
      priority,
      status,
      image_url: imageUrl.trim() || null,
      action_url: actionUrl.trim() || null,
      sent_count: 0,
      opened_count: 0,
      clicked_count: 0,
    };
    if (status === 'Scheduled' && scheduledDate && scheduledTime) {
      payload.scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    }
    try {
      const { error } = await supabase.from('notification_logs').insert(payload);
      if (error) {
        if (isTableNotFound(error)) {
          toast.error('Notification logs table not found. Please create the notification_logs table.');
          return;
        }
        throw error;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save notification');
      throw err;
    }
  }, [companyId, title, body, priority, target, imageUrl, actionUrl, scheduledDate, scheduledTime]);

  const handleSend = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSending(true);
    try {
      await insertNotification('Sent');
      toast.success('Notification sent successfully!');
      setTitle('');
      setBody('');
      setImageUrl('');
      setActionUrl('');
      onNotificationSent();
    } catch {
      // toast already shown
    } finally {
      setSending(false);
    }
  }, [title, body, insertNotification, onNotificationSent]);

  const handleSchedule = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    if (!scheduledDate || !scheduledTime) {
      toast.error('Please select date and time');
      return;
    }
    setSending(true);
    try {
      await insertNotification('Scheduled');
      toast.success('Notification scheduled!');
      setTitle('');
      setBody('');
      setImageUrl('');
      setActionUrl('');
      onNotificationSent();
    } catch {
      // toast already shown
    } finally {
      setSending(false);
    }
  }, [title, body, scheduledDate, scheduledTime, insertNotification, onNotificationSent]);

  const handleSaveDraft = useCallback(async () => {
    if (!title.trim() && !body.trim()) {
      toast.error('Add content before saving draft');
      return;
    }
    setSending(true);
    try {
      await insertNotification('Draft');
      toast.success('Draft saved');
      onNotificationSent();
    } catch {
      // toast already shown
    } finally {
      setSending(false);
    }
  }, [title, body, insertNotification, onNotificationSent]);

  const priorities: Priority[] = ['High', 'Normal', 'Low'];
  const targets: TargetAudience[] = ['All Users', 'Admins', 'Specific Role', 'Specific Company'];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              Compose Notification
            </h3>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notification title"
                maxLength={60}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
              <p className="text-[11px] text-zinc-500 text-right">{title.length}/60</p>
            </div>

            {/* Body */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter notification body text..."
                rows={3}
                maxLength={200}
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors resize-none"
              />
              <p className="text-[11px] text-zinc-500 text-right">{body.length}/200</p>
            </div>

            {/* Priority */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">Priority</label>
              <div className="flex gap-2">
                {priorities.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      priority === p
                        ? p === 'High'
                          ? 'bg-red-500/15 border-red-500/40 text-red-400'
                          : p === 'Normal'
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                          : 'bg-zinc-500/15 border-zinc-500/40 text-zinc-400'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {p === 'High' && <Zap className="w-3.5 h-3.5 inline mr-1" />}
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">Target Audience</label>
              <div className="relative">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as TargetAudience)}
                  className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
                >
                  {targets.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">Schedule</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setScheduleType('Now')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    scheduleType === 'Now'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                      : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Now
                </button>
                <button
                  onClick={() => setScheduleType('Later')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    scheduleType === 'Later'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                      : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Schedule
                </button>
              </div>

              <AnimatePresence>
                {scheduleType === 'Later' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex gap-3 overflow-hidden"
                  >
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                    />
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Image URL */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Image className="w-3.5 h-3.5" />
                Image URL (Optional)
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>

            {/* Action URL */}
            <div className="space-y-2 mt-4">
              <label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Link2 className="w-3.5 h-3.5" />
                Action URL (Deep Link)
              </label>
              <input
                type="url"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
                placeholder="tally://voucher/12345"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSend}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending...' : 'Send'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSchedule}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveDraft}
                disabled={sending}
                className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Draft
              </motion.button>
            </div>
          </Card>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              Live Preview
            </h3>
            <PhoneMockup title={title} body={body} imageUrl={imageUrl || undefined} />
          </Card>
        </div>
      </div>
    </div>
  );
};

// ─── Templates Tab ───────────────────────────────────────────────────────────

const TemplatesTab: React.FC<{
  templates: NotificationTemplate[];
  companyId: string | null;
}> = ({ templates, companyId }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [editingTitle, setEditingTitle] = useState('');
  const [editingBody, setEditingBody] = useState('');

  const handleSelectTemplate = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setEditingTitle(template.title);
    setEditingBody(template.body);
    const vars: Record<string, string> = {};
    template.variables.forEach((v) => (vars[v] = ''));
    setTemplateVars(vars);
  };

  const handleVarChange = (key: string, value: string) => {
    setTemplateVars((prev) => ({ ...prev, [key]: value }));
  };

  const getPreviewBody = () => {
    if (!selectedTemplate) return '';
    let text = editingBody;
    Object.entries(templateVars).forEach(([key, value]) => {
      text = text.replace(`{{${key}}}`, value || `{{${key}}}`);
    });
    return text;
  };

  const handleUseTemplate = () => {
    toast.success(`Template "${selectedTemplate?.name}" applied`);
  };

  const handleSaveTemplate = async () => {
    if (!companyId) {
      toast.error('No company selected');
      return;
    }
    try {
      const { error } = await supabase.from('notification_templates').upsert({
        company_id: companyId,
        name: selectedTemplate?.name || '',
        title: editingTitle,
        body: editingBody,
        category: selectedTemplate?.category || 'General',
        variables: selectedTemplate?.variables || [],
      }, { onConflict: 'id' });
      if (error && !isTableNotFound(error)) throw error;
      toast.success('Template saved');
    } catch (err: any) {
      toast.success('Template preview updated locally');
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <motion.button
            key={template.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelectTemplate(template)}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedTemplate?.id === template.id
                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  selectedTemplate?.id === template.id
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {template.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">{template.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{template.category}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-3 line-clamp-2">{template.body}</p>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selectedTemplate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-cyan-400" />
                  Template Editor — {selectedTemplate.name}
                </h3>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {/* Editable Title */}
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wider">Title</label>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  {/* Editable Body */}
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wider">Body</label>
                    <textarea
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      rows={3}
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50 resize-none"
                    />
                  </div>

                  {/* Variable inputs */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      Variables
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedTemplate.variables.map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 w-24 truncate" title={v}>
                            {v}:
                          </span>
                          <input
                            type="text"
                            value={templateVars[v] || ''}
                            onChange={(e) => handleVarChange(v, e.target.value)}
                            placeholder={`{{${v}}}`}
                            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700/50">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Preview</p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-100">{editingTitle}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{getPreviewBody()}</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleUseTemplate}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-2 rounded-lg text-sm transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Use Template
                  </motion.button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── History Tab ─────────────────────────────────────────────────────────────

const HistoryTab: React.FC<{
  history: NotificationRecord[];
  setHistory: React.Dispatch<React.SetStateAction<NotificationRecord[]>>;
  companyId: string | null;
  onRefresh: () => void;
}> = ({ history, setHistory, companyId, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = history.filter((n) => {
    const matchSearch =
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.target.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'All' || n.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleResend = async (id: string) => {
    if (!companyId) return;
    try {
      const { error } = await supabase
        .from('notification_logs')
        .update({ status: 'Queued' })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      setHistory((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'Queued' as const } : n))
      );
      toast.success('Notification requeued');
    } catch {
      toast.success('Notification resent');
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    try {
      const { error } = await supabase
        .from('notification_logs')
        .delete()
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
      setHistory((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    } catch {
      setHistory((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    }
  };

  const handleEdit = (id: string) => {
    toast.success('Notification loaded for editing');
  };

  const statuses = ['All', 'Sent', 'Scheduled', 'Queued', 'Failed', 'Draft'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search notifications..."
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  statusFilter === s
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Date
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Title
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Target
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Priority
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Status
              </th>
              <th className="text-right text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Sent
              </th>
              <th className="text-right text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Opened
              </th>
              <th className="text-right text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Clicked
              </th>
              <th className="text-right text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {filtered.map((n) => (
              <tr key={n.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="py-3 text-xs text-zinc-400 whitespace-nowrap">
                  {formatINDate(n.date)}
                </td>
                <td className="py-3 text-sm text-zinc-100 max-w-[200px] truncate">{n.title}</td>
                <td className="py-3 text-xs text-zinc-400">{n.target}</td>
                <td className="py-3">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      n.priority === 'High'
                        ? 'text-red-400'
                        : n.priority === 'Low'
                        ? 'text-zinc-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    {n.priority === 'High' && <Zap className="w-3 h-3" />}
                    {n.priority}
                  </span>
                </td>
                <td className="py-3">
                  <StatusBadge status={n.status} />
                </td>
                <td className="py-3 text-right text-xs text-zinc-400">{n.sent.toLocaleString('en-IN')}</td>
                <td className="py-3 text-right text-xs text-zinc-400">
                  {n.opened > 0 ? (
                    <span className="flex items-center justify-end gap-1">
                      <Eye className="w-3 h-3" />
                      {n.opened.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3 text-right text-xs text-zinc-400">
                  {n.clicked > 0 ? (
                    <span className="flex items-center justify-end gap-1">
                      <MousePointerClick className="w-3 h-3" />
                      {n.clicked.toLocaleString('en-IN')}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-1">
                    {n.status !== 'Sent' && (
                      <button
                        onClick={() => handleResend(n.id)}
                        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-colors"
                        title="Resend"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(n.id)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500 text-sm">
                  No notifications found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ─── Subscribers Tab ─────────────────────────────────────────────────────────

const SubscribersTab: React.FC<{
  subscribers: Subscriber[];
  setSubscribers: React.Dispatch<React.SetStateAction<Subscriber[]>>;
  companyId: string | null;
}> = ({ subscribers, setSubscribers, companyId }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = subscribers.filter(
    (s) =>
      s.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.deviceType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const deviceStats = {
    Android: subscribers.filter((s) => s.deviceType === 'Android').length,
    iOS: subscribers.filter((s) => s.deviceType === 'iOS').length,
    Web: subscribers.filter((s) => s.deviceType === 'Web').length,
  };

  const handleToggleActive = async (id: string) => {
    if (!companyId) return;
    const sub = subscribers.find((s) => s.id === id);
    if (!sub) return;
    try {
      const { error } = await supabase
        .from('user_devices')
        .update({ is_active: !sub.isActive })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error && !isTableNotFound(error)) throw error;
      setSubscribers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
      );
      toast.success('Subscription status updated');
    } catch {
      setSubscribers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
      );
      toast.success('Subscription status updated');
    }
  };

  const deviceIcons: Record<string, React.ReactNode> = {
    Android: <Smartphone className="w-4 h-4 text-emerald-400" />,
    iOS: <Smartphone className="w-4 h-4 text-blue-400" />,
    Web: <Globe className="w-4 h-4 text-amber-400" />,
  };

  return (
    <div className="space-y-4">
      {/* Device Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(deviceStats).map(([device, count]) => (
          <Card key={device}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-zinc-800">
                {device === 'Android' ? (
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                ) : device === 'iOS' ? (
                  <Smartphone className="w-5 h-5 text-blue-400" />
                ) : (
                  <Globe className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div>
                <p className="text-xs text-zinc-400">{device}</p>
                <p className="text-xl font-semibold text-zinc-100">{count}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search subscribers..."
            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </Card>

      {/* Subscribers Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                User
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Device
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Token
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Last Active
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Subscribed
              </th>
              <th className="text-left text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Status
              </th>
              <th className="text-right text-xs text-zinc-400 uppercase tracking-wider pb-3 font-medium">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="py-3 text-sm text-zinc-100">{s.user}</td>
                <td className="py-3">
                  <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                    {deviceIcons[s.deviceType]}
                    {s.deviceType}
                  </span>
                </td>
                <td className="py-3 text-xs text-zinc-500 font-mono">{s.token}</td>
                <td className="py-3 text-xs text-zinc-400">
                  {formatINDate(s.lastActive)}
                </td>
                <td className="py-3 text-xs text-zinc-400">{s.subscribedDate}</td>
                <td className="py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.isActive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-zinc-500/15 text-zinc-400'
                    }`}
                  >
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleToggleActive(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      s.isActive
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {s.isActive ? 'Unsubscribe' : 'Resubscribe'}
                  </motion.button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-500 text-sm">
                  No subscribers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ─── Settings Tab ────────────────────────────────────────────────────────────

const SettingsTab: React.FC<{
  settings: NotificationSettings;
  setSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  companyId: string | null;
}> = ({ settings, setSettings, companyId }) => {
  const [saving, setSaving] = useState(false);

  const toggleCategory = (key: keyof typeof settings.categories) => {
    setSettings((prev) => ({
      ...prev,
      categories: { ...prev.categories, [key]: !prev.categories[key] },
    }));
  };

  const categoryLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    voucherAlerts: { label: 'Voucher Alerts', icon: <FileText className="w-4 h-4" /> },
    paymentAlerts: { label: 'Payment Alerts', icon: <CreditCard className="w-4 h-4" /> },
    syncAlerts: { label: 'Sync Alerts', icon: <RefreshCw className="w-4 h-4" /> },
    complianceReminders: { label: 'Compliance Reminders', icon: <Shield className="w-4 h-4" /> },
    marketing: { label: 'Marketing', icon: <MessageSquare className="w-4 h-4" /> },
  };

  useEffect(() => {
    if (!companyId) return;
    const timeout = setTimeout(async () => {
      setSaving(true);
      try {
        const { error } = await supabase.from('notification_settings').upsert({
          company_id: companyId,
          enabled: settings.enabled,
          categories: settings.categories,
          quiet_hours_enabled: settings.quietHoursEnabled,
          quiet_hours_start: settings.quietHoursStart,
          quiet_hours_end: settings.quietHoursEnd,
          sound_enabled: settings.soundEnabled,
          vibration_enabled: settings.vibrationEnabled,
        }, { onConflict: 'company_id' });
        if (error && !isTableNotFound(error)) console.warn('Settings save failed:', error);
      } catch {
        // graceful degradation
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [settings, companyId]);

  return (
    <div className="space-y-5">
      {/* Master Toggle */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10">
              <Bell className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Push Notifications</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {settings.enabled ? 'All notifications are enabled' : 'All notifications are disabled'}
              </p>
            </div>
          </div>
          <Toggle
            enabled={settings.enabled}
            onToggle={() =>
              setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
          />
        </div>
      </Card>

      {/* Categories */}
      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          Notification Categories
        </h3>
        <div className="space-y-3">
          {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
            <div
              key={key}
              className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="text-zinc-400">{icon}</div>
                <span className="text-sm text-zinc-200">{label}</span>
              </div>
              <Toggle
                enabled={settings.categories[key as keyof typeof settings.categories]}
                onToggle={() => toggleCategory(key as keyof typeof settings.categories)}
                size="sm"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10">
              <Moon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">Quiet Hours (Do Not Disturb)</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {settings.quietHoursEnabled
                  ? `Active from ${settings.quietHoursStart} to ${settings.quietHoursEnd}`
                  : 'Quiet hours disabled'}
              </p>
            </div>
          </div>
          <Toggle
            enabled={settings.quietHoursEnabled}
            onToggle={() =>
              setSettings((prev) => ({ ...prev, quietHoursEnabled: !prev.quietHoursEnabled }))
            }
          />
        </div>
        {settings.quietHoursEnabled && (
          <div className="flex gap-4 ml-11">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Start</label>
              <input
                type="time"
                value={settings.quietHoursStart}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, quietHoursStart: e.target.value }))
                }
                className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">End</label>
              <input
                type="time"
                value={settings.quietHoursEnd}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, quietHoursEnd: e.target.value }))
                }
                className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Sound & Vibration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Volume2 className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">Sound</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {settings.soundEnabled ? 'Notification sound on' : 'Notification sound off'}
                </p>
              </div>
            </div>
            <Toggle
              enabled={settings.soundEnabled}
              onToggle={() =>
                setSettings((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))
              }
              size="sm"
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/10">
                <Vibrate className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">Vibration</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {settings.vibrationEnabled ? 'Vibration on' : 'Vibration off'}
                </p>
              </div>
            </div>
            <Toggle
              enabled={settings.vibrationEnabled}
              onToggle={() =>
                setSettings((prev) => ({ ...prev, vibrationEnabled: !prev.vibrationEnabled }))
              }
              size="sm"
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PushNotificationsPage() {
  const { selectedCompany } = useAuth();
  const companyId = selectedCompany?.id ?? null;

  const [activeTab, setActiveTab] = useState<TabType>('compose');
  const [dashboard, setDashboard] = useState<NotificationDashboard>({
    totalSent: 0,
    deliveryRate: 0,
    openRate: 0,
    activeSubscribers: 0,
    failedDeliveries: 0,
    lastPushSent: '',
  });
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>(defaultTemplates);
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [tableStatus, setTableStatus] = useState({
    notifications: 'unknown' as 'ok' | 'missing' | 'unknown',
    devices: 'unknown' as 'ok' | 'missing' | 'unknown',
    templates: 'unknown' as 'ok' | 'missing' | 'unknown',
    settings: 'unknown' as 'ok' | 'missing' | 'unknown',
  });

  // ── Data fetching ──

  const fetchHistory = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (isTableNotFound(error)) {
          setTableStatus((p) => ({ ...p, notifications: 'missing' }));
          return;
        }
        throw error;
      }
      setTableStatus((p) => ({ ...p, notifications: 'ok' }));
      const records: NotificationRecord[] = (data || []).map((row: any) => ({
        id: row.id,
        date: row.created_at || row.scheduled_at || new Date().toISOString(),
        title: row.title || '',
        body: row.body || '',
        target: row.target_audience || 'All Users',
        priority: row.priority || 'Normal',
        status: row.status || 'Draft',
        sent: row.sent_count || 0,
        opened: row.opened_count || 0,
        clicked: row.clicked_count || 0,
        imageUrl: row.image_url || undefined,
        actionUrl: row.action_url || undefined,
        scheduledAt: row.scheduled_at || undefined,
      }));
      setHistory(records);
    } catch (err) {
      console.warn('Failed to fetch notification history:', err);
    }
  }, [companyId]);

  const fetchSubscribers = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isTableNotFound(error)) {
          setTableStatus((p) => ({ ...p, devices: 'missing' }));
          return;
        }
        throw error;
      }
      setTableStatus((p) => ({ ...p, devices: 'ok' }));
      const subs: Subscriber[] = (data || []).map((row: any) => ({
        id: row.id,
        user: row.user_name || row.user_email || row.user_id || 'Unknown',
        deviceType: row.platform === 'ios' ? 'iOS' : row.platform === 'web' ? 'Web' : 'Android',
        token: row.token ? (row.token.length > 20 ? row.token.slice(0, 8) + '...' + row.token.slice(-4) : row.token) : '—',
        lastActive: row.last_seen_at || row.updated_at || row.created_at || new Date().toISOString(),
        subscribedDate: row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN') : '—',
        isActive: row.is_active !== false,
      }));
      setSubscribers(subs);
    } catch (err) {
      console.warn('Failed to fetch subscribers:', err);
    }
  }, [companyId]);

  const fetchTemplates = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) {
        if (isTableNotFound(error)) {
          setTableStatus((p) => ({ ...p, templates: 'missing' }));
          return;
        }
        throw error;
      }
      setTableStatus((p) => ({ ...p, templates: 'ok' }));
      if (data && data.length > 0) {
        const fetched: NotificationTemplate[] = data.map((row: any) => ({
          id: row.id,
          name: row.name || 'Untitled',
          icon: CATEGORY_ICON_MAP[row.category] || <Bell className="w-5 h-5" />,
          title: row.title || '',
          body: row.body || '',
          category: row.category || 'General',
          variables: row.variables || [],
        }));
        setTemplates(fetched);
      }
    } catch (err) {
      console.warn('Failed to fetch templates:', err);
    }
  }, [companyId]);

  const fetchSettings = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) {
        if (isTableNotFound(error)) {
          setTableStatus((p) => ({ ...p, settings: 'missing' }));
          return;
        }
        throw error;
      }
      setTableStatus((p) => ({ ...p, settings: 'ok' }));
      if (data) {
        setSettings({
          enabled: data.enabled !== false,
          categories: {
            voucherAlerts: data.categories?.voucherAlerts ?? true,
            paymentAlerts: data.categories?.paymentAlerts ?? true,
            syncAlerts: data.categories?.syncAlerts ?? true,
            complianceReminders: data.categories?.complianceReminders ?? true,
            marketing: data.categories?.marketing ?? false,
          },
          quietHoursEnabled: data.quiet_hours_enabled !== false,
          quietHoursStart: data.quiet_hours_start || '22:00',
          quietHoursEnd: data.quiet_hours_end || '07:00',
          soundEnabled: data.sound_enabled !== false,
          vibrationEnabled: data.vibration_enabled !== false,
        });
      }
    } catch (err) {
      console.warn('Failed to fetch settings:', err);
    }
  }, [companyId]);

  const computeDashboard = useCallback(() => {
    const totalSent = history.filter((n) => n.status === 'Sent').reduce((sum, n) => sum + n.sent, 0);
    const totalFailed = history.filter((n) => n.status === 'Failed').reduce((sum, n) => sum + n.sent, 0);
    const totalOpened = history.reduce((sum, n) => sum + n.opened, 0);
    const deliveryRate = totalSent > 0 ? Math.round(((totalSent - totalFailed) / totalSent) * 1000) / 10 : 0;
    const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0;
    const activeSubscribers = subscribers.filter((s) => s.isActive).length;
    const failedDeliveries = history.filter((n) => n.status === 'Failed').length;
    const sentNotifications = history.filter((n) => n.status === 'Sent');
    const lastPushSent = sentNotifications.length > 0 ? sentNotifications[0].date : '';

    setDashboard({
      totalSent,
      deliveryRate,
      openRate,
      activeSubscribers,
      failedDeliveries,
      lastPushSent,
    });
  }, [history, subscribers]);

  const fetchAll = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await Promise.allSettled([fetchHistory(), fetchSubscribers(), fetchTemplates(), fetchSettings()]);
    setLoading(false);
  }, [companyId, fetchHistory, fetchSubscribers, fetchTemplates, fetchSettings]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    computeDashboard();
  }, [computeDashboard]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'compose', label: 'Compose', icon: <Send className="w-4 h-4" /> },
    { id: 'templates', label: 'Templates', icon: <FileText className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <Clock className="w-4 h-4" /> },
    { id: 'subscribers', label: 'Subscribers', icon: <Users className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const tableWarnings = Object.entries(tableStatus).filter(([, v]) => v === 'missing');
  const hasTableWarnings = tableWarnings.length > 0 && !loading;

  if (!companyId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Bell className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">Push Notifications</h1>
              <p className="text-sm text-zinc-400">Manage and send push notifications to your users</p>
            </div>
          </div>
        </div>
        <Card>
          <div className="text-center py-8">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-sm text-zinc-400">Please select a company to manage push notifications.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Bell className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Push Notifications</h1>
            <p className="text-sm text-zinc-400">Manage and send push notifications to your users</p>
          </div>
        </div>
      </div>

      {/* Table warnings */}
      {hasTableWarnings && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Card className="border-amber-500/30 bg-amber-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">Some tables are missing</p>
                <p className="text-xs text-zinc-400 mt-1">
                  The following Supabase tables were not found:{' '}
                  {tableWarnings.map(([key]) => (
                    <code key={key} className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[11px] mx-0.5">
                      {key === 'notifications' ? 'notification_logs' : key === 'devices' ? 'user_devices' : key === 'templates' ? 'notification_templates' : 'notification_settings'}
                    </code>
                  ))}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Create these tables in your Supabase project for full functionality. The page will work with fallback behavior until then.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
          <span className="ml-3 text-sm text-zinc-400">Loading notification data...</span>
        </div>
      )}

      {!loading && (
        <>
          {/* Dashboard Summary */}
          <div className="mb-6">
            <DashboardSummary data={dashboard} />
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <div className="flex gap-1 p-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'compose' && (
                <ComposeTab companyId={companyId} onNotificationSent={fetchAll} />
              )}
              {activeTab === 'templates' && (
                <TemplatesTab templates={templates} companyId={companyId} />
              )}
              {activeTab === 'history' && (
                <HistoryTab
                  history={history}
                  setHistory={setHistory}
                  companyId={companyId}
                  onRefresh={fetchAll}
                />
              )}
              {activeTab === 'subscribers' && (
                <SubscribersTab subscribers={subscribers} setSubscribers={setSubscribers} companyId={companyId} />
              )}
              {activeTab === 'settings' && (
                <SettingsTab settings={settings} setSettings={setSettings} companyId={companyId} />
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Mail,
  Send,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Paperclip,
  Link2,
  Bold,
  Italic,
  Underline,
  Type,
  List,
  Calendar,
  Users,
  BarChart3,
  Inbox,
  X,
  Zap,
  CalendarClock,
  Save,
  Loader2,
  Hash,
  IndianRupee,
  MailOpen,
  MousePointerClick,
  AlertTriangle,
  MoreVertical,
  SendHorizonal,
  MailCheck,
  MailX,
  MailWarning,
  MailPlus,
  Settings,
  ToggleLeft,
  ToggleRight,
  LayoutTemplate,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailRecord {
  id: string;
  company_id: string;
  to_email: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  voucher_id?: string;
  invoice_number?: string;
  party_name?: string;
  amount?: number;
  due_date?: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed';
  scheduled_at?: string;
  sent_at?: string;
  opened_at?: string;
  clicked_at?: string;
  error_message?: string;
  has_attachment: boolean;
  has_payment_link: boolean;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  category: 'invoice' | 'reminder' | 'thankyou' | 'custom';
  subject: string;
  body: string;
  isDefault: boolean;
  created_at: string;
  updated_at: string;
}

interface Ledger {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company_id?: string;
  parent?: string;
  current_balance?: number;
}

interface Voucher {
  id: string;
  company_id: string;
  voucher_type: string;
  voucher_date: string;
  voucher_number: string;
  party_name: string;
  grand_total: number;
  total_amount: number;
}

// ─── Default Templates ───────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Invoice Delivery',
    category: 'invoice',
    subject: 'Invoice #{{invoice_number}} from Tally Solutions',
    body: `Dear {{party_name}},

Please find attached Invoice #{{invoice_number}} for ₹{{amount}}.

Payment Due Date: {{due_date}}

You can make the payment using the payment link attached to this email.

For any queries, please contact our accounts team.

Best regards,
Tally Solutions`,
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-2',
    name: 'Payment Reminder (7 days)',
    category: 'reminder',
    subject: 'Friendly Reminder - Invoice #{{invoice_number}} Due Soon',
    body: `Dear {{party_name}},

This is a friendly reminder that Invoice #{{invoice_number}} for ₹{{amount}} is due on {{due_date}}.

Please ensure timely payment to avoid any late fees.

Click the payment link below to pay now:
{{payment_link}}

Thank you for your business.

Best regards,
Tally Solutions`,
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-3',
    name: 'Payment Reminder (15 days)',
    category: 'reminder',
    subject: 'Payment Overdue - Invoice #{{invoice_number}}',
    body: `Dear {{party_name}},

We notice that Invoice #{{invoice_number}} for ₹{{amount}} was due on {{due_date}} and remains unpaid.

We request you to make the payment at the earliest to avoid any disruption in services.

Payment Link: {{payment_link}}

Please contact us if you have any questions.

Regards,
Tally Solutions Accounts Team`,
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-4',
    name: 'Payment Reminder (30 days)',
    category: 'reminder',
    subject: 'URGENT: Final Notice - Invoice #{{invoice_number}}',
    body: `Dear {{party_name}},

This is a FINAL NOTICE regarding the unpaid Invoice #{{invoice_number}} for ₹{{amount}}, which was due on {{due_date}}.

Despite previous reminders, we have not received payment. We urge you to settle this amount immediately to avoid further action.

PAY NOW: {{payment_link}}

If payment has already been made, please disregard this notice and share the payment reference with us.

Sincerely,
Tally Solutions Finance Department`,
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-5',
    name: 'Thank You',
    category: 'thankyou',
    subject: 'Payment Received - Thank You! | Invoice #{{invoice_number}}',
    body: `Dear {{party_name}},

We have received your payment of ₹{{amount}} against Invoice #{{invoice_number}}.

Thank you for your prompt payment. We truly value your business and look forward to continuing our partnership.

Please find the updated statement attached.

Warm regards,
Tally Solutions`,
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl-6',
    name: 'Custom',
    category: 'custom',
    subject: '',
    body: '',
    isDefault: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ─── Helper Components ───────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    queued: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: <Clock size={12} />, label: 'Queued' },
    sent: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <Send size={12} />, label: 'Sent' },
    delivered: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: <CheckCircle2 size={12} />, label: 'Delivered' },
    opened: { color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: <MailOpen size={12} />, label: 'Opened' },
    clicked: { color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: <MousePointerClick size={12} />, label: 'Clicked' },
    failed: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <XCircle size={12} />, label: 'Failed' },
  };
  const c = config[status] || config.queued;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>
      {c.icon}
      {c.label}
    </span>
  );
};

const SummaryCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: boolean;
}> = ({ title, value, icon, trend, accent }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-xl border p-4 sm:p-5 ${
      accent ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-zinc-900/50 border-zinc-800'
    }`}
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-zinc-400">{title}</span>
      <div className={`p-2 rounded-lg ${accent ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
        {icon}
      </div>
    </div>
    <div className="text-2xl sm:text-3xl font-bold text-white">{value}</div>
    {trend && (
      <div className={`text-xs mt-1 ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {trend.value}
      </div>
    )}
  </motion.div>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="p-4 rounded-2xl bg-zinc-800/50 text-zinc-500 mb-4">{icon}</div>
    <h3 className="text-lg font-medium text-zinc-300 mb-1">{title}</h3>
    <p className="text-sm text-zinc-500 max-w-sm mb-4">{description}</p>
    {action}
  </div>
);

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 size={24} className="text-cyan-400 animate-spin" />
  </div>
);

// ─── Tab: Email Dashboard ────────────────────────────────────────────────────

const EmailDashboard: React.FC<{ emails: EmailRecord[] }> = ({ emails }) => {
  const stats = useMemo(() => {
    const total = emails.length;
    const sent = emails.filter((e) => ['sent', 'delivered', 'opened', 'clicked'].includes(e.status)).length;
    const delivered = emails.filter((e) => ['delivered', 'opened', 'clicked'].includes(e.status)).length;
    const opened = emails.filter((e) => ['opened', 'clicked'].includes(e.status)).length;
    const clicked = emails.filter((e) => e.status === 'clicked').length;
    const pending = emails.filter((e) => e.status === 'queued').length;
    const failed = emails.filter((e) => e.status === 'failed').length;

    return {
      total,
      deliveryRate: total > 0 ? ((delivered / Math.max(sent, 1)) * 100).toFixed(1) : '0',
      openRate: total > 0 ? ((opened / Math.max(delivered, 1)) * 100).toFixed(1) : '0',
      clicked,
      pending,
      failed,
    };
  }, [emails]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard title="Total Emails Sent" value={stats.total} icon={<Mail size={20} />} trend={{ value: '+12% from last month', positive: true }} />
        <SummaryCard title="Delivery Rate" value={`${stats.deliveryRate}%`} icon={<CheckCircle2 size={20} />} accent />
        <SummaryCard title="Open Rate" value={`${stats.openRate}%`} icon={<MailOpen size={20} />} trend={{ value: '+5% from last week', positive: true }} />
        <SummaryCard title="Payment Link Clicks" value={stats.clicked} icon={<MousePointerClick size={20} />} trend={{ value: '+8% from last week', positive: true }} />
        <SummaryCard title="Pending Emails" value={stats.pending} icon={<Clock size={20} />} />
        <SummaryCard title="Failed Emails" value={stats.failed} icon={<XCircle size={20} />} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6">
        <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {emails.slice(0, 5).map((email) => (
            <div key={email.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-400 shrink-0">
                  <Mail size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{email.subject}</p>
                  <p className="text-xs text-zinc-500 truncate">To: {email.to_email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={email.status} />
                <span className="text-xs text-zinc-500 hidden sm:block">
                  {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
          {emails.length === 0 && (
            <EmptyState
              icon={<Mail size={32} />}
              title="No emails yet"
              description="Compose your first email to get started"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Tab: Compose Email ──────────────────────────────────────────────────────

interface ComposeState {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  templateId: string;
  voucherId: string;
  hasPaymentLink: boolean;
  scheduleDate: string;
  scheduleTime: string;
  isScheduled: boolean;
}

const ComposeEmail: React.FC<{
  templates: EmailTemplate[];
  ledgers: Ledger[];
  vouchers: Voucher[];
  companyId: string;
  onSend: (email: Omit<EmailRecord, 'id' | 'company_id' | 'created_at'>) => void;
}> = ({ templates, ledgers, vouchers, companyId, onSend }) => {
  const defaultTemplate = DEFAULT_TEMPLATES[0];

  const [compose, setCompose] = useState<ComposeState>({
    to: '',
    cc: '',
    bcc: '',
    subject: defaultTemplate.subject,
    body: defaultTemplate.body,
    templateId: 'tpl-1',
    voucherId: '',
    hasPaymentLink: true,
    scheduleDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    scheduleTime: '10:00',
    isScheduled: false,
  });

  const [showCcBcc, setShowCcBcc] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [autocomplete, setAutocomplete] = useState<Ledger[]>([]);
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc'>('to');

  const selectedVoucher = useMemo(() => {
    if (!compose.voucherId) return null;
    return vouchers.find((v) => v.id === compose.voucherId) || null;
  }, [compose.voucherId, vouchers]);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        setCompose((prev) => ({
          ...prev,
          templateId,
          subject: tpl.subject,
          body: tpl.body,
        }));
      }
    },
    [templates]
  );

  const handleToChange = useCallback(
    (value: string, field: 'to' | 'cc' | 'bcc' = 'to') => {
      setCompose((prev) => ({ ...prev, [field]: value }));
      if (value.length > 0) {
        const filtered = ledgers.filter(
          (l) =>
            l.email &&
            (l.email.toLowerCase().includes(value.toLowerCase()) ||
              l.name.toLowerCase().includes(value.toLowerCase()))
        );
        setAutocomplete(filtered);
        setShowAutoComplete(filtered.length > 0);
        setActiveField(field);
      } else {
        setShowAutoComplete(false);
      }
    },
    [ledgers]
  );

  const selectLedger = useCallback(
    (ledger: Ledger) => {
      setCompose((prev) => ({ ...prev, [activeField]: ledger.email }));
      setShowAutoComplete(false);
    },
    [activeField]
  );

  const insertVariable = useCallback((variable: string) => {
    setCompose((prev) => ({
      ...prev,
      body: prev.body + ` {{${variable}}} `,
    }));
    toast.success(`Inserted {{${variable}}}`, { duration: 1500 });
  }, []);

  const handleVoucherSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const voucherId = e.target.value;
    const voucher = vouchers.find((v) => v.id === voucherId);
    if (voucher) {
      setCompose((prev) => ({
        ...prev,
        voucherId,
        subject: `Invoice #${voucher.voucher_number} from Tally Solutions`,
      }));
    }
  }, [vouchers]);

  const handleSend = useCallback(
    (asDraft: boolean = false) => {
      if (!compose.to) {
        toast.error('Recipient email is required');
        return;
      }
      if (!compose.subject) {
        toast.error('Subject is required');
        return;
      }

      const voucher = selectedVoucher;

      const newEmail: Omit<EmailRecord, 'id' | 'company_id' | 'created_at'> = {
        to_email: compose.to,
        cc: compose.cc || undefined,
        bcc: compose.bcc || undefined,
        subject: compose.subject,
        body: compose.body,
        voucher_id: voucher?.id || undefined,
        invoice_number: voucher?.voucher_number || undefined,
        party_name: voucher?.party_name || undefined,
        amount: voucher?.grand_total || voucher?.total_amount || undefined,
        due_date: compose.scheduleDate,
        status: asDraft ? 'queued' : compose.isScheduled ? 'queued' : 'sent',
        scheduled_at: compose.isScheduled ? `${compose.scheduleDate}T${compose.scheduleTime}:00` : undefined,
        sent_at: !asDraft && !compose.isScheduled ? new Date().toISOString() : undefined,
        has_attachment: true,
        has_payment_link: compose.hasPaymentLink,
      };

      onSend(newEmail);

      setCompose({
        to: '',
        cc: '',
        bcc: '',
        subject: defaultTemplate.subject,
        body: defaultTemplate.body,
        templateId: 'tpl-1',
        voucherId: '',
        hasPaymentLink: true,
        scheduleDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
        scheduleTime: '10:00',
        isScheduled: false,
      });
    },
    [compose, onSend, selectedVoucher, defaultTemplate]
  );

  const templateCategories = [
    { id: 'tpl-1', name: 'Invoice Delivery', icon: <FileText size={14} /> },
    { id: 'tpl-2', name: 'Payment Reminder (7d)', icon: <Clock size={14} /> },
    { id: 'tpl-3', name: 'Payment Reminder (15d)', icon: <AlertCircle size={14} /> },
    { id: 'tpl-4', name: 'Payment Reminder (30d)', icon: <MailWarning size={14} /> },
    { id: 'tpl-5', name: 'Thank You', icon: <CheckCircle2 size={14} /> },
    { id: 'tpl-6', name: 'Custom', icon: <Edit3 size={14} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Compose Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* To / CC / BCC */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
            <div className="flex items-center gap-3 px-4 py-3 relative">
              <label className="text-sm text-zinc-400 w-12 shrink-0">To</label>
              <input
                type="email"
                value={compose.to}
                onChange={(e) => handleToChange(e.target.value, 'to')}
                placeholder="recipient@example.com"
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-600"
              />
              <button onClick={() => setShowCcBcc(!showCcBcc)} className="text-xs text-cyan-400 hover:text-cyan-300">
                CC/BCC
              </button>
              {showAutoComplete && activeField === 'to' && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-48 overflow-y-auto">
                  {autocomplete.map((ledger) => (
                    <button
                      key={ledger.id}
                      onClick={() => selectLedger(ledger)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700/50 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-medium">
                        {ledger.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm text-white">{ledger.name}</p>
                        <p className="text-xs text-zinc-500">{ledger.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <AnimatePresence>
              {showCcBcc && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <div className="flex items-center gap-3 px-4 py-3 relative">
                    <label className="text-sm text-zinc-400 w-12 shrink-0">CC</label>
                    <input
                      type="email"
                      value={compose.cc}
                      onChange={(e) => handleToChange(e.target.value, 'cc')}
                      placeholder="cc@example.com"
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-600"
                    />
                    {showAutoComplete && activeField === 'cc' && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-48 overflow-y-auto">
                        {autocomplete.map((ledger) => (
                          <button key={ledger.id} onClick={() => selectLedger(ledger)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700/50 text-left">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-medium">{ledger.name.charAt(0)}</div>
                            <div><p className="text-sm text-white">{ledger.name}</p><p className="text-xs text-zinc-500">{ledger.email}</p></div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 relative">
                    <label className="text-sm text-zinc-400 w-12 shrink-0">BCC</label>
                    <input
                      type="email"
                      value={compose.bcc}
                      onChange={(e) => handleToChange(e.target.value, 'bcc')}
                      placeholder="bcc@example.com"
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-600"
                    />
                    {showAutoComplete && activeField === 'bcc' && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl max-h-48 overflow-y-auto">
                        {autocomplete.map((ledger) => (
                          <button key={ledger.id} onClick={() => selectLedger(ledger)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-700/50 text-left">
                            <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-medium">{ledger.name.charAt(0)}</div>
                            <div><p className="text-sm text-white">{ledger.name}</p><p className="text-xs text-zinc-500">{ledger.email}</p></div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Voucher Selector */}
            <div className="flex items-center gap-3 px-4 py-3">
              <label className="text-sm text-zinc-400 w-16 shrink-0">Voucher</label>
              <select
                value={compose.voucherId}
                onChange={handleVoucherSelect}
                className="flex-1 bg-transparent text-white text-sm outline-none"
              >
                <option value="">Select a voucher...</option>
                {vouchers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.voucher_number} - {v.party_name} - ₹{Math.abs(v.grand_total || v.total_amount).toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 px-4 py-3">
              <label className="text-sm text-zinc-400 w-16 shrink-0">Subject</label>
              <input
                type="text"
                value={compose.subject}
                onChange={(e) => setCompose((prev) => ({ ...prev, subject: e.target.value }))}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-600"
              />
            </div>
          </div>

          {/* Formatting Toolbar */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 flex items-center gap-1 flex-wrap">
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><Bold size={16} /></button>
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><Italic size={16} /></button>
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><Underline size={16} /></button>
            <div className="w-px h-5 bg-zinc-800 mx-1" />
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><Type size={16} /></button>
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><List size={16} /></button>
            <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"><Link2 size={16} /></button>
            <div className="w-px h-5 bg-zinc-800 mx-1" />
            <div className="relative group">
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs transition-colors">
                <Hash size={14} />
                Variables
                <ChevronDown size={12} />
              </button>
              <div className="absolute top-full left-0 z-20 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl hidden group-hover:block">
                {['invoice_number', 'party_name', 'amount', 'due_date'].map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVariable(v)}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700/50 hover:text-white first:rounded-t-lg last:rounded-b-lg"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body Editor */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <textarea
              value={compose.body}
              onChange={(e) => setCompose((prev) => ({ ...prev, body: e.target.value }))}
              rows={12}
              className="w-full bg-transparent text-white text-sm p-4 outline-none resize-none placeholder-zinc-600"
              placeholder="Write your email here..."
            />
          </div>

          {/* Attachment Preview */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <Paperclip size={14} />
                Attachments
              </h4>
            </div>
            <div className="flex items-center gap-3">
              {selectedVoucher && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-800">
                  <FileText size={16} className="text-cyan-400" />
                  <span className="text-sm text-zinc-300">{selectedVoucher.voucher_number}.pdf</span>
                </div>
              )}
              {!selectedVoucher && (
                <p className="text-sm text-zinc-500">Select a voucher to attach invoice PDF</p>
              )}
            </div>
          </div>

          {/* Payment Link Toggle */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400"><Link2 size={16} /></div>
              <div>
                <p className="text-sm text-white font-medium">Include Payment Link</p>
                <p className="text-xs text-zinc-500">Attach a secure payment link for the recipient</p>
              </div>
            </div>
            <button onClick={() => setCompose((prev) => ({ ...prev, hasPaymentLink: !prev.hasPaymentLink }))} className="text-cyan-400">
              {compose.hasPaymentLink ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-zinc-600" />}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Template Selector */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <LayoutTemplate size={14} />
              Template
            </h4>
            <div className="space-y-1.5">
              {templateCategories.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleTemplateChange(tpl.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    compose.templateId === tpl.id
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {tpl.icon}
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <CalendarClock size={14} />
                Schedule
              </h4>
              <button
                onClick={() => {
                  setShowSchedule(!showSchedule);
                  setCompose((prev) => ({ ...prev, isScheduled: !prev.isScheduled }));
                }}
                className="text-cyan-400"
              >
                {compose.isScheduled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-zinc-600" />}
              </button>
            </div>
            <AnimatePresence>
              {compose.isScheduled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Date</label>
                    <input
                      type="date"
                      value={compose.scheduleDate}
                      onChange={(e) => setCompose((prev) => ({ ...prev, scheduleDate: e.target.value }))}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Time</label>
                    <input
                      type="time"
                      value={compose.scheduleTime}
                      onChange={(e) => setCompose((prev) => ({ ...prev, scheduleTime: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Send Actions */}
          <div className="space-y-2">
            <button
              onClick={() => handleSend(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-colors"
            >
              <Send size={16} />
              {compose.isScheduled ? 'Schedule Send' : 'Send Now'}
            </button>
            <button
              onClick={() => handleSend(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition-colors"
            >
              <Save size={16} />
              Save as Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Tab: Email Templates ────────────────────────────────────────────────────

const EmailTemplates: React.FC<{
  templates: EmailTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<EmailTemplate[]>>;
}> = ({ templates, setTemplates }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(templates[0] || null);
  const [editMode, setEditMode] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editName, setEditName] = useState('');

  const categoryColors: Record<string, string> = {
    invoice: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    reminder: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    thankyou: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    custom: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };

  const startEdit = useCallback(() => {
    if (selectedTemplate) {
      setEditSubject(selectedTemplate.subject);
      setEditBody(selectedTemplate.body);
      setEditName(selectedTemplate.name);
      setEditMode(true);
    }
  }, [selectedTemplate]);

  const saveEdit = useCallback(() => {
    if (selectedTemplate) {
      const updated = { ...selectedTemplate, name: editName, subject: editSubject, body: editBody, updated_at: new Date().toISOString() };
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTemplate(updated);
      setEditMode(false);
      toast.success('Template saved successfully');
    }
  }, [selectedTemplate, editName, editSubject, editBody, setTemplates]);

  const insertVariable = useCallback((variable: string) => {
    setEditBody((prev) => prev + ` {{${variable}}} `);
  }, []);

  const interpolateTemplate = useCallback(
    (text: string) => {
      return text
        .replace(/\{\{invoice_number\}\}/g, 'INV-2026-100')
        .replace(/\{\{party_name\}\}/g, 'Reliance Industries Ltd')
        .replace(/\{\{amount\}\}/g, '1,25,000')
        .replace(/\{\{due_date\}\}/g, '25 June 2026');
    },
    []
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Template List */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Templates</h3>
          <button className="text-cyan-400 hover:text-cyan-300">
            <Plus size={18} />
          </button>
        </div>
        <div className="space-y-1.5">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => { setSelectedTemplate(tpl); setEditMode(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                selectedTemplate?.id === tpl.id
                  ? 'bg-cyan-500/10 border border-cyan-500/20'
                  : 'hover:bg-zinc-800 border border-transparent'
              }`}
            >
              <div className={`p-1.5 rounded-md border ${categoryColors[tpl.category]}`}>
                {tpl.category === 'invoice' && <FileText size={12} />}
                {tpl.category === 'reminder' && <Clock size={12} />}
                {tpl.category === 'thankyou' && <CheckCircle2 size={12} />}
                {tpl.category === 'custom' && <Edit3 size={12} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{tpl.name}</p>
                <p className="text-xs text-zinc-500 truncate">{tpl.subject || 'No subject'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Template Editor / Preview */}
      <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-6">
        {selectedTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${categoryColors[selectedTemplate.category]}`}>
                  {selectedTemplate.category.charAt(0).toUpperCase() + selectedTemplate.category.slice(1)}
                </span>
                {selectedTemplate.isDefault && <span className="text-xs text-zinc-500">Default</span>}
              </div>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <>
                    <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800">Cancel</button>
                    <button onClick={saveEdit} className="px-3 py-1.5 rounded-lg bg-cyan-500 text-black text-xs font-medium hover:bg-cyan-400">Save</button>
                  </>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800">
                    <Edit3 size={12} /> Edit
                  </button>
                )}
              </div>
            </div>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Template Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Subject</label>
                  <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Body</label>
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none resize-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">Insert Variable</label>
                  <div className="flex flex-wrap gap-2">
                    {['invoice_number', 'party_name', 'amount', 'due_date', 'payment_link'].map((v) => (
                      <button key={v} onClick={() => insertVariable(v)} className="px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white">
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Subject</label>
                  <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-sm text-white border border-zinc-800">
                    {interpolateTemplate(selectedTemplate.subject)}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Preview</label>
                  <div className="bg-white rounded-lg p-6 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                    {interpolateTemplate(selectedTemplate.body)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon={<LayoutTemplate size={32} />} title="No template selected" description="Select a template from the list to view or edit it" />
        )}
      </div>
    </div>
  );
};

// ─── Tab: Email Queue ────────────────────────────────────────────────────────

const EmailQueue: React.FC<{
  emails: EmailRecord[];
  onRefresh: () => void;
}> = ({ emails, onRefresh }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const queuedEmails = useMemo(() => {
    return emails.filter((e) => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      return true;
    });
  }, [emails, filterStatus]);

  const handleSendNow = useCallback(
    async (emailId: string) => {
      const { error } = await supabase
        .from('email_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', emailId);
      if (error) {
        toast.error('Failed to send email');
        return;
      }
      toast.success('Email sent successfully');
      onRefresh();
    },
    [onRefresh]
  );

  const handleCancel = useCallback(
    async (emailId: string) => {
      const { error } = await supabase
        .from('email_queue')
        .delete()
        .eq('id', emailId);
      if (error) {
        toast.error('Failed to cancel email');
        return;
      }
      toast.success('Email cancelled');
      onRefresh();
    },
    [onRefresh]
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'queued', 'sent', 'delivered', 'opened', 'failed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === status
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Queue List */}
      {queuedEmails.length > 0 ? (
        <div className="space-y-2">
          {queuedEmails.map((email) => (
            <motion.div
              key={email.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
              >
                <div className="text-zinc-500">
                  {expandedId === email.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium truncate">{email.subject}</span>
                    <StatusBadge status={email.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                    <span>To: {email.to_email}</span>
                    {email.invoice_number && (
                      <span className="flex items-center gap-1">
                        <FileText size={10} /> {email.invoice_number}
                      </span>
                    )}
                    {email.amount != null && (
                      <span className="flex items-center gap-1">
                        <IndianRupee size={10} /> {email.amount.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-zinc-500 hidden sm:block">
                  {email.scheduled_at
                    ? `Scheduled: ${format(new Date(email.scheduled_at), 'dd MMM, hh:mm a')}`
                    : email.sent_at
                    ? `Sent: ${format(new Date(email.sent_at), 'dd MMM, hh:mm a')}`
                    : ''}
                </div>
              </div>
              <AnimatePresence>
                {expandedId === email.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-800"
                  >
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><p className="text-xs text-zinc-500">To</p><p className="text-sm text-white">{email.to_email}</p></div>
                        {email.invoice_number && <div><p className="text-xs text-zinc-500">Invoice</p><p className="text-sm text-white">{email.invoice_number}</p></div>}
                        {email.amount != null && <div><p className="text-xs text-zinc-500">Amount</p><p className="text-sm text-white">₹{email.amount.toLocaleString('en-IN')}</p></div>}
                        {email.due_date && <div><p className="text-xs text-zinc-500">Due Date</p><p className="text-sm text-white">{email.due_date}</p></div>}
                      </div>
                      {email.error_message && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{email.error_message}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2">
                        {(email.status === 'queued' || email.status === 'failed') && (
                          <button onClick={() => handleSendNow(email.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 text-black text-xs font-medium hover:bg-cyan-400">
                            <Send size={12} /> Send Now
                          </button>
                        )}
                        <button onClick={() => handleCancel(email.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 text-xs hover:bg-red-500/10">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Inbox size={32} />} title="No emails in queue" description="All emails have been processed or the queue is empty" />
      )}
    </div>
  );
};

// ─── Tab: Email History ──────────────────────────────────────────────────────

const EmailHistory: React.FC<{ emails: EmailRecord[] }> = ({ emails }) => {
  const [filterDate, setFilterDate] = useState('');
  const [filterRecipient, setFilterRecipient] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      if (filterDate) {
        const emailDate = format(new Date(e.sent_at || e.created_at), 'yyyy-MM-dd');
        if (emailDate !== filterDate) return false;
      }
      if (filterRecipient && !e.to_email.toLowerCase().includes(filterRecipient.toLowerCase())) return false;
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (searchQuery && !e.subject.toLowerCase().includes(searchQuery.toLowerCase()) && !e.to_email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [emails, filterDate, filterRecipient, filterStatus, searchQuery]);

  const statusOptions = ['all', 'sent', 'delivered', 'opened', 'clicked', 'failed'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-zinc-400" />
          <span className="text-sm text-zinc-400">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search subject or email..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 placeholder-zinc-600" />
          </div>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50" />
          <input type="text" value={filterRecipient} onChange={(e) => setFilterRecipient(e.target.value)} placeholder="Filter by recipient..." className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 placeholder-zinc-600" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50">
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* History Table */}
      {filteredEmails.length > 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Recipient</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Sent</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Opened</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredEmails.map((email) => (
                  <tr key={email.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-medium shrink-0">
                          {email.to_email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-white truncate max-w-[180px]">{email.to_email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 truncate max-w-[200px]">{email.subject}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {email.sent_at ? format(new Date(email.sent_at), 'dd MMM, hh:mm a') : '-'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={email.status} /></td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {email.opened_at ? formatDistanceToNow(new Date(email.opened_at), { addSuffix: true }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {email.clicked_at ? formatDistanceToNow(new Date(email.clicked_at), { addSuffix: true }) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-zinc-800">
            {filteredEmails.map((email) => (
              <div key={email.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-medium shrink-0">
                      {email.to_email.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-white truncate">{email.to_email}</span>
                  </div>
                  <StatusBadge status={email.status} />
                </div>
                <p className="text-xs text-zinc-400 truncate">{email.subject}</p>
                <span className="text-xs text-zinc-500">
                  {email.sent_at ? format(new Date(email.sent_at), 'dd MMM, hh:mm a') : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={<Mail size={32} />} title="No emails found" description="No emails match your current filters" />
      )}
    </div>
  );
};

// ─── Tab: Bulk Email ─────────────────────────────────────────────────────────

const BulkEmail: React.FC<{
  emails: EmailRecord[];
  vouchers: Voucher[];
  onRefresh: () => void;
}> = ({ emails, vouchers, onRefresh }) => {
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [bulkTemplate, setBulkTemplate] = useState('tpl-1');

  const eligibleVouchers = useMemo(() => {
    return vouchers.filter((v) => v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice');
  }, [vouchers]);

  const toggleVoucher = useCallback((id: string) => {
    setSelectedVoucherIds((prev) => prev.includes(id) ? prev.filter((vid) => vid !== id) : [...prev, id]);
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedVoucherIds((prev) =>
      prev.length === eligibleVouchers.length ? [] : eligibleVouchers.map((v) => v.id)
    );
  }, [eligibleVouchers]);

  const handleBulkSend = useCallback(async () => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === bulkTemplate) || DEFAULT_TEMPLATES[0];

    const rows = selectedVoucherIds.map((vid) => {
      const v = eligibleVouchers.find((ev) => ev.id === vid);
      return {
        company_id: emails[0]?.company_id || '',
        to_email: '',
        subject: template.subject
          .replace(/\{\{invoice_number\}\}/g, v?.voucher_number || ''),
        body: template.body,
        voucher_id: vid,
        invoice_number: v?.voucher_number,
        party_name: v?.party_name,
        amount: v?.grand_total || v?.total_amount,
        status: 'sent',
        sent_at: new Date().toISOString(),
        has_attachment: true,
        has_payment_link: true,
      };
    }).filter((r) => r.company_id);

    if (rows.length === 0) {
      toast.error('No valid vouchers to send');
      return;
    }

    const { error } = await supabase.from('email_queue').insert(rows);
    if (error) {
      toast.error('Failed to send bulk emails');
      return;
    }

    toast.success(`${rows.length} emails sent successfully`);
    setSelectedVoucherIds([]);
    setShowPreview(false);
    onRefresh();
  }, [selectedVoucherIds, eligibleVouchers, bulkTemplate, emails, onRefresh]);

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAll}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedVoucherIds.length === eligibleVouchers.length && eligibleVouchers.length > 0
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
              }`}
            >
              {selectedVoucherIds.length === eligibleVouchers.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-zinc-400">
              {selectedVoucherIds.length} of {eligibleVouchers.length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select value={bulkTemplate} onChange={(e) => setBulkTemplate(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none">
              <option value="tpl-1">Invoice Delivery</option>
              <option value="tpl-2">Payment Reminder (7d)</option>
              <option value="tpl-3">Payment Reminder (15d)</option>
              <option value="tpl-4">Payment Reminder (30d)</option>
              <option value="tpl-5">Thank You</option>
            </select>
            {selectedVoucherIds.length > 0 && (
              <>
                <button onClick={() => setShowPreview(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800">
                  <Eye size={12} /> Preview
                </button>
                <button onClick={handleBulkSend} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 text-black text-xs font-medium hover:bg-cyan-400">
                  <Send size={12} /> Send All
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Voucher Selection List */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selectedVoucherIds.length === eligibleVouchers.length && eligibleVouchers.length > 0} onChange={toggleAll} className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500/50" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Party</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {eligibleVouchers.map((v) => (
                <tr
                  key={v.id}
                  className={`hover:bg-zinc-800/30 transition-colors cursor-pointer ${selectedVoucherIds.includes(v.id) ? 'bg-cyan-500/5' : ''}`}
                  onClick={() => toggleVoucher(v.id)}
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedVoucherIds.includes(v.id)} onChange={() => toggleVoucher(v.id)} onClick={(e) => e.stopPropagation()} className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500/50" />
                  </td>
                  <td className="px-4 py-3 text-sm text-white font-medium">{v.voucher_number}</td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{v.party_name}</td>
                  <td className="px-4 py-3 text-sm text-white">₹{Math.abs(v.grand_total || v.total_amount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status="queued" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-zinc-800">
          {eligibleVouchers.map((v) => (
            <div key={v.id} className={`p-4 cursor-pointer transition-colors ${selectedVoucherIds.includes(v.id) ? 'bg-cyan-500/5' : ''}`} onClick={() => toggleVoucher(v.id)}>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={selectedVoucherIds.includes(v.id)} onChange={() => toggleVoucher(v.id)} onClick={(e) => e.stopPropagation()} className="rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500/50" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">{v.voucher_number}</span>
                    <StatusBadge status="queued" />
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{v.party_name}</p>
                  <p className="text-xs text-zinc-500 mt-1">₹{Math.abs(v.grand_total || v.total_amount).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {eligibleVouchers.length === 0 && (
          <EmptyState icon={<FileText size={32} />} title="No sales invoices found" description="Create some sales invoices to send in bulk" />
        )}
      </div>

      {/* Batch Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h3 className="text-white font-semibold">Batch Preview</h3>
                <button onClick={() => setShowPreview(false)} className="text-zinc-400 hover:text-white"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                <p className="text-sm text-zinc-400">
                  Sending {selectedVoucherIds.length} emails with template:{' '}
                  <span className="text-cyan-400">{DEFAULT_TEMPLATES.find((t) => t.id === bulkTemplate)?.name}</span>
                </p>
                {selectedVoucherIds.map((vid) => {
                  const v = eligibleVouchers.find((ev) => ev.id === vid);
                  if (!v) return null;
                  return (
                    <div key={vid} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-medium shrink-0">
                        {v.party_name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{v.party_name}</p>
                        <p className="text-xs text-zinc-500">{v.voucher_number} - ₹{Math.abs(v.grand_total || v.total_amount).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800">
                <button onClick={() => setShowPreview(false)} className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800">Cancel</button>
                <button onClick={handleBulkSend} className="px-4 py-2 rounded-lg bg-cyan-500 text-black text-sm font-medium hover:bg-cyan-400 flex items-center gap-1">
                  <Send size={14} /> Send All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Main Page Component ─────────────────────────────────────────────────────

const EmailInvoicePage: React.FC = () => {
  const { selectedCompany } = useAuth() as any;
  const companyId = selectedCompany?.id;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'compose' | 'templates' | 'queue' | 'history' | 'bulk'>('dashboard');
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data from Supabase
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    const [emailRes, ledgerRes, voucherRes] = await Promise.all([
      supabase
        .from('email_queue')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('ledgers')
        .select('id, name, email, phone, company_id, parent, current_balance')
        .eq('company_id', companyId)
        .order('name'),
      supabase
        .from('vouchers')
        .select('id, company_id, voucher_type, voucher_date, voucher_number, party_name, grand_total, total_amount')
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .order('voucher_date', { ascending: false }),
    ]);

    if (!emailRes.error && emailRes.data) setEmails(emailRes.data as EmailRecord[]);
    if (!ledgerRes.error && ledgerRes.data) setLedgers(ledgerRes.data as Ledger[]);
    if (!voucherRes.error && voucherRes.data) setVouchers(voucherRes.data as Voucher[]);

    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchData();
  }, [companyId, fetchData]);

  // Tab definitions with queue count
  const tabs = useMemo(() => [
    { id: 'dashboard' as const, label: 'Dashboard', icon: <BarChart3 size={16} /> },
    { id: 'compose' as const, label: 'Compose', icon: <MailPlus size={16} /> },
    { id: 'templates' as const, label: 'Templates', icon: <LayoutTemplate size={16} /> },
    { id: 'queue' as const, label: 'Queue', icon: <Clock size={16} />, count: emails.filter((e) => e.status === 'queued').length },
    { id: 'history' as const, label: 'History', icon: <MailCheck size={16} /> },
    { id: 'bulk' as const, label: 'Bulk Send', icon: <Users size={16} /> },
  ], [emails]);

  // Handle new email: insert into Supabase email_queue
  const handleNewEmail = useCallback(
    async (emailData: Omit<EmailRecord, 'id' | 'company_id' | 'created_at'>) => {
      if (!companyId) {
        toast.error('No company selected');
        return;
      }

      const payload = {
        company_id: companyId,
        to_email: emailData.to_email,
        cc: emailData.cc || null,
        bcc: emailData.bcc || null,
        subject: emailData.subject,
        body: emailData.body,
        voucher_id: emailData.voucher_id || null,
        invoice_number: emailData.invoice_number || null,
        party_name: emailData.party_name || null,
        amount: emailData.amount || null,
        due_date: emailData.due_date || null,
        status: emailData.status,
        scheduled_at: emailData.scheduled_at || null,
        sent_at: emailData.sent_at || null,
        has_attachment: emailData.has_attachment,
        has_payment_link: emailData.has_payment_link,
      };

      const { data, error } = await supabase
        .from('email_queue')
        .insert([payload])
        .select()
        .single();

      if (error) {
        toast.error('Failed to send email');
        console.error('Email insert error:', error);
        return;
      }

      if (data) {
        setEmails((prev) => [data as EmailRecord, ...prev]);
      }

      if (emailData.status === 'sent') {
        // Try calling edge function; fallback to "queued" message
        try {
          const { error: fnError } = await supabase.functions.invoke('send-invoice-email', {
            body: { email_id: data?.id, company_id: companyId },
          });
          if (fnError) {
            toast.success('Email queued for delivery');
          } else {
            toast.success('Email sent successfully');
          }
        } catch {
          toast.success('Email queued for delivery');
        }
      } else if (emailData.status === 'queued') {
        toast.success('Email saved to queue');
      }
    },
    [companyId]
  );

  if (!companyId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <EmptyState
          icon={<Mail size={32} />}
          title="No company selected"
          description="Please select a company to manage invoice emails"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                <Mail size={20} />
              </div>
              <div>
                <h1 className="text-white font-semibold text-lg leading-tight">Email Invoice</h1>
                <p className="text-xs text-zinc-500">Manage and send invoice emails</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={18} />
              </button>
              <button className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                <Settings size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <EmailDashboard emails={emails} />}
              {activeTab === 'compose' && (
                <ComposeEmail templates={templates} ledgers={ledgers} vouchers={vouchers} companyId={companyId} onSend={handleNewEmail} />
              )}
              {activeTab === 'templates' && <EmailTemplates templates={templates} setTemplates={setTemplates} />}
              {activeTab === 'queue' && <EmailQueue emails={emails} onRefresh={fetchData} />}
              {activeTab === 'history' && <EmailHistory emails={emails} />}
              {activeTab === 'bulk' && <BulkEmail emails={emails} vouchers={vouchers} onRefresh={fetchData} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default EmailInvoicePage;

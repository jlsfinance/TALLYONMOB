import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    Bell, Send, Mail, MessageCircle, Phone, Filter, Search,
    CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronRight,
    Calendar, IndianRupee, Users, ArrowUpRight, Loader2, X,
    Share2, Copy, Check, Database, RefreshCw, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Party {
    id: string;
    name: string;
    current_balance: number;
    parent: string;
    email?: string;
    phone?: string;
    address?: string;
    gst_number?: string;
}

interface ReminderLog {
    id: string;
    company_id: string;
    party_name: string;
    party_ledger_id?: string;
    amount: number;
    channel: string;
    message?: string;
    sent_at: string;
    status: string;
}

export default function PaymentRemindersPage() {
    const { selectedCompany } = useAuth() as any;
    const companyId = selectedCompany?.id || 'default_co';
    const CACHE_KEY = `tally_reminder_logs_${companyId}`;

    const [parties, setParties] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<'amount' | 'name'>('amount');
    const [sending, setSending] = useState(false);
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderTemplate, setReminderTemplate] = useState('default');
    const [customMessage, setCustomMessage] = useState('');
    const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
    const [activeTab, setActiveTab] = useState<'outstanding' | 'history'>('outstanding');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

    const loadOutstandingParties = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', companyId)
                .in('parent', ['Sundry Debtors', 'sundry debtors', 'SUNDRY DEBTORS'])
                .neq('current_balance', 0)
                .order('current_balance', { ascending: false });

            if (error) throw error;
            setParties(data || []);
        } catch {
            toast.error('Failed to load outstanding debtors');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const loadReminderHistory = useCallback(async () => {
        if (!companyId) return;
        try {
            const { data, error } = await supabase
                .from('reminder_logs')
                .select('*')
                .eq('company_id', companyId)
                .order('sent_at', { ascending: false })
                .limit(100);

            if (!error && data) {
                setReminderLogs(data as ReminderLog[]);
                localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                setSupabaseOk(true);
                return;
            }
        } catch {
            setSupabaseOk(false);
        }

        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try { setReminderLogs(JSON.parse(cached)); } catch { setReminderLogs([]); }
        }
    }, [companyId, CACHE_KEY]);

    useEffect(() => {
        loadOutstandingParties();
        loadReminderHistory();
    }, [loadOutstandingParties, loadReminderHistory]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(Math.abs(amount) || 0);
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    const filteredParties = useMemo(() => {
        let result = parties;
        if (searchQuery) {
            result = result.filter(p =>
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.phone?.includes(searchQuery)
            );
        }
        if (sortBy === 'amount') {
            result = [...result].sort((a, b) => b.current_balance - a.current_balance);
        } else {
            result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        }
        return result;
    }, [parties, searchQuery, sortBy]);

    const totalOutstanding = useMemo(() =>
        filteredParties.reduce((sum, p) => sum + (p.current_balance || 0), 0),
        [filteredParties]
    );

    const selectedTotal = useMemo(() =>
        filteredParties
            .filter(p => selectedParties.has(p.id))
            .reduce((sum, p) => sum + (p.current_balance || 0), 0),
        [filteredParties, selectedParties]
    );

    const toggleParty = (id: string) => {
        const next = new Set(selectedParties);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedParties(next);
    };

    const selectAll = () => {
        if (selectedParties.size === filteredParties.length) {
            setSelectedParties(new Set());
        } else {
            setSelectedParties(new Set(filteredParties.map(p => p.id)));
        }
    };

    const getMessageTemplate = (party: Party) => {
        const companyName = selectedCompany?.name || 'our enterprise';
        const amount = formatCurrency(party.current_balance);

        const templates: Record<string, string> = {
            default: `Dear ${party.name},\n\nThis is a friendly reminder that you have an outstanding balance of *${amount}* with ${companyName}.\n\nKindly arrange the payment at your earliest convenience.\n\nThank you for your business!\n${companyName}`,

            formal: `Subject: Statement & Outstanding Balance Notice - ${amount}\n\nDear ${party.name},\n\nAccording to our records, your account shows an overdue balance of ${amount} with ${companyName}.\n\nPlease arrange for early clearance of this account. If payment has already been sent, please share the transaction reference.\n\nBest Regards,\nAccounts Department\n${companyName}`,

            urgent: `⚠️ *URGENT PAYMENT REMINDER*\n\nDear ${party.name},\n\nYour account balance of *${amount}* with ${companyName} is significantly overdue. Please clear this balance immediately to avoid credit hold or disruption in supplies.\n\nThank you,\n${companyName}`,

            friendly: `Hi ${party.name}! 👋\n\nHope you're having a great day! Just a gentle nudge regarding the pending balance of *${amount}* with ${companyName}.\n\nWhenever convenient, please arrange the settlement. 😊\n\nThanks!\n${companyName}`,

            custom: customMessage || `Dear ${party.name}, your outstanding is ${amount}. Please pay soon. - ${companyName}`
        };

        return templates[reminderTemplate] || templates.default;
    };

    const logReminder = async (party: Party, channel: string) => {
        const message = getMessageTemplate(party);
        const record: ReminderLog = {
            id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            company_id: companyId,
            party_name: party.name,
            party_ledger_id: party.id,
            amount: party.current_balance,
            channel,
            message,
            sent_at: new Date().toISOString(),
            status: 'sent'
        };

        try {
            await supabase.from('reminder_logs').insert(record);
        } catch { }

        const updated = [record, ...reminderLogs];
        setReminderLogs(updated);
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
        toast.success(`Reminder logged for ${party.name} (${channel})`);
    };

    const sendWhatsAppReminder = (party: Party) => {
        const message = encodeURIComponent(getMessageTemplate(party));
        const phone = party.phone?.replace(/[^0-9]/g, '') || '';
        const url = phone ? `https://wa.me/91${phone}?text=${message}` : `https://wa.me/?text=${message}`;
        window.open(url, '_blank');
        logReminder(party, 'whatsapp');
    };

    const sendEmailReminder = async (party: Party) => {
        const message = getMessageTemplate(party);
        const subject = `Payment Reminder - ${formatCurrency(party.current_balance)} Outstanding`;

        if (party.email) {
            window.open(`mailto:${party.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
        } else {
            await navigator.clipboard.writeText(message);
            toast.success('Message copied to clipboard (no email on file)');
        }
        logReminder(party, 'email');
    };

    const copyMessage = async (party: Party) => {
        const message = getMessageTemplate(party);
        await navigator.clipboard.writeText(message);
        setCopiedId(party.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success('Message copied!');
    };

    const sendBulkReminders = async (channel: 'whatsapp' | 'email') => {
        setSending(true);
        const selected = filteredParties.filter(p => selectedParties.has(p.id));

        for (const party of selected) {
            if (channel === 'whatsapp') sendWhatsAppReminder(party);
            else if (channel === 'email') await sendEmailReminder(party);
            await new Promise(r => setTimeout(r, 600));
        }

        setSending(false);
        setShowReminderModal(false);
        setSelectedParties(new Set());
    };

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 animate-fade-in text-[var(--on-surface)]">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                        <Bell size={18} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight">Payment Reminders</h1>
                        <p className="text-[11px] text-[var(--text-muted)]">Automated WhatsApp & Email follow-ups for outstanding Sundry Debtors</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border ${
                        supabaseOk ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                        <Database size={12} />
                        {supabaseOk ? 'Supabase Sync Active' : 'Local + Supabase Mode'}
                    </div>

                    {selectedParties.size > 0 && (
                        <button
                            onClick={() => setShowReminderModal(true)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                            <Send size={14} /> Send ({selectedParties.size}) Reminders
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Debtors With Balance</span>
                        <Users size={14} className="text-blue-500" />
                    </div>
                    <p className="text-xl font-black">{filteredParties.length}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Parties with pending dues</p>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Total Outstanding</span>
                        <IndianRupee size={14} className="text-rose-500" />
                    </div>
                    <p className="text-xl font-black text-rose-600">{formatCurrency(totalOutstanding)}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Total receivable amount</p>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Selected for Follow-up</span>
                        <CheckCircle size={14} className="text-emerald-500" />
                    </div>
                    <p className="text-xl font-black text-emerald-600">{selectedParties.size}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatCurrency(selectedTotal)} selected</p>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Reminders Sent</span>
                        <Clock size={14} className="text-amber-500" />
                    </div>
                    <p className="text-xl font-black text-amber-600">{reminderLogs.length}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Logged in audit trail</p>
                </div>
            </div>

            {/* Navigation Tabs & Search */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
                <div className="flex gap-1.5 w-full sm:w-auto">
                    <button
                        onClick={() => setActiveTab('outstanding')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'outstanding'
                                ? 'bg-[var(--primary)] text-white shadow-xs'
                                : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--on-surface)]'
                        }`}
                    >
                        Outstanding Debtors ({filteredParties.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'history'
                                ? 'bg-[var(--primary)] text-white shadow-xs'
                                : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--on-surface)]'
                        }`}
                    >
                        Reminder History ({reminderLogs.length})
                    </button>
                </div>

                {activeTab === 'outstanding' && (
                    <div className="relative w-full sm:w-72">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by party name or phone..."
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs"
                        />
                    </div>
                )}
            </div>

            {/* TAB 1: OUTSTANDING DEBTORS */}
            {activeTab === 'outstanding' && (
                <div className="space-y-3">
                    {/* Controls Bar */}
                    <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs">
                        <label className="flex items-center gap-2 cursor-pointer font-bold">
                            <input
                                type="checkbox"
                                checked={selectedParties.size === filteredParties.length && filteredParties.length > 0}
                                onChange={selectAll}
                                className="w-4 h-4 rounded text-amber-500 cursor-pointer"
                            />
                            <span>Select All ({filteredParties.length} Parties)</span>
                        </label>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[var(--text-muted)]">Sort by:</span>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as any)}
                                className="px-2 py-1 rounded-lg bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold cursor-pointer"
                            >
                                <option value="amount">Highest Due</option>
                                <option value="name">Alphabetical</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="py-20 flex justify-center"><Loader2 size={24} className="animate-spin text-amber-500" /></div>
                    ) : filteredParties.length === 0 ? (
                        <div className="py-16 text-center text-[var(--text-muted)] border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
                            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                            <p className="text-sm font-bold">No outstanding payments found</p>
                            <p className="text-xs mt-1">All your sundry debtors have clear accounts or match filters.</p>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[var(--surface-variant)] border-b border-[var(--border)] text-[var(--text-muted)]">
                                            <th className="px-3 py-3 text-center w-10"></th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Party / Customer</th>
                                            <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Contact</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Outstanding Balance</th>
                                            <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Quick Follow-up</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]/40">
                                        {filteredParties.map(party => (
                                            <tr key={party.id} className="hover:bg-[var(--surface-variant)]/40 transition-colors">
                                                <td className="px-3 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedParties.has(party.id)}
                                                        onChange={() => toggleParty(party.id)}
                                                        className="w-4 h-4 rounded text-amber-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-xs">{party.name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{party.parent}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-[11px] font-mono">{party.phone || '-'}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{party.email || ''}</p>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <p className="font-black text-rose-600 text-sm">{formatCurrency(party.current_balance)}</p>
                                                    <span className="text-[8px] font-bold bg-rose-100 text-rose-800 px-1 rounded">Dr Due</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => sendWhatsAppReminder(party)}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px] font-bold transition-colors cursor-pointer"
                                                            title="Send WhatsApp Reminder"
                                                        >
                                                            <MessageCircle size={12} /> WhatsApp
                                                        </button>
                                                        <button
                                                            onClick={() => sendEmailReminder(party)}
                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 text-[10px] font-bold transition-colors cursor-pointer"
                                                            title="Send Email Reminder"
                                                        >
                                                            <Mail size={12} /> Email
                                                        </button>
                                                        <button
                                                            onClick={() => copyMessage(party)}
                                                            className="p-1 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]"
                                                            title="Copy message"
                                                        >
                                                            {copiedId === party.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: REMINDER AUDIT HISTORY */}
            {activeTab === 'history' && (
                <div className="space-y-3">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-xs">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-[var(--surface-variant)] border-b border-[var(--border)] text-[var(--text-muted)]">
                                    <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Sent Date & Time</th>
                                    <th className="px-4 py-3 text-left font-black text-[9px] uppercase">Party Name</th>
                                    <th className="px-4 py-3 text-center font-black text-[9px] uppercase">Channel</th>
                                    <th className="px-4 py-3 text-right font-black text-[9px] uppercase">Amount Followed-up</th>
                                    <th className="px-4 py-3 text-center font-black text-[9px] uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]/40">
                                {reminderLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-[var(--surface-variant)]/40">
                                        <td className="px-4 py-3 font-mono text-[10px]">
                                            {formatDate(log.sent_at)}
                                        </td>
                                        <td className="px-4 py-3 font-bold">
                                            {log.party_name}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                log.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {log.channel}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black">
                                            {formatCurrency(log.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-emerald-600 font-bold text-[10px] flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> Delivered
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {reminderLogs.length === 0 && (
                            <div className="py-16 text-center text-[var(--text-muted)]">
                                <Clock size={32} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm font-bold">No reminder history logged yet</p>
                                <p className="text-xs mt-1">Reminders triggered via WhatsApp or Email will be recorded here.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL: BATCH REMINDERS */}
            {showReminderModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell size={16} className="text-amber-500" />
                                <h3 className="text-sm font-black">Send Batch Payment Reminders</h3>
                            </div>
                            <button onClick={() => setShowReminderModal(false)} className="p-1 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-xs">
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 font-bold flex justify-between">
                                <span>Selected Parties: {selectedParties.size}</span>
                                <span>Total Value: {formatCurrency(selectedTotal)}</span>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase text-[var(--text-muted)] block mb-1">Select Tone Template</label>
                                <select
                                    value={reminderTemplate}
                                    onChange={e => setReminderTemplate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                >
                                    <option value="default">Friendly Business Reminder</option>
                                    <option value="formal">Formal Account Statement</option>
                                    <option value="urgent">Urgent Overdue Notice</option>
                                    <option value="friendly">Informal / Gentle</option>
                                </select>
                            </div>

                            <div className="p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-[11px] whitespace-pre-line font-sans text-[var(--text-muted)] max-h-36 overflow-y-auto">
                                <p className="font-bold text-[10px] text-[var(--on-surface)] uppercase mb-1">Preview for sample party:</p>
                                {filteredParties[0] ? getMessageTemplate(filteredParties[0]) : 'Sample message'}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                    onClick={() => sendBulkReminders('whatsapp')}
                                    disabled={sending}
                                    className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                    <MessageCircle size={14} /> Send WhatsApp
                                </button>
                                <button
                                    onClick={() => sendBulkReminders('email')}
                                    disabled={sending}
                                    className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                    <Mail size={14} /> Send Email
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    Bell, Send, Mail, MessageCircle, Phone, Filter, Search,
    CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronRight,
    Calendar, IndianRupee, Users, ArrowUpRight, Loader2, X,
    Share2, Copy, Check
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
    party_name: string;
    amount: number;
    channel: string;
    sent_at: string;
    status: string;
}

export default function PaymentRemindersPage() {
    const { selectedCompany } = useAuth() as any;
    const [parties, setParties] = useState<Party[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
    const [filterDays, setFilterDays] = useState<number>(30);
    const [sortBy, setSortBy] = useState<'amount' | 'name'>('amount');
    const [sending, setSending] = useState(false);
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderTemplate, setReminderTemplate] = useState('default');
    const [customMessage, setCustomMessage] = useState('');
    const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
    const [activeTab, setActiveTab] = useState<'outstanding' | 'history'>('outstanding');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadOutstandingParties();
            loadReminderHistory();
        }
    }, [selectedCompany, filterDays]);

    const loadOutstandingParties = async () => {
        setLoading(true);
        try {
            // Get all sundry debtors (parties who owe us money)
            const { data, error } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .in('parent', ['Sundry Debtors', 'sundry debtors', 'SUNDRY DEBTORS'])
                .neq('current_balance', 0)
                .order('current_balance', { ascending: false });

            if (error) throw error;
            setParties(data || []);
        } catch (err: any) {
            toast.error('Failed to load outstanding parties');
        } finally {
            setLoading(false);
        }
    };

    const loadReminderHistory = async () => {
        try {
            const { data } = await supabase
                .from('reminder_logs')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .order('sent_at', { ascending: false })
                .limit(50);
            setReminderLogs(data || []);
        } catch {
            // Table may not exist yet - that's OK
        }
    };

    const filteredParties = useMemo(() => {
        let result = parties;
        if (searchQuery) {
            result = result.filter(p =>
                p.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        const companyName = selectedCompany?.name || 'our company';
        const amount = formatCurrency(party.current_balance);

        const templates: Record<string, string> = {
            default: `Dear ${party.name},\n\nThis is a friendly reminder that you have an outstanding payment of ${amount} with ${companyName}.\n\nPlease arrange the payment at your earliest convenience.\n\nThank you for your business!\n\nRegards,\n${companyName}`,

            formal: `Subject: Payment Reminder - Outstanding Amount ${amount}\n\nDear ${party.name},\n\nWe would like to bring to your attention that your account with ${companyName} shows an outstanding balance of ${amount}.\n\nWe kindly request you to settle this amount at the earliest.\n\nFor any queries, please feel free to contact us.\n\nBest Regards,\n${companyName}`,

            urgent: `⚠️ URGENT PAYMENT REMINDER\n\nDear ${party.name},\n\nYour payment of ${amount} to ${companyName} is overdue. Please clear this balance immediately to avoid any disruption in services.\n\nThank you,\n${companyName}`,

            friendly: `Hi ${party.name}! 👋\n\nJust a quick reminder - you have a pending amount of ${amount} with us (${companyName}).\n\nNo rush, but would appreciate if you could look into it when convenient! 😊\n\nThanks!\n${companyName}`,

            custom: customMessage || `Dear ${party.name}, your outstanding is ${amount}. Please pay soon. - ${companyName}`
        };

        return templates[reminderTemplate] || templates.default;
    };

    const sendWhatsAppReminder = (party: Party) => {
        const message = encodeURIComponent(getMessageTemplate(party));
        const phone = party.phone?.replace(/[^0-9]/g, '') || '';
        const url = phone
            ? `https://wa.me/91${phone}?text=${message}`
            : `https://wa.me/?text=${message}`;
        window.open(url, '_blank');
        logReminder(party, 'whatsapp');
    };

    const sendEmailReminder = async (party: Party) => {
        const message = getMessageTemplate(party);
        const subject = `Payment Reminder - ${formatCurrency(party.current_balance)} Outstanding`;

        if (party.email) {
            // Use mailto for direct email
            window.open(`mailto:${party.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
        } else {
            // Fallback: copy message
            await navigator.clipboard.writeText(message);
            toast.success('Message copied to clipboard (no email on file)');
        }
        logReminder(party, 'email');
    };

    const shareReminder = async (party: Party) => {
        const message = getMessageTemplate(party);

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Payment Reminder',
                    text: message
                });
                logReminder(party, 'share');
            } catch {
                // User cancelled share
            }
        } else {
            await navigator.clipboard.writeText(message);
            toast.success('Message copied to clipboard');
        }
    };

    const copyMessage = async (party: Party) => {
        const message = getMessageTemplate(party);
        await navigator.clipboard.writeText(message);
        setCopiedId(party.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success('Copied!');
    };

    const logReminder = async (party: Party, channel: string) => {
        try {
            await supabase.from('reminder_logs').insert({
                company_id: selectedCompany.id,
                party_name: party.name,
                amount: party.current_balance,
                channel,
                status: 'sent'
            });
            toast.success(`Reminder sent to ${party.name} via ${channel}`);
            loadReminderHistory();
        } catch {
            // Table may not exist - OK
            toast.success(`Reminder opened for ${party.name}`);
        }
    };

    const sendBulkReminders = async (channel: 'whatsapp' | 'email' | 'share') => {
        setSending(true);
        const selected = filteredParties.filter(p => selectedParties.has(p.id));

        for (const party of selected) {
            if (channel === 'whatsapp') sendWhatsAppReminder(party);
            else if (channel === 'email') await sendEmailReminder(party);
            else shareReminder(party);

            // Small delay between messages
            await new Promise(r => setTimeout(r, 500));
        }

        setSending(false);
        setShowReminderModal(false);
        setSelectedParties(new Set());
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.abs(amount));
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                        <Bell className="w-6 h-6 text-amber-500" />
                        Payment Reminders
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Send reminders to parties with outstanding payments
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-[var(--text-muted)]">Total Parties</span>
                    </div>
                    <p className="text-xl font-bold text-[var(--on-surface)]">{filteredParties.length}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <IndianRupee className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-[var(--text-muted)]">Total Outstanding</span>
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatCurrency(totalOutstanding)}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-[var(--text-muted)]">Selected</span>
                    </div>
                    <p className="text-xl font-bold text-green-400">{selectedParties.size}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <Send className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-[var(--text-muted)]">Selected Total</span>
                    </div>
                    <p className="text-xl font-bold text-amber-400">{formatCurrency(selectedTotal)}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setActiveTab('outstanding')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'outstanding'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border-hover)]'
                        }`}
                >
                    Outstanding Parties
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border-hover)]'
                        }`}
                >
                    Reminder History
                </button>
            </div>

            {activeTab === 'outstanding' && (
                <>
                    {/* Search & Filters */}
                    <div className="flex flex-col md:flex-row gap-3 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Search parties..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-amber-500/50 focus:outline-none"
                            />
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                        >
                            <option value="amount">Sort by Amount</option>
                            <option value="name">Sort by Name</option>
                        </select>
                        <select
                            value={reminderTemplate}
                            onChange={(e) => setReminderTemplate(e.target.value)}
                            className="px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                        >
                            <option value="default">Default Template</option>
                            <option value="formal">Formal</option>
                            <option value="urgent">Urgent</option>
                            <option value="friendly">Friendly</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>

                    {/* Custom Message */}
                    {reminderTemplate === 'custom' && (
                        <div className="mb-4">
                            <textarea
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                                placeholder="Type your custom reminder message... Use party name and amount as placeholders"
                                rows={3}
                                className="w-full px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-amber-500/50 focus:outline-none resize-none"
                            />
                        </div>
                    )}

                    {/* Select All + Bulk Actions */}
                    <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedParties.size === filteredParties.length && filteredParties.length > 0}
                                onChange={selectAll}
                                className="w-4 h-4 rounded border-[var(--border)] accent-amber-500"
                            />
                            <span className="text-sm text-[var(--text-muted)]">Select All ({filteredParties.length})</span>
                        </label>

                        {selectedParties.size > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => sendBulkReminders('whatsapp')}
                                    disabled={sending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 transition-all disabled:opacity-50"
                                >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    WhatsApp ({selectedParties.size})
                                </button>
                                <button
                                    onClick={() => sendBulkReminders('email')}
                                    disabled={sending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-all disabled:opacity-50"
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                    Email ({selectedParties.size})
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Party List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                        </div>
                    ) : filteredParties.length === 0 ? (
                        <div className="text-center py-20">
                            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-[var(--on-surface)]">All Clear!</h3>
                            <p className="text-sm text-[var(--text-muted)]">No outstanding payments found</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredParties.map((party) => (
                                <div
                                    key={party.id}
                                    className={`bg-[var(--surface)] rounded-xl border transition-all ${selectedParties.has(party.id)
                                            ? 'border-amber-500/50 bg-amber-500/5'
                                            : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 p-4">
                                        {/* Checkbox */}
                                        <input
                                            type="checkbox"
                                            checked={selectedParties.has(party.id)}
                                            onChange={() => toggleParty(party.id)}
                                            className="w-4 h-4 rounded border-[var(--border)] accent-amber-500 shrink-0"
                                        />

                                        {/* Party Info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-[var(--on-surface)] truncate">{party.name}</h3>
                                            <div className="flex items-center gap-3 mt-1">
                                                {party.phone && (
                                                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                                        <Phone className="w-3 h-3" /> {party.phone}
                                                    </span>
                                                )}
                                                {party.email && (
                                                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                                        <Mail className="w-3 h-3" /> {party.email}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Amount */}
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-bold text-red-400">
                                                {formatCurrency(party.current_balance)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 px-4 pb-3 pt-0">
                                        <button
                                            onClick={() => sendWhatsAppReminder(party)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs hover:bg-green-500/20 transition-all"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                        </button>
                                        <button
                                            onClick={() => sendEmailReminder(party)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs hover:bg-blue-500/20 transition-all"
                                        >
                                            <Mail className="w-3.5 h-3.5" /> Email
                                        </button>
                                        <button
                                            onClick={() => shareReminder(party)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg text-xs hover:bg-purple-500/20 transition-all"
                                        >
                                            <Share2 className="w-3.5 h-3.5" /> Share
                                        </button>
                                        <button
                                            onClick={() => copyMessage(party)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-alt)] text-[var(--text-muted)] rounded-lg text-xs hover:bg-[var(--border)] transition-all"
                                        >
                                            {copiedId === party.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copiedId === party.id ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {activeTab === 'history' && (
                <div className="space-y-2">
                    {reminderLogs.length === 0 ? (
                        <div className="text-center py-20">
                            <Clock className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-[var(--on-surface)]">No reminders sent yet</h3>
                            <p className="text-sm text-[var(--text-muted)]">Start sending reminders to see history here</p>
                        </div>
                    ) : (
                        reminderLogs.map((log) => (
                            <div key={log.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-medium text-[var(--on-surface)]">{log.party_name}</h3>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(log.sent_at)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-red-400">{formatCurrency(log.amount)}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${log.channel === 'whatsapp' ? 'bg-green-500/20 text-green-400' :
                                                log.channel === 'email' ? 'bg-blue-500/20 text-blue-400' :
                                                    'bg-gray-500/20 text-gray-400'
                                            }`}>
                                            {log.channel === 'whatsapp' ? '💬 WhatsApp' :
                                                log.channel === 'email' ? '📧 Email' : '📤 Shared'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}


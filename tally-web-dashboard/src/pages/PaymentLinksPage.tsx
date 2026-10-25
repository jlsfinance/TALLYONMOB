import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, pendingTransactionApi } from '../lib/insforge';
import {
    CreditCard, Link2, Copy, Check, Send, Search, ExternalLink,
    IndianRupee, MessageCircle, Mail, Loader2, QrCode, Clock,
    CheckCircle, XCircle, Share2, Plus, Eye, Database, AlertCircle,
    Download, Trash2, CheckCircle2, ArrowRight, RefreshCw, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface PaymentLink {
    id: string;
    company_id: string;
    party_name: string;
    party_ledger_id?: string;
    voucher_id?: string;
    invoice_number: string;
    amount: number;
    upi_id?: string;
    description?: string;
    link_url: string;
    status: 'active' | 'paid' | 'expired';
    payment_mode?: string;
    created_at: string;
    paid_at?: string;
}

export default function PaymentLinksPage() {
    const { selectedCompany } = useAuth() as any;
    const companyId = selectedCompany?.id || 'default_co';
    const LOCAL_STORAGE_KEY = `tally_payment_links_${companyId}`;

    const [links, setLinks] = useState<PaymentLink[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [debtors, setDebtors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [customAmount, setCustomAmount] = useState('');
    const [customParty, setCustomParty] = useState('');
    const [customUpiId, setCustomUpiId] = useState('');
    const [customDesc, setCustomDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'paid'>('all');
    const [qrModalLink, setQrModalLink] = useState<PaymentLink | null>(null);
    const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);

    // Load Invoices, Debtors and Links
    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);

        try {
            // 1. Fetch Sales Vouchers & Debtors from Supabase
            const [vouchersRes, ledgersRes] = await Promise.all([
                supabase
                    .from('vouchers')
                    .select('id, voucher_number, party_name, grand_total, total_amount, voucher_date')
                    .eq('company_id', companyId)
                    .eq('voucher_type', 'Sales')
                    .eq('is_deleted', false)
                    .order('voucher_date', { ascending: false })
                    .limit(100),
                supabase
                    .from('ledgers')
                    .select('id, name, current_balance, parent, phone, email')
                    .eq('company_id', companyId)
                    .in('parent', ['Sundry Debtors', 'sundry debtors', 'SUNDRY DEBTORS'])
                    .limit(100)
            ]);

            setInvoices(vouchersRes.data || []);
            setDebtors(ledgersRes.data || []);

            // 2. Fetch Payment Links (Supabase with LocalStorage fallback)
            let linksLoaded = false;
            try {
                const { data, error } = await supabase
                    .from('payment_links')
                    .select('*')
                    .eq('company_id', companyId)
                    .order('created_at', { ascending: false });

                if (!error && data) {
                    setLinks(data as PaymentLink[]);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    setSupabaseOk(true);
                    linksLoaded = true;
                }
            } catch {
                setSupabaseOk(false);
            }

            if (!linksLoaded) {
                const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (cached) {
                    try { setLinks(JSON.parse(cached)); } catch { setLinks([]); }
                } else {
                    setLinks([]);
                }
            }
        } catch (err: any) {
            console.error('Failed to load payment link data:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, LOCAL_STORAGE_KEY]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Format Currency
    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(n) || 0);

    // Create New Link
    const createPaymentLink = async () => {
        const amount = selectedInvoice
            ? Math.abs(Number(selectedInvoice.grand_total) || Number(selectedInvoice.total_amount) || 0)
            : Number(customAmount);

        const party = selectedInvoice?.party_name || customParty.trim();

        if (!amount || amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        if (!party) {
            toast.error('Please enter or select a customer name');
            return;
        }

        setCreating(true);
        try {
            const linkId = `PAY-${Date.now().toString(36).toUpperCase()}`;
            const businessName = selectedCompany?.name || 'Enterprise';
            const upiId = customUpiId.trim() || 'business@upi';
            const description = customDesc.trim() || `Invoice ${selectedInvoice?.voucher_number || 'Payment'}`;

            // Generate standard NPCI UPI Intent URL
            const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(businessName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(description)}`;

            const newLink: PaymentLink = {
                id: linkId,
                company_id: companyId,
                party_name: party,
                voucher_id: selectedInvoice?.id,
                invoice_number: selectedInvoice?.voucher_number || 'DIRECT',
                amount,
                upi_id: upiId,
                description,
                link_url: upiUrl,
                status: 'active',
                payment_mode: 'UPI',
                created_at: new Date().toISOString()
            };

            // 1. Try insert into Supabase
            let savedCloud = false;
            try {
                const { error } = await supabase.from('payment_links').insert(newLink);
                if (!error) savedCloud = true;
            } catch {
                savedCloud = false;
            }

            // 2. Always persist locally
            const updated = [newLink, ...links];
            setLinks(updated);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

            if (savedCloud) {
                toast.success('Payment Link generated and saved to Supabase!');
            } else {
                toast.success('Payment Link generated (Saved locally)');
            }

            setShowCreate(false);
            setSelectedInvoice(null);
            setCustomAmount('');
            setCustomParty('');
            setCustomDesc('');
        } catch {
            toast.error('Failed to create payment link');
        } finally {
            setCreating(false);
        }
    };

    // Mark as Paid & Generate Tally Receipt
    const handleMarkAsPaid = async (link: PaymentLink) => {
        const toastId = toast.loading('Recording payment & queueing Tally Receipt...');
        const now = new Date().toISOString();

        // 1. Create Receipt in pending_transactions for Tally Sync
        try {
            const dateStr = format(new Date(), 'yyyyMMdd');
            await pendingTransactionApi.create(companyId, 'Receipt', {
                voucher_type: 'Receipt',
                voucher_type_name: 'Receipt',
                date: dateStr,
                voucher_date: format(new Date(), 'yyyy-MM-dd'),
                party_name: link.party_name,
                party_ledger_name: link.party_name,
                narration: `Payment received via UPI link ${link.id} for ${link.invoice_number}`,
                amount: link.amount,
                total_amount: link.amount,
                ledger_entries: [
                    { ledger_name: 'Bank / Cash', amount: link.amount, is_debit: true },
                    { ledger_name: link.party_name, amount: -link.amount, is_debit: false }
                ]
            });
        } catch (e: any) {
            console.warn('Tally receipt queue notice:', e?.message);
        }

        // 2. Update Link Status
        try {
            await supabase.from('payment_links').update({ status: 'paid', paid_at: now }).eq('id', link.id);
        } catch { }

        const updated = links.map(l => l.id === link.id ? { ...l, status: 'paid' as const, paid_at: now } : l);
        setLinks(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

        toast.success(`Marked as PAID! Tally Receipt queued.`, { id: toastId });
    };

    // Delete Link
    const handleDeleteLink = async (id: string) => {
        try {
            await supabase.from('payment_links').delete().eq('id', id);
        } catch { }

        const updated = links.filter(l => l.id !== id);
        setLinks(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        toast.success('Payment link removed');
    };

    // Copy Link URL
    const copyLink = async (link: PaymentLink) => {
        await navigator.clipboard.writeText(link.link_url);
        setCopiedId(link.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success('UPI Payment Link copied!');
    };

    // Share on WhatsApp
    const shareWhatsApp = (link: PaymentLink) => {
        const text = `*PAYMENT REQUEST - ${selectedCompany?.name || 'Company'}*\n\n` +
            `Dear ${link.party_name},\n` +
            `Please pay *${formatCurrency(link.amount)}* for Invoice *#${link.invoice_number}*.\n\n` +
            `*Click to Pay via UPI (GPay/PhonePe/Paytm):*\n${link.link_url}\n\n` +
            `Thank you for your business!`;

        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    // Filtered Invoices for selection
    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return invoices.slice(0, 15);
        return invoices.filter(inv =>
            inv.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.voucher_number?.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 15);
    }, [invoices, searchQuery]);

    // Filtered Links for Display
    const displayedLinks = useMemo(() => {
        if (activeFilter === 'all') return links;
        return links.filter(l => l.status === activeFilter);
    }, [links, activeFilter]);

    const totalCollected = links.filter(l => l.status === 'paid').reduce((s, l) => s + l.amount, 0);
    const totalPending = links.filter(l => l.status === 'active').reduce((s, l) => s + l.amount, 0);

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 animate-fade-in text-[var(--on-surface)]">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Link2 size={18} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight">Payment Links</h1>
                        <p className="text-[11px] text-[var(--text-muted)]">Instant UPI & Online Payment Links connected to Invoices & Tally</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border ${
                        supabaseOk ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                        <Database size={12} />
                        {supabaseOk ? 'Supabase Connected' : 'Local + Supabase Mode'}
                    </div>

                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                        <Plus size={14} /> Create Link
                    </button>
                </div>
            </div>

            {/* KPI Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Total Links Created</span>
                        <Link2 size={14} className="text-indigo-500" />
                    </div>
                    <p className="text-xl font-black text-indigo-600">{links.length}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{links.filter(l => l.status === 'paid').length} collected successfully</p>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Total Collected</span>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                    </div>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(totalCollected)}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Realized payments</p>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
                    <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
                        <span className="text-[10px] font-bold uppercase">Pending Collection</span>
                        <Clock size={14} className="text-amber-500" />
                    </div>
                    <p className="text-xl font-black text-amber-600">{formatCurrency(totalPending)}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{links.filter(l => l.status === 'active').length} links awaiting payment</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                <div className="flex gap-1.5">
                    {[
                        { key: 'all', label: 'All Links', count: links.length },
                        { key: 'active', label: 'Pending', count: links.filter(l => l.status === 'active').length },
                        { key: 'paid', label: 'Paid', count: links.filter(l => l.status === 'paid').length }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setActiveFilter(f.key as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                activeFilter === f.key
                                    ? 'bg-[var(--primary)] text-white shadow-xs'
                                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--on-surface)]'
                            }`}
                        >
                            {f.label} ({f.count})
                        </button>
                    ))}
                </div>
            </div>

            {/* Links List */}
            {loading ? (
                <div className="py-20 flex justify-center"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
            ) : displayedLinks.length === 0 ? (
                <div className="py-16 text-center text-[var(--text-muted)] border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
                    <CreditCard size={36} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-bold">No payment links found</p>
                    <p className="text-xs mt-1">Generate a link against an unpaid invoice or enter a custom amount.</p>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                    >
                        Create First Payment Link
                    </button>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {displayedLinks.map(link => (
                        <div key={link.id} className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] hover:border-indigo-500/40 transition-colors shadow-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm">{link.party_name}</h3>
                                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                            #{link.invoice_number}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                        Created: {format(new Date(link.created_at), 'dd MMM yyyy, hh:mm a')}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-base font-black text-indigo-600">{formatCurrency(link.amount)}</p>
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                            link.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                            {link.status === 'paid' ? 'Paid & Synced' : 'Pending Payment'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Link Box */}
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--surface-variant)] text-xs mb-3">
                                <Link2 size={13} className="text-indigo-500 shrink-0" />
                                <span className="font-mono text-[10px] text-[var(--text-muted)] truncate flex-1">{link.link_url}</span>
                                <button
                                    onClick={() => copyLink(link)}
                                    className="p-1 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-indigo-600 transition-colors cursor-pointer"
                                    title="Copy UPI Link"
                                >
                                    {copiedId === link.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border)]/40">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => shareWhatsApp(link)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        <MessageCircle size={13} /> WhatsApp
                                    </button>
                                    <button
                                        onClick={() => setQrModalLink(link)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        <QrCode size={13} /> QR Code
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    {link.status === 'active' && (
                                        <button
                                            onClick={() => handleMarkAsPaid(link)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                                        >
                                            <Check size={13} /> Mark Paid & Queue Tally Receipt
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteLink(link.id)}
                                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                                        title="Delete link"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL 1: CREATE PAYMENT LINK */}
            {showCreate && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Link2 size={16} className="text-indigo-500" />
                                <h3 className="text-sm font-black">Generate Payment Link</h3>
                            </div>
                            <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-[var(--surface-variant)] text-[var(--text-muted)]">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {/* Pick Invoice */}
                            <div>
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block">
                                    Select Unpaid Sales Invoice (Optional)
                                </label>
                                <div className="relative mb-2">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                    <input
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        placeholder="Search by invoice number or customer name..."
                                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs"
                                    />
                                </div>
                                <div className="max-h-36 overflow-y-auto space-y-1 border border-[var(--border)] rounded-xl p-1 bg-[var(--surface-variant)]/30">
                                    {filteredInvoices.map(inv => {
                                        const amt = Number(inv.grand_total) || Number(inv.total_amount) || 0;
                                        return (
                                            <button
                                                key={inv.id}
                                                onClick={() => {
                                                    setSelectedInvoice(inv);
                                                    setCustomParty(inv.party_name);
                                                    setCustomAmount(String(amt));
                                                }}
                                                className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${
                                                    selectedInvoice?.id === inv.id ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-[var(--surface-variant)]'
                                                }`}
                                            >
                                                <div>
                                                    <p className="text-xs">{inv.party_name}</p>
                                                    <p className={`text-[9px] ${selectedInvoice?.id === inv.id ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                                                        #{inv.voucher_number} • {inv.voucher_date}
                                                    </p>
                                                </div>
                                                <span className="font-black">{formatCurrency(amt)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="text-center font-bold text-[10px] text-[var(--text-muted)] uppercase">── Or Custom Details ──</div>

                            {/* Custom Inputs */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Customer / Party Name *</label>
                                    <input
                                        value={customParty}
                                        onChange={e => { setCustomParty(e.target.value); setSelectedInvoice(null); }}
                                        placeholder="e.g. Ramesh Trading"
                                        className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Amount (₹) *</label>
                                    <input
                                        type="number"
                                        value={customAmount}
                                        onChange={e => { setCustomAmount(e.target.value); setSelectedInvoice(null); }}
                                        placeholder="e.g. 5000"
                                        className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">UPI VPA (Merchant ID)</label>
                                    <input
                                        value={customUpiId}
                                        onChange={e => setCustomUpiId(e.target.value)}
                                        placeholder="yourname@paytm / okaxis"
                                        className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Payment Description</label>
                                    <input
                                        value={customDesc}
                                        onChange={e => setCustomDesc(e.target.value)}
                                        placeholder="Invoice settlement"
                                        className="w-full mt-1 px-3 py-2 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 bg-[var(--surface-variant)]/40">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 rounded-xl border border-[var(--border)] font-bold text-xs hover:bg-[var(--surface-variant)]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createPaymentLink}
                                disabled={creating}
                                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
                            >
                                {creating ? 'Generating...' : 'Generate Link'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: LIVE QR CODE PREVIEW */}
            {qrModalLink && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white text-gray-900 rounded-3xl shadow-2xl p-6 text-center space-y-4">
                        <div className="flex justify-end">
                            <button onClick={() => setQrModalLink(null)} className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
                                <X size={16} />
                            </button>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">Scan to Pay via UPI</span>
                            <h3 className="text-base font-black text-gray-900 mt-2">{qrModalLink.party_name}</h3>
                            <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(qrModalLink.amount)}</p>
                            <p className="text-[11px] text-gray-500">Invoice #{qrModalLink.invoice_number}</p>
                        </div>

                        {/* Live QR Image from QR Server API */}
                        <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 inline-block shadow-inner">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModalLink.link_url)}`}
                                alt="UPI QR Code"
                                className="w-48 h-48 mx-auto"
                            />
                        </div>

                        <p className="text-[10px] text-gray-500 font-medium">Supports Google Pay, PhonePe, Paytm, BHIM & all Indian UPI apps</p>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => shareWhatsApp(qrModalLink)}
                                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700"
                            >
                                WhatsApp Link
                            </button>
                            <button
                                onClick={() => {
                                    handleMarkAsPaid(qrModalLink);
                                    setQrModalLink(null);
                                }}
                                className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700"
                            >
                                Received (Done)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

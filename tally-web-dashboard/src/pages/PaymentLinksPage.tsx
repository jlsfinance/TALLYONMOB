import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    CreditCard, Link2, Copy, Check, Send, Search, ExternalLink,
    IndianRupee, MessageCircle, Mail, Loader2, QrCode, Clock,
    CheckCircle, XCircle, Share2, Plus, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentLink {
    id: string;
    party_name: string;
    amount: number;
    invoice_number: string;
    link_url: string;
    status: 'active' | 'paid' | 'expired';
    created_at: string;
    paid_at?: string;
}

export default function PaymentLinksPage() {
    const { selectedCompany } = useAuth() as any;
    const [links, setLinks] = useState<PaymentLink[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [customAmount, setCustomAmount] = useState('');
    const [customParty, setCustomParty] = useState('');
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (selectedCompany?.id) loadData();
    }, [selectedCompany]);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('vouchers')
                .select('id, voucher_number, party_name, grand_total, total_amount, voucher_date')
                .eq('company_id', selectedCompany.id)
                .eq('voucher_type', 'Sales')
                .eq('is_deleted', false)
                .order('voucher_date', { ascending: false })
                .limit(100);
            setInvoices(data || []);

            // Load existing payment links
            try {
                const { data: linkData } = await supabase
                    .from('payment_links')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .order('created_at', { ascending: false });
                setLinks(linkData || []);
            } catch { /* Table may not exist */ }
        } catch {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const createPaymentLink = async () => {
        const amount = selectedInvoice
            ? Math.abs(Number(selectedInvoice.grand_total) || Number(selectedInvoice.total_amount) || 0)
            : Number(customAmount);

        const party = selectedInvoice?.party_name || customParty;

        if (!amount || amount <= 0) {
            toast.error('Enter a valid amount');
            return;
        }

        setCreating(true);
        try {
            // In production, this would call Razorpay API to create a payment link
            // For now, generate a mock link
            const linkId = `pay_${Date.now().toString(36)}`;
            const linkUrl = `https://rzp.io/i/${linkId}`;

            const newLink: PaymentLink = {
                id: linkId,
                party_name: party || 'Custom Payment',
                amount,
                invoice_number: selectedInvoice?.voucher_number || 'CUSTOM',
                link_url: linkUrl,
                status: 'active',
                created_at: new Date().toISOString()
            };

            try {
                await supabase.from('payment_links').insert({
                    company_id: selectedCompany.id,
                    party_name: newLink.party_name,
                    amount: newLink.amount,
                    invoice_number: newLink.invoice_number,
                    link_url: newLink.link_url,
                    status: 'active'
                });
            } catch { /* Table may not exist */ }

            setLinks(prev => [newLink, ...prev]);
            toast.success('Payment link created!');
            setShowCreate(false);
            setSelectedInvoice(null);
            setCustomAmount('');
            setCustomParty('');
        } catch {
            toast.error('Failed to create link');
        } finally {
            setCreating(false);
        }
    };

    const copyLink = async (link: PaymentLink) => {
        await navigator.clipboard.writeText(link.link_url);
        setCopiedId(link.id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success('Link copied!');
    };

    const shareLink = async (link: PaymentLink, channel: 'whatsapp' | 'email' | 'share') => {
        const message = `Hi ${link.party_name},\n\nPay ${formatCurrency(link.amount)} securely online:\n${link.link_url}\n\nPayment for Invoice #${link.invoice_number}\n\nThank you!\n${selectedCompany?.name}`;

        if (channel === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        } else if (channel === 'email') {
            window.open(`mailto:?subject=${encodeURIComponent(`Payment Link - ${formatCurrency(link.amount)}`)}&body=${encodeURIComponent(message)}`);
        } else if (navigator.share) {
            try { await navigator.share({ title: 'Payment Link', text: message }); } catch { }
        }
    };

    const filteredInvoices = useMemo(() => {
        if (!searchQuery) return invoices.slice(0, 20);
        return invoices.filter(inv =>
            inv.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.voucher_number?.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 20);
    }, [invoices, searchQuery]);

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(Math.abs(n));

    const totalCollected = links.filter(l => l.status === 'paid').reduce((s, l) => s + l.amount, 0);
    const totalPending = links.filter(l => l.status === 'active').reduce((s, l) => s + l.amount, 0);

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                        <CreditCard className="w-6 h-6 text-indigo-400" />
                        Payment Links
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Collect payments online via UPI, Card, Net Banking</p>
                </div>
                <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-all">
                    <Plus className="w-4 h-4" /> Create Link
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Total Links</p>
                    <p className="text-xl font-bold text-indigo-400">{links.length}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Collected</p>
                    <p className="text-lg font-bold text-green-400">{formatCurrency(totalCollected)}</p>
                </div>
                <div className="bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)]">Pending</p>
                    <p className="text-lg font-bold text-amber-400">{formatCurrency(totalPending)}</p>
                </div>
            </div>

            {/* Create Payment Link */}
            {showCreate && (
                <div className="bg-[var(--surface)] rounded-xl border border-indigo-500/30 p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-[var(--on-surface)]">Create Payment Link</h3>
                        <button onClick={() => setShowCreate(false)}><XCircle className="w-4 h-4 text-[var(--text-muted)]" /></button>
                    </div>

                    {/* Select Invoice or Custom */}
                    <div className="mb-3">
                        <label className="text-xs text-[var(--text-muted)] mb-1 block">Select Invoice (or enter custom amount below)</label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search invoices..."
                                className="w-full pl-10 pr-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                            {filteredInvoices.map(inv => (
                                <button key={inv.id} onClick={() => setSelectedInvoice(inv)}
                                    className={`w-full flex justify-between px-3 py-2 rounded-lg text-sm text-left transition-all ${selectedInvoice?.id === inv.id ? 'bg-indigo-500/20 border border-indigo-500/30' : 'hover:bg-[var(--background)]'
                                        }`}>
                                    <span className="text-[var(--on-surface)]">{inv.party_name} <span className="text-[var(--text-muted)]">#{inv.voucher_number}</span></span>
                                    <span className="font-medium text-[var(--on-surface)]">{formatCurrency(Number(inv.grand_total) || Number(inv.total_amount) || 0)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="text-center text-xs text-[var(--text-muted)] my-2">? or enter custom ?</div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Party Name</label>
                            <input type="text" value={selectedInvoice?.party_name || customParty}
                                onChange={e => { setCustomParty(e.target.value); setSelectedInvoice(null); }}
                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                        </div>
                        <div>
                            <label className="text-xs text-[var(--text-muted)] mb-1 block">Amount</label>
                            <input type="number" value={selectedInvoice ? Math.abs(Number(selectedInvoice.grand_total) || 0) : customAmount}
                                onChange={e => { setCustomAmount(e.target.value); setSelectedInvoice(null); }}
                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]" />
                        </div>
                    </div>

                    <button onClick={createPaymentLink} disabled={creating}
                        className="w-full py-2.5 bg-indigo-500 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        Generate Payment Link
                    </button>
                </div>
            )}

            {/* Payment Links List */}
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div>
            ) : links.length === 0 ? (
                <div className="text-center py-20">
                    <CreditCard className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--on-surface)]">No Payment Links</h3>
                    <p className="text-sm text-[var(--text-muted)]">Create your first payment link to collect online</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {links.map(link => (
                        <div key={link.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-medium text-[var(--on-surface)]">{link.party_name}</h3>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Invoice #{link.invoice_number}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-[var(--on-surface)]">{formatCurrency(link.amount)}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${link.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                            link.status === 'active' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        {link.status === 'paid' ? '✅ Paid' : link.status === 'active' ? '⏳ Pending' : '❌ Expired'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 mt-2 mb-3 bg-[var(--background)] rounded-lg px-3 py-2">
                                <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span className="text-xs text-indigo-400 truncate flex-1">{link.link_url}</span>
                                <button onClick={() => copyLink(link)} className="shrink-0">
                                    {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={() => shareLink(link, 'whatsapp')}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs hover:bg-green-500/20 transition-all">
                                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                </button>
                                <button onClick={() => shareLink(link, 'email')}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs hover:bg-blue-500/20 transition-all">
                                    <Mail className="w-3.5 h-3.5" /> Email
                                </button>
                                <button onClick={() => shareLink(link, 'share')}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--background)] text-[var(--text-muted)] rounded-lg text-xs hover:bg-[var(--border)] transition-all">
                                    <Share2 className="w-3.5 h-3.5" /> Share
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Razorpay Setup Info */}
            <div className="mt-6 bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-start gap-3">
                    <CreditCard className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">Razorpay Integration</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            To enable live payment collection, add your Razorpay API keys in Settings.
                            Payments via UPI, Card, and Net Banking will be supported.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}


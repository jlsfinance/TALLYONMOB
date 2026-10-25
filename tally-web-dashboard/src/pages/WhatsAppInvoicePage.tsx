import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/insforge';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Send, Phone, MessageCircle, CheckCircle, Clock, X, FileText, Download, Loader2 } from 'lucide-react';

export default function WhatsAppInvoicePage() {
    const { selectedCompany } = useAuth() as any;
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sentLog, setSentLog] = useState<{ voucher_id: string; phone: string; sent_at: string }[]>([]);

    useEffect(() => { if (selectedCompany?.id) loadVouchers(); }, [selectedCompany]);

    const loadVouchers = async () => {
        setLoading(true);
        try {
            const { data } = await supabase.from('vouchers')
                .select('id, voucher_type, voucher_number, party_name, grand_total, voucher_date')
                .eq('company_id', selectedCompany.id).eq('is_deleted', false)
                .eq('voucher_type', 'Sales').order('voucher_date', { ascending: false }).limit(100);
            setVouchers(data || []);
        } catch { }
        setLoading(false);
    };

    const sendWhatsApp = async (voucher: any) => {
        setSending(voucher.id);
        try {
            // Get party phone from ledgers
            const { data: ledger } = await supabase.from('ledgers')
                .select('phone, name').eq('company_id', selectedCompany.id)
                .ilike('name', `%${voucher.party_name || ''}%`).single();
            const phone = ledger?.phone || '';
            if (!phone) { toast.error(`No phone number for ${voucher.party_name}`); setSending(null); return; }

            // Generate message
            const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(voucher.grand_total || 0));
            const msg = encodeURIComponent(
                `Invoice from ${selectedCompany.name}\n\n` +
                `Invoice #: ${voucher.voucher_number || 'N/A'}\n` +
                `Date: ${voucher.voucher_date ? format(new Date(voucher.voucher_date), 'dd MMM yyyy') : 'N/A'}\n` +
                `Party: ${voucher.party_name || 'N/A'}\n` +
                `Amount: ${amount}\n\n` +
                `View & pay: ${window.location.origin}/invoice/${voucher.id}\n\n` +
                `Powered by SYNCORA TallyOnMobile Cloud`
            );

            // Open WhatsApp
            window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
            setSentLog(prev => [...prev, { voucher_id: voucher.id, phone, sent_at: new Date().toISOString() }]);
            toast.success('WhatsApp opened!');
        } catch (e: any) { toast.error('Failed: ' + e.message); }
        setSending(null);
    };

    const filtered = vouchers.filter(v => !search || v.party_name?.toLowerCase().includes(search.toLowerCase()) || v.voucher_number?.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-24">
            <div>
                <h1 className="text-2xl font-black text-[var(--on-surface)]">WhatsApp Invoices</h1>
                <p className="text-xs text-[var(--text-muted)]">Send sales invoices via WhatsApp with PDF</p>
            </div>

            <div className="relative">
                <Send size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..." className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-xs" />
            </div>

            <div className="space-y-2">
                {filtered.map(v => {
                    const sent = sentLog.find(s => s.voucher_id === v.id);
                    return (
                        <div key={v.id} className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-variant)]/50 transition-all">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <FileText size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{v.voucher_number || 'Draft'}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{v.party_name || 'No party'} • {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yy') : '-'}</p>
                            </div>
                            <p className="text-sm font-black text-[var(--on-surface)]">
                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.abs(v.grand_total || 0))}
                            </p>
                            {sent ? (
                                <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 text-[10px] font-bold"><CheckCircle size={12} /> Sent</span>
                            ) : (
                                <button onClick={() => sendWhatsApp(v)} disabled={sending === v.id} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50">
                                    {sending === v.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                                    Send
                                </button>
                            )}
                        </div>
                    );
                })}
                {filtered.length === 0 && !loading && <div className="py-12 text-center text-[var(--text-muted)] text-xs">No sales invoices found</div>}
            </div>
        </div>
    );
}

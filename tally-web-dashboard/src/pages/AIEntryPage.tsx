import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import {
    Sparkles, Send, Mic, MicOff, FileText, Plus, Calendar,
    User, IndianRupee, Package, CheckCircle2, AlertCircle,
    ChevronDown, X, Zap, Bot, ArrowRight, RefreshCw
} from 'lucide-react';
import { GlassCard, Spinner } from '@/components/ui/GlassUI';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

type VoucherType = 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Journal';

interface EntryForm {
    voucherType: VoucherType;
    partyName: string;
    amount: string;
    date: string;
    narration: string;
    items: { name: string; qty: string; rate: string; amount: string }[];
}

const VOUCHER_TYPES: { key: VoucherType; label: string; icon: any; color: string }[] = [
    { key: 'Sales', label: 'Sales Invoice', icon: FileText, color: 'emerald' },
    { key: 'Purchase', label: 'Purchase', icon: Package, color: 'orange' },
    { key: 'Receipt', label: 'Receipt', icon: IndianRupee, color: 'blue' },
    { key: 'Payment', label: 'Payment', icon: IndianRupee, color: 'red' },
    { key: 'Journal', label: 'Journal', icon: FileText, color: 'purple' },
];

const AI_TEMPLATES = [
    { label: 'Sales Entry', prompt: 'Sold to [Party] for ₹[Amount]', type: 'Sales' as VoucherType },
    { label: 'Purchase Entry', prompt: 'Purchased from [Supplier] for ₹[Amount]', type: 'Purchase' as VoucherType },
    { label: 'Receipt', prompt: 'Received ₹[Amount] from [Party]', type: 'Receipt' as VoucherType },
    { label: 'Payment', prompt: 'Paid ₹[Amount] to [Party]', type: 'Payment' as VoucherType },
];

export default function AIEntryPage() {
    const { selectedCompany, user } = useAuth() as any;
    const [aiInput, setAiInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [ledgerSuggestions, setLedgerSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [recentEntries, setRecentEntries] = useState<any[]>([]);
    const [form, setForm] = useState<EntryForm>({
        voucherType: 'Sales',
        partyName: '',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        narration: '',
        items: [{ name: '', qty: '1', rate: '', amount: '' }],
    });
    const inputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadLedgers();
            loadRecentEntries();
        }
    }, [selectedCompany]);

    const loadLedgers = async () => {
        const { data } = await supabase
            .from('ledgers')
            .select('name')
            .eq('company_id', selectedCompany.id)
            .in('parent', ['Sundry Debtors', 'Sundry Creditors', 'Cash-in-Hand', 'Bank Accounts'])
            .order('name')
            .limit(500);
        setLedgerSuggestions((data || []).map(l => l.name));
    };

    const loadRecentEntries = async () => {
        const { data } = await supabase
            .from('pending_transactions')
            .select('*')
            .eq('company_id', selectedCompany.id)
            .order('created_at', { ascending: false })
            .limit(10);
        setRecentEntries(data || []);
    };

    // AI Parser: Extract entry data from natural language
    const parseAiInput = (text: string) => {
        const cleanText = text.trim();

        // Detect voucher type
        let type: VoucherType = 'Receipt';
        if (/\b(sold|sale|invoice|billed)\b/i.test(cleanText)) type = 'Sales';
        else if (/\b(bought|purchased|purchase)\b/i.test(cleanText)) type = 'Purchase';
        else if (/\b(received|receipt|collected|jama)\b/i.test(cleanText)) type = 'Receipt';
        else if (/\b(paid|payment|given|diya|kharch)\b/i.test(cleanText)) type = 'Payment';
        else if (/\b(journal|transfer|adjust)\b/i.test(cleanText)) type = 'Journal';

        // Extract amount
        const amountMatch = cleanText.match(/(?:₹|rs\.?|inr|rupees?)\s*([0-9,]+(?:\.\d{1,2})?)/i)
            || cleanText.match(/([0-9,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|rupees?)/i)
            || cleanText.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d{1,2})?)\b/);
        const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';

        // Extract party name - remove common words
        let party = cleanText
            .replace(/(?:₹|rs\.?|inr|rupees?\s*)[0-9,]+(?:\.\d{1,2})?/gi, '')
            .replace(/[0-9,]+(?:\.\d{1,2})?\s*(?:₹|rs\.?|rupees?)/gi, '')
            .replace(/\b(sold|sale|invoice|billed|bought|purchased|purchase|received|receipt|collected|paid|payment|given|from|to|for|of|the|a|an|with|on|in|at|by|jama|diya|kharch)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Try to find best matching ledger
        const matchedLedger = ledgerSuggestions.find(l =>
            l.toLowerCase().includes(party.toLowerCase()) || party.toLowerCase().includes(l.toLowerCase())
        );

        return {
            voucherType: type,
            partyName: matchedLedger || party,
            amount,
            date: format(new Date(), 'yyyy-MM-dd'),
            narration: cleanText,
            items: [{ name: '', qty: '1', rate: amount, amount }],
        };
    };

    const handleAiParse = () => {
        if (!aiInput.trim()) return;
        setIsProcessing(true);
        setTimeout(() => {
            const parsed = parseAiInput(aiInput);
            setForm(parsed);
            setIsProcessing(false);
            toast.success(`Detected: ${parsed.voucherType} of ₹${parsed.amount}`);
        }, 500);
    };

    // Voice Input
    const toggleVoice = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            toast.error('Speech recognition not supported in this browser');
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-IN';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => result[0].transcript)
                .join('');
            setAiInput(transcript);
        };

        recognition.onend = () => {
            setIsListening(false);
            if (aiInput.trim()) handleAiParse();
        };

        recognition.onerror = () => {
            setIsListening(false);
            toast.error('Voice recognition error');
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    // Submit entry to pending_transactions
    const handleSubmit = async () => {
        if (!form.partyName || !form.amount) {
            toast.error('Party name and amount are required');
            return;
        }

        setIsProcessing(true);
        try {
            const voucherData: any = {
                voucher_type_name: form.voucherType,
                party_name: form.partyName,
                voucher_date: form.date,
                narration: form.narration,
                total_amount: parseFloat(form.amount) || 0,
                grand_total: parseFloat(form.amount) || 0,
            };

            if (form.voucherType === 'Sales' || form.voucherType === 'Purchase') {
                voucherData.items = form.items.filter(i => i.name).map(i => ({
                    stock_item: i.name,
                    quantity: parseFloat(i.qty) || 1,
                    rate: parseFloat(i.rate) || 0,
                    amount: parseFloat(i.amount) || 0,
                }));
            }

            if (form.voucherType === 'Receipt' || form.voucherType === 'Payment') {
                voucherData.cash_bank_ledger = 'Cash';
            }

            const { error } = await supabase
                .from('pending_transactions')
                .insert({
                    company_id: selectedCompany.id,
                    transaction_type: form.voucherType,
                    voucher_data: voucherData,
                    status: 'pending',
                    created_by: user?.id,
                });

            if (error) throw error;

            toast.success(`${form.voucherType} entry created! Will be synced to Tally.`);
            setForm({
                voucherType: 'Sales',
                partyName: '',
                amount: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                narration: '',
                items: [{ name: '', qty: '1', rate: '', amount: '' }],
            });
            setAiInput('');
            loadRecentEntries();
        } catch (error: any) {
            console.error('Submit error:', error);
            toast.error('Failed to create entry: ' + (error.message || 'Unknown error'));
        }
        setIsProcessing(false);
    };

    const filteredSuggestions = useMemo(() => {
        if (!form.partyName || form.partyName.length < 2) return [];
        return ledgerSuggestions.filter(l =>
            l.toLowerCase().includes(form.partyName.toLowerCase())
        ).slice(0, 8);
    }, [form.partyName, ledgerSuggestions]);

    const updateLineItem = (idx: number, field: string, value: string) => {
        const newItems = [...form.items];
        (newItems[idx] as any)[field] = value;
        if (field === 'qty' || field === 'rate') {
            newItems[idx].amount = ((parseFloat(newItems[idx].qty) || 0) * (parseFloat(newItems[idx].rate) || 0)).toString();
        }
        setForm({ ...form, items: newItems });

        // Update total
        const total = newItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        if (total > 0) setForm(f => ({ ...f, amount: total.toString(), items: newItems }));
    };

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-24">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-[var(--on-surface)] tracking-tighter">AI Auto Entry</h1>
                        <p className="text-xs text-[var(--text-muted)]">Type or speak naturally • Auto-creates Tally vouchers</p>
                    </div>
                </div>
            </div>

            {/* AI Input */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Bot size={16} className="text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--on-surface)] uppercase tracking-wider">Smart Input</span>
                </div>
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder='Try: "Sold to Rathi Traders for ₹25,000" or "Received Rs 50000 from Agarwal Ji"'
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAiParse()}
                            className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-4 px-5 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-glow)] transition-all placeholder:text-[var(--text-muted)]"
                        />
                    </div>
                    <button
                        onClick={toggleVoice}
                        className={`p-4 rounded-xl transition-all ${isListening
                            ? 'bg-red-500 text-white animate-pulse shadow-lg'
                            : 'bg-[var(--surface-variant)] text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface-active)]'
                            }`}
                    >
                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <button
                        onClick={handleAiParse}
                        disabled={isProcessing || !aiInput.trim()}
                        className="px-6 py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-40"
                    >
                        {isProcessing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={16} />}
                        Parse
                    </button>
                </div>

                {/* Quick Templates */}
                <div className="flex gap-2 mt-4 flex-wrap">
                    {AI_TEMPLATES.map((t, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                setAiInput(t.prompt);
                                setForm(f => ({ ...f, voucherType: t.type }));
                            }}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[var(--surface-active)] text-[var(--on-surface-variant)] border border-[var(--border)] hover:border-[var(--primary)] transition-all"
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </GlassCard>

            {/* Entry Form */}
            <GlassCard className="p-6">
                <h2 className="text-sm font-black text-[var(--on-surface)] mb-5 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-[var(--primary)]" /> Voucher Details
                </h2>

                {/* Voucher Type Selector */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                    {VOUCHER_TYPES.map(vt => (
                        <button
                            key={vt.key}
                            onClick={() => setForm(f => ({ ...f, voucherType: vt.key }))}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${form.voucherType === vt.key
                                ? `bg-${vt.color}-600 text-white shadow-lg`
                                : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                }`}
                            style={form.voucherType === vt.key ? {
                                background: vt.color === 'emerald' ? '#059669' : vt.color === 'orange' ? '#ea580c' : vt.color === 'blue' ? '#2563eb' : vt.color === 'red' ? '#dc2626' : '#9333ea'
                            } : {}}
                        >
                            <vt.icon size={14} />
                            {vt.label}
                        </button>
                    ))}
                </div>

                {/* Form Fields */}
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                    <div className="relative">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Party / Ledger Name</label>
                        <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                value={form.partyName}
                                onChange={e => { setForm(f => ({ ...f, partyName: e.target.value })); setShowSuggestions(true); }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                placeholder="Enter party name"
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                            />
                            <AnimatePresence>
                                {showSuggestions && filteredSuggestions.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                                    >
                                        {filteredSuggestions.map((s, idx) => (
                                            <button
                                                key={idx}
                                                onMouseDown={() => { setForm(f => ({ ...f, partyName: s })); setShowSuggestions(false); }}
                                                className="w-full text-left px-4 py-2.5 text-xs text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-colors border-b border-[var(--border)]/20 last:border-0"
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Amount (₹)</label>
                        <div className="relative">
                            <IndianRupee size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="number"
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                placeholder="0.00"
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] font-mono"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Date</label>
                        <div className="relative">
                            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="date"
                                value={form.date}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Narration</label>
                        <input
                            type="text"
                            value={form.narration}
                            onChange={e => setForm(f => ({ ...f, narration: e.target.value }))}
                            placeholder="Optional description"
                            className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                        />
                    </div>
                </div>

                {/* Line Items (for Sales/Purchase) */}
                {(form.voucherType === 'Sales' || form.voucherType === 'Purchase') && (
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Line Items</label>
                        <div className="space-y-2">
                            {form.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                    <input
                                        className="col-span-5 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                        placeholder="Item name"
                                        value={item.name}
                                        onChange={e => updateLineItem(idx, 'name', e.target.value)}
                                    />
                                    <input
                                        className="col-span-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                        placeholder="Qty"
                                        type="number"
                                        value={item.qty}
                                        onChange={e => updateLineItem(idx, 'qty', e.target.value)}
                                    />
                                    <input
                                        className="col-span-2 bg-[var(--surface-variant)] border border-[var(--border)] rounded-lg py-2 px-3 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-right font-mono"
                                        placeholder="Rate"
                                        type="number"
                                        value={item.rate}
                                        onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                                    />
                                    <span className="col-span-2 text-xs font-bold text-[var(--on-surface)] text-right font-mono">
                                        ₹{parseFloat(item.amount || '0').toLocaleString('en-IN')}
                                    </span>
                                    <button
                                        onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                                        className="col-span-1 flex justify-center text-[var(--text-muted)] hover:text-red-500"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: '1', rate: '', amount: '' }] }))}
                                className="flex items-center gap-1 text-xs text-[var(--primary)] font-bold hover:underline mt-2"
                            >
                                <Plus size={14} /> Add Line Item
                            </button>
                        </div>
                    </div>
                )}

                {/* Preview & Submit */}
                {form.partyName && form.amount && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-r from-[var(--surface-variant)] to-[var(--surface-active)] rounded-xl p-4 mb-4 border border-[var(--border)]"
                    >
                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Preview</p>
                        <p className="text-sm text-[var(--on-surface)]">
                            <span className="font-bold text-[var(--primary)]">{form.voucherType}</span> •{' '}
                            <span className="font-semibold">{form.partyName}</span> •{' '}
                            <span className="font-black text-emerald-500">₹{parseFloat(form.amount || '0').toLocaleString('en-IN')}</span> •{' '}
                            <span className="text-[var(--text-muted)]">{form.date}</span>
                        </p>
                    </motion.div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={isProcessing || !form.partyName || !form.amount}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-40 shadow-xl"
                >
                    {isProcessing ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Send size={16} />
                            Create Entry & Push to Tally
                        </>
                    )}
                </button>
            </GlassCard>

            {/* Recent Entries */}
            {recentEntries.length > 0 && (
                <GlassCard className="p-6">
                    <h2 className="text-sm font-black text-[var(--on-surface)] mb-4 uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw size={16} className="text-[var(--text-muted)]" /> Recent Pending Entries
                    </h2>
                    <div className="space-y-2">
                        {recentEntries.map((entry, idx) => {
                            const data = entry.voucher_data || {};
                            return (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)]/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${entry.status === 'synced' ? 'bg-emerald-500' : entry.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'
                                            }`} />
                                        <div>
                                            <p className="text-xs font-bold text-[var(--on-surface)]">
                                                {entry.transaction_type} • {data.party_name || 'N/A'}
                                            </p>
                                            <p className="text-[10px] text-[var(--text-muted)]">
                                                {entry.created_at ? format(new Date(entry.created_at), 'dd MMM yy, hh:mm a') : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-[var(--on-surface)]">
                                            ₹{(data.grand_total || data.total_amount || 0).toLocaleString('en-IN')}
                                        </p>
                                        <span className={`text-[8px] font-bold uppercase tracking-widest ${entry.status === 'synced' ? 'text-emerald-500' : entry.status === 'failed' ? 'text-red-500' : 'text-yellow-500'
                                            }`}>
                                            {entry.status}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </GlassCard>
            )}
        </div>
    );
}


import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, pendingTransactionApi } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
    ArrowLeft, Save, Trash2, Plus, X, Calendar,
    User, FileText, IndianRupee, Package, RefreshCw,
    AlertCircle, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(Math.abs(Number(amount)) || 0);

interface LineItem {
    stock_item_name: string;
    hsn_code: string;
    unit: string;
    quantity: number;
    rate: number;
    discount: number;
    amount: number;
}

export default function EditVoucherPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany, user } = useAuth() as any;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [voucher, setVoucher] = useState<any>(null);
    const [isPending, setIsPending] = useState(false); // from pending_transactions

    // Editable fields
    const [partyName, setPartyName] = useState('');
    const [voucherDate, setVoucherDate] = useState('');
    const [voucherType, setVoucherType] = useState('Sales');
    const [narration, setNarration] = useState('');
    const [items, setItems] = useState<LineItem[]>([]);

    // Ledger suggestions for autocomplete
    const [ledgerSuggestions, setLedgerSuggestions] = useState<string[]>([]);
    const [stockSuggestions, setStockSuggestions] = useState<any[]>([]);
    const [showPartySuggestions, setShowPartySuggestions] = useState(false);
    const [activeStockIdx, setActiveStockIdx] = useState<number | null>(null);

    useEffect(() => {
        if (id && selectedCompany) {
            loadVoucher();
            loadSuggestions();
        }
    }, [id, selectedCompany]);

    const loadSuggestions = async () => {
        // Load party ledgers
        const { data: ledgers } = await supabase
            .from('ledgers')
            .select('name')
            .eq('company_id', selectedCompany.id)
            .in('parent', ['Sundry Debtors', 'Sundry Creditors'])
            .order('name')
            .limit(500);
        setLedgerSuggestions((ledgers || []).map(l => l.name));

        // Load stock items for autocomplete
        const { data: stocks } = await supabase
            .from('stock_items')
            .select('name, hsn_code, unit, rate')
            .eq('company_id', selectedCompany.id)
            .order('name')
            .limit(500);
        setStockSuggestions(stocks || []);
    };

    const loadVoucher = async () => {
        setLoading(true);
        try {
            const decodedId = decodeURIComponent(id!);

            // Try vouchers table first
            const { data: vData, error: vError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', decodedId)
                .single();

            if (vData && !vError) {
                setVoucher(vData);
                setIsPending(false);
                setPartyName(vData.party_name || '');
                setVoucherDate(vData.voucher_date || format(new Date(), 'yyyy-MM-dd'));
                setVoucherType(vData.voucher_type || 'Sales');
                setNarration(vData.narration || '');

                // Load stock entries
                const { data: stockEntries } = await supabase
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('voucher_id', vData.id);

                let inventoryItems = stockEntries || [];

                // Fallback to raw_data
                if (inventoryItems.length === 0 && vData.raw_data?.inventory_entries) {
                    inventoryItems = vData.raw_data.inventory_entries;
                }
                if (inventoryItems.length === 0 && vData.inventory_entries) {
                    inventoryItems = vData.inventory_entries;
                }

                setItems(inventoryItems.map((item: any) => ({
                    stock_item_name: item.stock_item_name || item.item_name || item.name || '',
                    hsn_code: item.hsn_code || '',
                    unit: item.unit || 'pcs',
                    quantity: Number(item.quantity) || 0,
                    rate: Number(item.rate) || 0,
                    discount: Number(item.discount_percent || item.discount) || 0,
                    amount: Number(item.amount) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0))
                })));
            } else {
                // Try pending_transactions
                const { data: pData, error: pError } = await supabase
                    .from('pending_transactions')
                    .select('*')
                    .eq('id', decodedId)
                    .single();

                if (pData && !pError) {
                    const vd = pData.voucher_data || {};
                    setVoucher(pData);
                    setIsPending(true);
                    setPartyName(vd.party_name || vd.customerName || '');
                    setVoucherDate(vd.voucher_date || vd.date || format(new Date(), 'yyyy-MM-dd'));
                    setVoucherType(pData.transaction_type || vd.voucher_type_name || 'Sales');
                    setNarration(vd.narration || '');

                    const rawItems = vd.inventory_entries || vd.items || vd.sales_items || [];
                    setItems(rawItems.map((item: any) => ({
                        stock_item_name: item.stock_item || item.stock_item_name || item.name || '',
                        hsn_code: item.hsn_code || '',
                        unit: item.unit || 'pcs',
                        quantity: Number(item.quantity) || 0,
                        rate: Number(item.rate) || 0,
                        discount: Number(item.discount) || 0,
                        amount: Number(item.amount) || ((Number(item.quantity) || 0) * (Number(item.rate) || 0))
                    })));
                } else {
                    toast.error('Voucher not found');
                    navigate(-1);
                    return;
                }
            }
        } catch (error) {
            console.error('Load error:', error);
            toast.error('Failed to load voucher');
        }
        setLoading(false);
    };

    const updateItem = (idx: number, field: keyof LineItem, value: any) => {
        const newItems = [...items];
        (newItems[idx] as any)[field] = value;
        if (field === 'quantity' || field === 'rate' || field === 'discount') {
            const qty = Number(newItems[idx].quantity) || 0;
            const rate = Number(newItems[idx].rate) || 0;
            const disc = Number(newItems[idx].discount) || 0;
            const base = qty * rate;
            newItems[idx].amount = base - (base * disc / 100);
        }
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, {
            stock_item_name: '',
            hsn_code: '',
            unit: 'pcs',
            quantity: 1,
            rate: 0,
            discount: 0,
            amount: 0
        }]);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const selectStockItem = (idx: number, stock: any) => {
        const newItems = [...items];
        newItems[idx] = {
            ...newItems[idx],
            stock_item_name: stock.name,
            hsn_code: stock.hsn_code || '',
            unit: stock.unit || 'pcs',
            rate: Number(stock.rate) || newItems[idx].rate,
            amount: (Number(newItems[idx].quantity) || 1) * (Number(stock.rate) || newItems[idx].rate)
        };
        setItems(newItems);
        setActiveStockIdx(null);
    };

    const getFilteredStocks = (query: string) => {
        if (!query || query.length < 1) return stockSuggestions.slice(0, 10);
        return stockSuggestions
            .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }, [items]);

    const filteredParties = useMemo(() => {
        if (!partyName || partyName.length < 2) return [];
        return ledgerSuggestions
            .filter(l => l.toLowerCase().includes(partyName.toLowerCase()))
            .slice(0, 8);
    }, [partyName, ledgerSuggestions]);

    const handleSave = async () => {
        if (!partyName.trim()) {
            toast.error('Party name is required');
            return;
        }
        if (items.length === 0) {
            toast.error('At least one item is required');
            return;
        }

        setSaving(true);
        try {
            if (isPending) {
                // Update pending_transaction
                const voucherData = {
                    voucher_type_name: voucherType,
                    party_name: partyName,
                    voucher_date: voucherDate,
                    narration: narration,
                    total_amount: totalAmount,
                    grand_total: totalAmount,
                    inventory_entries: items.map(i => ({
                        stock_item: i.stock_item_name,
                        quantity: i.quantity,
                        rate: i.rate,
                        amount: i.amount,
                        hsn_code: i.hsn_code,
                        unit: i.unit,
                        discount: i.discount
                    }))
                };

                const { error } = await supabase
                    .from('pending_transactions')
                    .update({
                        transaction_type: voucherType,
                        voucher_data: voucherData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', voucher.id);

                if (error) throw error;
                toast.success('Pending entry updated!');
            } else {
                // For synced vouchers: create a modification entry in pending_transactions
                // The sync app will pick this up and update Tally
                const modificationData = {
                    voucher_type_name: voucherType,
                    party_name: partyName,
                    voucher_date: voucherDate,
                    narration: narration,
                    total_amount: totalAmount,
                    grand_total: totalAmount,
                    original_voucher_id: voucher.id,
                    original_voucher_number: voucher.voucher_number,
                    tally_master_id: voucher.tally_master_id,
                    is_modification: true,
                    inventory_entries: items.map(i => ({
                        stock_item: i.stock_item_name,
                        quantity: i.quantity,
                        rate: i.rate,
                        amount: i.amount,
                        hsn_code: i.hsn_code,
                        unit: i.unit,
                        discount: i.discount
                    }))
                };

                const { error } = await supabase
                    .from('pending_transactions')
                    .insert([{
                        company_id: selectedCompany.id,
                        transaction_type: 'VOUCHER_EDIT',
                        voucher_data: modificationData,
                        status: 'pending',
                        created_by: user?.id
                    }]);

                if (error) throw error;

                // Also update the local voucher record for immediate UI consistency
                await supabase
                    .from('vouchers')
                    .update({
                        party_name: partyName,
                        voucher_date: voucherDate,
                        narration: narration,
                        total_amount: totalAmount,
                        grand_total: totalAmount
                    })
                    .eq('id', voucher.id);

                toast.success('Changes saved! Will sync to Tally on next sync.');
            }

            navigate(-1);
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error('Save failed: ' + (error.message || 'Unknown error'));
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-400">Loading Voucher...</p>
            </div>
        );
    }

    if (!voucher) {
        return (
            <div className="p-10 text-center space-y-4">
                <AlertCircle size={48} className="mx-auto text-gray-400" />
                <p className="font-black text-xl uppercase tracking-tighter">Voucher Not Found</p>
                <button
                    onClick={() => navigate(-1)}
                    className="px-6 py-3 bg-[var(--primary)] text-white rounded-xl font-bold text-sm"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] pb-32">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2.5 rounded-2xl bg-[var(--surface-variant)] text-[var(--on-surface)]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-[var(--on-surface)] tracking-tight">Edit Voucher</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                                    {isPending ? 'â³ Pending Entry' : `#${voucher.voucher_number || 'N/A'}`}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2.5 bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-40"
                    >
                        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </header>

            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {!isPending && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-4 items-start animate-in fade-in slide-in-from-top-2">
                        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500 flex-shrink-0">
                            <AlertCircle size={20} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-500">Live Sync Modification</p>
                            <p className="text-xs text-amber-500/80 mt-1 leading-relaxed">
                                This voucher is already synced with Tally. Your edits will be saved locally
                                and queued for synchronization. Tally Desktop app will pick these changes
                                during the next sync cycle.
                            </p>
                        </div>
                    </div>
                )}
                {/* Voucher Type */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">Voucher Type</label>
                    <div className="flex gap-2 flex-wrap">
                        {['Sales', 'Purchase', 'Receipt', 'Payment', 'Journal'].map(type => (
                            <button
                                key={type}
                                onClick={() => setVoucherType(type)}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${voucherType === type
                                    ? 'bg-[var(--primary)] text-white shadow-lg'
                                    : 'bg-[var(--surface-variant)] text-[var(--on-surface-variant)] border border-[var(--border)]'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Basic Info */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3 block">
                        <FileText size={12} className="inline mr-1" /> Basic Details
                    </label>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="relative">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Party / Ledger</label>
                            <div className="relative">
                                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={partyName}
                                    onChange={e => { setPartyName(e.target.value); setShowPartySuggestions(true); }}
                                    onFocus={() => setShowPartySuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowPartySuggestions(false), 200)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                    placeholder="Party name"
                                />
                                <AnimatePresence>
                                    {showPartySuggestions && filteredParties.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto"
                                        >
                                            {filteredParties.map((s, idx) => (
                                                <button
                                                    key={idx}
                                                    onMouseDown={() => { setPartyName(s); setShowPartySuggestions(false); }}
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
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Date</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="date"
                                    value={voucherDate}
                                    onChange={e => setVoucherDate(e.target.value)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5 block">Narration</label>
                            <textarea
                                value={narration}
                                onChange={e => setNarration(e.target.value)}
                                rows={2}
                                placeholder="Optional notes..."
                                className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-3 px-4 text-sm text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                {(voucherType === 'Sales' || voucherType === 'Purchase') && (
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                                <Package size={12} className="inline mr-1" /> Line Items ({items.length})
                            </label>
                            <button
                                onClick={addItem}
                                className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-bold hover:underline"
                            >
                                <Plus size={14} /> Add Item
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map((item, idx) => (
                                <motion.div
                                    key={idx}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-[var(--surface-variant)] border border-[var(--border)]/50 rounded-xl p-4"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div className="flex-1 relative">
                                            <input
                                                className="w-full bg-transparent border-b border-[var(--border)] py-1 text-sm font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] placeholder:text-[var(--text-muted)]"
                                                placeholder="Search stock item..."
                                                value={item.stock_item_name}
                                                onChange={e => { updateItem(idx, 'stock_item_name', e.target.value); setActiveStockIdx(idx); }}
                                                onFocus={() => setActiveStockIdx(idx)}
                                                onBlur={() => setTimeout(() => setActiveStockIdx(null), 200)}
                                            />
                                            <AnimatePresence>
                                                {activeStockIdx === idx && getFilteredStocks(item.stock_item_name).length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto"
                                                    >
                                                        {getFilteredStocks(item.stock_item_name).map((stock, si) => (
                                                            <button
                                                                key={si}
                                                                onMouseDown={() => selectStockItem(idx, stock)}
                                                                className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-variant)] transition-colors border-b border-[var(--border)]/20 last:border-0"
                                                            >
                                                                <span className="text-xs font-bold text-[var(--on-surface)] block">{stock.name}</span>
                                                                <span className="text-[10px] text-[var(--text-muted)]">
                                                                    {stock.hsn_code ? `HSN: ${stock.hsn_code}` : ''} {stock.unit ? `? ${stock.unit}` : ''} {stock.rate ? `? â‚¹${Number(stock.rate).toLocaleString('en-IN')}` : ''}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <button
                                            onClick={() => removeItem(idx)}
                                            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-5 gap-2">
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">HSN</label>
                                            <input
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                                placeholder="HSN"
                                                value={item.hsn_code}
                                                onChange={e => updateItem(idx, 'hsn_code', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Qty</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                                value={item.quantity}
                                                onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Rate</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-right font-mono"
                                                value={item.rate}
                                                onChange={e => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Disc %</label>
                                            <input
                                                type="number"
                                                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)] text-center"
                                                value={item.discount}
                                                onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Amount</label>
                                            <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg py-1.5 px-2 text-xs font-bold text-[var(--on-surface)] text-right font-mono">
                                                â‚¹{Number(item.amount).toLocaleString('en-IN')}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Total Summary */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Grand Total</p>
                            <p className="text-xs text-[var(--text-muted)]">{items.length} item(s)</p>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-black text-[var(--on-surface)] tracking-tight">
                                {formatCurrency(totalAmount)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                {!isPending && (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Synced Voucher</p>
                            <p className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-0.5">
                                Changes will be saved locally and pushed to Tally on the next sync cycle. The original voucher number will be preserved.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Save Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex-1 h-14 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-[20px] border border-[var(--border)] font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-[var(--surface-active)] transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-[2] h-14 bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white rounded-[20px] shadow-xl font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}



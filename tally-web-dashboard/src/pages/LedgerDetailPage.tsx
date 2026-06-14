import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase as insforgeClient, ledgerApi } from '@/lib/supabase';
import {
    ArrowLeft, Phone, Plus, Share2, Bell, FileText, Receipt,
    MessageCircle, Calendar, Printer, TrendingUp, TrendingDown,
    ChevronRight, Package, ShoppingCart, CreditCard, Wallet,
    Edit3, Send, Clock, ArrowUpRight
} from 'lucide-react';
import { GlassCard, Badge, Button, Spinner } from '@/components/ui/GlassUI';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderPortal } from '@/components/layout/HeaderPortal';

const formatCurrency = (amount: number) => {
    const val = Math.abs(amount || 0);
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(val);
};

const formatShortCurrency = (amount: number) => {
    return '₹ ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(amount || 0));
};

const getFYStart = () => {
    const now = new Date();
    const year = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return new Date(year, 3, 1).toISOString().split('T')[0];
};

// Action Button Component
const ActionButton = ({ icon, label, onClick, color = 'primary' }: { icon: React.ReactNode; label: string; onClick?: () => void; color?: string }) => {
    const colors: Record<string, string> = {
        primary: 'text-[var(--primary)]',
        success: 'text-emerald-500',
        warning: 'text-amber-500',
        error: 'text-rose-500',
    };
    return (
        <button onClick={onClick} className="flex flex-col items-center gap-1.5 p-3 min-w-[72px] group">
            <div className={`w-10 h-10 rounded-full bg-[var(--surface-variant)] border border-[var(--border)] flex items-center justify-center ${colors[color]} group-active:scale-90 transition-all`}>
                {icon}
            </div>
            <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
        </button>
    );
};

// Summary Row Component
const SummaryRow = ({
    label,
    value,
    onClick,
    hasArrow = true,
    valueColor = 'default'
}: {
    label: string;
    value: string | number;
    onClick?: () => void;
    hasArrow?: boolean;
    valueColor?: 'default' | 'success' | 'error'
}) => {
    const colorClass = valueColor === 'success' ? 'text-emerald-500' : valueColor === 'error' ? 'text-rose-500' : 'text-[var(--on-surface)]';
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] transition-colors border-b border-[var(--border)] last:border-0"
        >
            <span className="text-sm font-bold text-[var(--on-surface)]">{label}</span>
            <div className="flex items-center gap-2">
                <span className={`text-sm font-black ${colorClass}`}>{value}</span>
                {hasArrow && <ChevronRight size={16} className="text-[var(--text-muted)]" />}
            </div>
        </button>
    );
};

// Section Header Component
const SectionHeader = ({ title }: { title: string }) => (
    <div className="px-4 py-2.5 bg-[var(--surface-variant)]/50">
        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">{title}</span>
    </div>
);

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const supabase: any = insforgeClient;
    const [ledger, setLedger] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ledger' | 'summary' | 'notes' | 'items'>('ledger');
    const [fromDate, setFromDate] = useState(getFYStart());
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [notes, setNotes] = useState('');
    const [noteInput, setNoteInput] = useState('');

    // Summary data
    const [voucherSummary, setVoucherSummary] = useState<Record<string, number>>({});
    const [itemsSold, setItemsSold] = useState<any[]>([]);
    const [itemsPurchased, setItemsPurchased] = useState<any[]>([]);
    const [itemsViewType, setItemsViewType] = useState<'sold' | 'purchased'>('sold');

    // Item History View State
    const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
    const [selectedItemStockId, setSelectedItemStockId] = useState<string | null>(null);
    const [itemHistory, setItemHistory] = useState<any[]>([]);
    const [itemHistoryLoading, setItemHistoryLoading] = useState(false);

    const [summary, setSummary] = useState({
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        count: 0
    });

    const openVoucher = (voucher: any) => {
        const targetId = voucher?.id || voucher?.voucher_id;
        if (!targetId) return;

        const type = String(voucher?.voucher_type || voucher?.transaction_type || '').trim().toLowerCase();
        const encodedId = encodeURIComponent(targetId);
        navigate(type === 'sales' || type === 'sales invoice' ? `/invoice/${encodedId}` : `/vouchers/${encodedId}`, {
            state: { voucher, from: `/ledgers/${id}` }
        });
    };

    useEffect(() => {
        if (id && selectedCompany) loadLedgerDetails();
    }, [id, selectedCompany, fromDate, toDate]);

    const loadItemsSummary = async (voucherRows: any[]) => {
        if (!selectedCompany || !Array.isArray(voucherRows) || voucherRows.length === 0) {
            setItemsSold([]);
            setItemsPurchased([]);
            return;
        }

        const voucherIds = voucherRows.map((v: any) => v?.id).filter(Boolean);
        if (voucherIds.length === 0) {
            setItemsSold([]);
            setItemsPurchased([]);
            return;
        }

        try {
            const { data: stockItems, error: stockItemsError } = await supabase
                .from('stock_items')
                .select('id, name')
                .eq('company_id', selectedCompany.id);

            if (stockItemsError) throw stockItemsError;

            const chunkSize = 40;
            const chunkArray = <T,>(arr: T[], size: number) => {
                const chunks: T[][] = [];
                for (let i = 0; i < arr.length; i += size) {
                    chunks.push(arr.slice(i, i + size));
                }
                return chunks;
            };

            const stockEntries: any[] = [];
            for (const voucherIdChunk of chunkArray(voucherIds, chunkSize)) {
                const { data: entryBatch, error: entryBatchError } = await supabase
                    .from('voucher_stock_entries')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .in('voucher_id', voucherIdChunk);

                if (entryBatchError) throw entryBatchError;
                stockEntries.push(...(entryBatch || []));
            }
            const vouchers = voucherRows || [];
            const voucherMap: Record<string, any> = {};
            vouchers.forEach((v: any) => {
                if (v?.id) voucherMap[v.id] = v;
                if (v?.voucher_id) voucherMap[v.voucher_id] = v;
            });

            const stockLookup: Record<string, string> = {};
            stockItems.forEach((s: any) => {
                stockLookup[String(s.name)] = s.id;
                stockLookup[String(s.name).toLowerCase()] = s.id;
            });

            const soldItems: Record<string, any> = {};
            const purchasedItems: Record<string, any> = {};
            const salesTypes = new Set(['sales', 'sales invoice']);
            const purchaseTypes = new Set(['purchase', 'purchase invoice']);

            const addItem = (bucket: Record<string, any>, itemNameRaw: any, qtyRaw: any, amountRaw: any) => {
                const itemName = String(itemNameRaw || 'Unknown Item').trim() || 'Unknown Item';
                const lookupId = stockLookup[itemName] || stockLookup[itemName.toLowerCase()] || null;
                if (!bucket[itemName]) bucket[itemName] = { name: itemName, quantity: 0, amount: 0, id: lookupId };
                bucket[itemName].quantity += Math.abs(Number(qtyRaw) || 0);
                bucket[itemName].amount += Math.abs(Number(amountRaw) || 0);
            };

            stockEntries.forEach((entry: any) => {
                const vTypeRaw = voucherMap[entry.voucher_id]?.voucher_type || entry.vouchers?.voucher_type || '';
                const vType = String(vTypeRaw).toLowerCase();
                const itemName = entry.stock_item_name || entry.item_name || entry.name || 'Unknown Item';
                const qty = entry.quantity ?? entry.qty ?? 0;
                const amount = entry.amount ?? (Number(entry.rate || 0) * Number(entry.quantity || 0));

                if (salesTypes.has(vType)) addItem(soldItems, itemName, qty, amount);
                if (purchaseTypes.has(vType)) addItem(purchasedItems, itemName, qty, amount);
            });

            // Fallback for older datasets where items are stored in sales_items / purchase_items.
            if (Object.keys(soldItems).length === 0 && Object.keys(purchasedItems).length === 0) {
                const salesRows: any[] = [];
                const purchaseRows: any[] = [];

                for (const voucherIdChunk of chunkArray(voucherIds, chunkSize)) {
                    const [salesRes, purchasesRes] = await Promise.all([
                        supabase
                            .from('sales')
                            .select('id, voucher_id')
                            .eq('company_id', selectedCompany.id)
                            .in('voucher_id', voucherIdChunk),
                        supabase
                            .from('purchases')
                            .select('id, voucher_id')
                            .eq('company_id', selectedCompany.id)
                            .in('voucher_id', voucherIdChunk)
                    ]);

                    if (salesRes.error) throw salesRes.error;
                    if (purchasesRes.error) throw purchasesRes.error;

                    salesRows.push(...(salesRes.data || []));
                    purchaseRows.push(...(purchasesRes.data || []));
                }
                const saleMap: Record<string, string> = {};
                const purchaseMap: Record<string, string> = {};

                salesRows.forEach((row: any) => {
                    if (row?.id && row?.voucher_id) saleMap[row.id] = row.voucher_id;
                });
                purchaseRows.forEach((row: any) => {
                    if (row?.id && row?.voucher_id) purchaseMap[row.id] = row.voucher_id;
                });

                const salesItems: any[] = [];
                const purchaseItems: any[] = [];

                const saleIds = salesRows.map((s: any) => s.id).filter(Boolean);
                const purchaseIds = purchaseRows.map((p: any) => p.id).filter(Boolean);

                for (const saleIdChunk of chunkArray(saleIds, chunkSize)) {
                    const { data: salesItemsBatch, error: salesItemsError } = await supabase
                        .from('sales_items')
                        .select('*')
                        .in('sale_id', saleIdChunk);

                    if (salesItemsError) throw salesItemsError;
                    salesItems.push(...(salesItemsBatch || []));
                }

                for (const purchaseIdChunk of chunkArray(purchaseIds, chunkSize)) {
                    const { data: purchaseItemsBatch, error: purchaseItemsError } = await supabase
                        .from('purchase_items')
                        .select('*')
                        .in('purchase_id', purchaseIdChunk);

                    if (purchaseItemsError) throw purchaseItemsError;
                    purchaseItems.push(...(purchaseItemsBatch || []));
                }

                salesItems.forEach((entry: any) => {
                    const voucherId = saleMap[entry.sale_id];
                    const vType = String(voucherMap[voucherId]?.voucher_type || 'sales').toLowerCase();
                    if (!salesTypes.has(vType)) return;
                    const itemName = entry.item_name || entry.stock_item_name || entry.name || 'Unknown Item';
                    const qty = entry.quantity ?? entry.qty ?? 0;
                    const amount = entry.amount ?? (Number(entry.rate || 0) * Number(entry.quantity || 0));
                    addItem(soldItems, itemName, qty, amount);
                });

                purchaseItems.forEach((entry: any) => {
                    const voucherId = purchaseMap[entry.purchase_id];
                    const vType = String(voucherMap[voucherId]?.voucher_type || 'purchase').toLowerCase();
                    if (!purchaseTypes.has(vType)) return;
                    const itemName = entry.item_name || entry.stock_item_name || entry.name || 'Unknown Item';
                    const qty = entry.quantity ?? entry.qty ?? 0;
                    const amount = entry.amount ?? (Number(entry.rate || 0) * Number(entry.quantity || 0));
                    addItem(purchasedItems, itemName, qty, amount);
                });
            }

            setItemsSold(Object.values(soldItems));
            setItemsPurchased(Object.values(purchasedItems));
        } catch (error) {
            console.error('Error loading item summary:', error);
            setItemsSold([]);
            setItemsPurchased([]);
        }
    };

    const loadLedgerDetails = async () => {
        setLoading(true);
        try {
            // 1. Fetch Ledger Master
            const { data: ledgerData } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', id)
                .single();

            if (!ledgerData) throw new Error('Ledger not found');
            setLedger(ledgerData);

            // 2. Calculate Dynamic Opening Balance
            const { data: beforeVouchers } = await supabase
                .from('vouchers')
                .select('voucher_type, total_amount')
                .eq('company_id', selectedCompany.id)
                .eq('party_name', ledgerData.name)
                .lt('voucher_date', fromDate);

            let dynamicOpening = Number(ledgerData.opening_balance) || 0;

            (beforeVouchers || []).forEach(v => {
                const amount = Math.abs(Number(v.total_amount) || 0);
                const vType = v.voucher_type;
                const isDebit = ['Sales', 'Payment', 'Debit Note'].includes(vType);
                const isCredit = ['Purchase', 'Receipt', 'Credit Note'].includes(vType);

                if (isDebit) dynamicOpening += amount;
                if (isCredit) dynamicOpening -= amount;
            });

            setOpeningBalance(dynamicOpening);

            // 3. Fetch Transactions in Range
            const { data: rangeVouchers } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .eq('party_name', ledgerData.name)
                .gte('voucher_date', fromDate)
                .lte('voucher_date', toDate)
                .order('voucher_date', { ascending: false });

            // 4. Process Running Balance & Voucher Summary
            let running = dynamicOpening;
            let totalDr = 0;
            let totalCr = 0;
            const voucherTotals: Record<string, number> = {};

            const processed = (rangeVouchers || []).map(v => {
                const amount = Math.abs(Number(v.total_amount) || 0);
                const isDebit = ['Sales', 'Payment', 'Debit Note'].includes(v.voucher_type);
                const isCredit = ['Purchase', 'Receipt', 'Credit Note'].includes(v.voucher_type);

                const debitAmt = isDebit ? amount : 0;
                const creditAmt = isCredit ? amount : 0;

                totalDr += debitAmt;
                totalCr += creditAmt;
                running = running + debitAmt - creditAmt;

                // Voucher type summary
                voucherTotals[v.voucher_type] = (voucherTotals[v.voucher_type] || 0) + amount;

                return {
                    ...v,
                    debit: debitAmt,
                    credit: creditAmt,
                    balance: running
                };
            }).reverse();

            setTransactions(processed);
            setVoucherSummary(voucherTotals);
            setSummary({
                totalDebit: totalDr,
                totalCredit: totalCr,
                netAmount: running,
                count: processed.length
            });
            // 5. Load items summary in background so ledger data renders immediately
            loadItemsSummary(rangeVouchers || []);


        } catch (error: any) {
            console.error('Error loading ledger:', error);
            toast.error(error.message || 'Failed to load ledger');
        } finally {
            setLoading(false);
        }
    };

    const fetchItemHistory = async (itemName: string, stockItemId?: string | null) => {
        setSelectedItemName(itemName);
        setSelectedItemStockId(stockItemId || null);
        setItemHistoryLoading(true);
        try {
            if (!selectedCompany?.id || !ledger?.name) {
                setItemHistory([]);
                return;
            }

            const { data, error } = await ledgerApi.getItemHistory(selectedCompany.id, ledger.name, itemName, {
                fromDate,
                toDate,
                sort: 'desc',
                limit: 2000
            } as any);

            if (error) throw error;

            const normalized = (data || []).map((entry: any) => ({
                ...entry,
                vouchers: entry.vouchers || entry.voucher || {
                    id: entry.voucher_id,
                    voucher_date: entry.voucher_date,
                    voucher_number: entry.voucher_number,
                    voucher_type: entry.voucher_type,
                    party_name: entry.party_name
                }
            }));

            setItemHistory(normalized);
        } catch (err) {
            console.error('Error fetching item history:', err);
            toast.error('Failed to load item history');
        } finally {
            setItemHistoryLoading(false);
        }
    };

    const handleCall = () => {
        if (ledger?.phone) {
            window.open(`tel:${ledger.phone}`, '_self');
        } else {
            toast.error('Phone number not available');
        }
    };

    const handleWhatsApp = () => {
        if (ledger?.phone) {
            const message = `Hello ${ledger.name}, your balance as on ${format(parseISO(toDate), 'dd MMM yyyy')} is ${formatCurrency(summary.netAmount)} ${summary.netAmount >= 0 ? 'Dr' : 'Cr'}.`;
            window.open(`https://wa.me/91${ledger.phone}?text=${encodeURIComponent(message)}`, '_blank');
        } else {
            toast.error('Phone number not available');
        }
    };

    const handleShareLedger = () => {
        const shareText = `${ledger.name}\nClosing Balance: ${formatCurrency(summary.netAmount)} ${summary.netAmount >= 0 ? 'Dr' : 'Cr'}\nAs on ${format(parseISO(toDate), 'dd MMM yyyy')}`;

        if (navigator.share) {
            navigator.share({ title: `${ledger.name} - Ledger Statement`, text: shareText });
        } else {
            navigator.clipboard.writeText(shareText);
            toast.success('Copied to clipboard');
        }
    };

    const handleSetReminder = () => {
        toast.success('Reminder feature coming soon!');
    };

    const handleAddNote = () => {
        if (noteInput.trim()) {
            const newNote = `${format(new Date(), 'dd MMM yyyy HH:mm')}: ${noteInput}`;
            setNotes(prev => prev ? `${prev}\n${newNote}` : newNote);
            setNoteInput('');
            toast.success('Note added');
        }
    };

    if (loading && !ledger) {
        return (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Spinner size="lg" />
                <p className="text-[var(--text-muted)] animate-pulse uppercase text-[10px] font-black tracking-widest">Loading Party...</p>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Party not found</p>
                <button onClick={() => navigate('/ledgers')} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Back to Parties
                </button>
            </div>
        );
    }

    const closingBalance = summary.netAmount;

    return (
        <div className="min-h-screen bg-[var(--background)] pb-24 max-w-2xl mx-auto">
            <HeaderPortal type="title">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/ledgers')} className="p-1.5 rounded-xl bg-[var(--surface-variant)] border border-[var(--border)] text-[var(--on-surface-variant)] hover:text-[var(--primary)] transition-colors">
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h1 className="text-sm md:text-base font-black text-[var(--on-surface)] line-clamp-1 leading-none">{ledger.name}</h1>
                        <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight mt-0.5">
                            Balance: <span className={closingBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{formatShortCurrency(closingBalance)}</span>
                        </p>
                    </div>
                </div>
            </HeaderPortal>

            <HeaderPortal type="actions">
                <div className="flex items-center gap-1.5">
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--surface-variant)] border border-[var(--border)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] transition-colors">
                        <Printer size={14} />
                    </button>
                    <button onClick={handleCall} className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                        <Phone size={14} />
                    </button>
                </div>
            </HeaderPortal>

            {/* Header */}
            <div className="sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)]">

                {/* Action Buttons Row */}
                <div className="flex items-center justify-around px-2 py-2 border-t border-[var(--border)]/50">
                    <ActionButton icon={<Phone size={18} />} label="Call" onClick={handleCall} color="error" />
                    <ActionButton icon={<Plus size={18} />} label="Create Entry" onClick={() => navigate('/create-invoice')} />
                    <ActionButton icon={<MessageCircle size={18} />} label="Share Ledger" onClick={handleWhatsApp} color="success" />
                    <ActionButton icon={<Bell size={18} />} label="Set Reminder" onClick={handleSetReminder} color="warning" />
                </div>

                {/* Tabs */}
                <div className="flex border-t border-[var(--border)]">
                    {[
                        { id: 'ledger', label: 'Ledger' },
                        { id: 'items', label: 'Items' }, // New Items Tab
                        { id: 'summary', label: 'Summary' },
                        { id: 'notes', label: `Notes (${notes ? notes.split('\n').length : 0})` }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 py-3 text-[11px] font-black uppercase tracking-wide transition-all relative
                                ${activeTab === tab.id
                                    ? 'text-white bg-emerald-500'
                                    : 'text-[var(--text-muted)] bg-[var(--surface-variant)] hover:bg-[var(--surface-active)]'
                                }
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                {/* LEDGER TAB */}
                {activeTab === 'ledger' && (
                    <motion.div
                        key="ledger"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="p-4 space-y-4"
                    >
                        {/* Opening/Closing Balance Cards */}
                        <div className="flex gap-3">
                            <div className="flex-1 bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
                                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Opening Balance</p>
                                <p className={`text-lg font-black ${openingBalance >= 0 ? 'text-[var(--on-surface)]' : 'text-rose-500'}`}>
                                    {formatShortCurrency(openingBalance)}
                                </p>
                            </div>
                            <div className="flex-1 bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)]">
                                <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Closing Balance</p>
                                <p className={`text-lg font-black ${closingBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {formatShortCurrency(closingBalance)}
                                </p>
                            </div>
                        </div>

                        {/* Transactions List */}
                        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                            {loading ? (
                                <div className="py-16 flex justify-center"><Spinner /></div>
                            ) : transactions.length === 0 ? (
                                <div className="py-16 flex flex-col items-center text-[var(--text-muted)]">
                                    <Receipt size={40} className="mb-3 opacity-30" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No transactions</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--border)]">
                                    {transactions.map((v, idx) => (
                                        <button
                                            key={v.id || idx}
                                            onClick={() => openVoucher(v)}
                                            className="w-full flex items-center justify-between px-4 py-4 hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)] transition-colors text-left"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-black text-[var(--on-surface)]">{v.voucher_number || '---'}</span>
                                                </div>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    {format(new Date(v.voucher_date), 'dd MMM yy')} | {v.voucher_type}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-sm font-black ${v.credit > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    ₹ {new Intl.NumberFormat('en-IN').format(Math.abs(v.credit || v.debit || 0))}
                                                </p>
                                                <ChevronRight size={14} className="text-[var(--text-muted)] ml-auto" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* SUMMARY TAB */}
                {activeTab === 'summary' && (
                    <motion.div
                        key="summary"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                    >
                        {/* Voucher Summary Section */}
                        <div className="bg-[var(--surface)] border-b border-[var(--border)]">
                            <SectionHeader title="Vouchers" />
                            {Object.keys(voucherSummary).length === 0 ? (
                                <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">No vouchers found</div>
                            ) : (
                                Object.entries(voucherSummary).map(([type, amount]) => (
                                    <SummaryRow
                                        key={type}
                                        label={type}
                                        value={formatShortCurrency(amount)}
                                        onClick={() => navigate(`/vouchers?party=${encodeURIComponent(ledger.name)}&type=${type}`)}
                                    />
                                ))
                            )}
                        </div>

                        {/* Items Summary Quick Link */}
                        <div className="bg-[var(--surface)] border-b border-[var(--border)] mt-2">
                            <SectionHeader title="Items Summary" />
                            <SummaryRow
                                label="Items Sold"
                                value={itemsSold.length > 0 ? `${itemsSold.length} unique items` : '-'}
                                onClick={() => {
                                    setItemsViewType('sold');
                                    setActiveTab('items');
                                }}
                                hasArrow={itemsSold.length > 0}
                            />
                            <SummaryRow
                                label="Items Purchased"
                                value={itemsPurchased.length > 0 ? `${itemsPurchased.length} unique items` : '-'}
                                onClick={() => {
                                    setItemsViewType('purchased');
                                    setActiveTab('items');
                                }}
                                hasArrow={itemsPurchased.length > 0}
                            />
                        </div>

                        {/* Party Info Section */}
                        <div className="bg-[var(--surface)] mt-2">
                            <SectionHeader title="Party Details" />
                            <div className="px-4 py-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[var(--text-muted)]">Phone</span>
                                    <span className="text-xs font-bold text-[var(--on-surface)]">{ledger.phone || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[var(--text-muted)]">GSTIN</span>
                                    <span className="text-xs font-bold text-[var(--on-surface)] font-mono">{ledger.gstin || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[var(--text-muted)]">State</span>
                                    <span className="text-xs font-bold text-[var(--on-surface)]">{ledger.state || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[var(--text-muted)]">Credit Days</span>
                                    <span className="text-xs font-bold text-[var(--on-surface)]">{ledger.credit_days || 0} days</span>
                                </div>
                                {ledger.address && (
                                    <div>
                                        <span className="text-xs text-[var(--text-muted)] block mb-1">Address</span>
                                        <span className="text-xs font-bold text-[var(--on-surface)]">{ledger.address}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ITEMS TAB */}
                {activeTab === 'items' && (
                    <motion.div
                        key="items"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="pb-20" // Extra padding for spacing
                    >
                        {/* Toggle Sold/Purchased */}
                        {!selectedItemName && (
                            <div className="flex p-4 gap-2 bg-[var(--surface)] border-b border-[var(--border)]">
                                <button
                                    onClick={() => setItemsViewType('sold')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${itemsViewType === 'sold' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface-variant)] text-[var(--text-muted)] border-[var(--border)]'}`}
                                >
                                    Sold ({itemsSold.length})
                                </button>
                                <button
                                    onClick={() => setItemsViewType('purchased')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${itemsViewType === 'purchased' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface-variant)] text-[var(--text-muted)] border-[var(--border)]'}`}
                                >
                                    Purchased ({itemsPurchased.length})
                                </button>
                            </div>
                        )}

                        {/* Item Details Header (Back Button) */}
                        {selectedItemName && (
                            <div className="sticky top-[118px] z-30 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
                                <button
                                    onClick={() => { setSelectedItemName(null); setSelectedItemStockId(null); }}
                                    className="p-2 -ml-2 rounded-xl text-[var(--on-surface-variant)] hover:bg-[var(--surface-variant)]"
                                >
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="flex-1">
                                    <h3 className="text-sm font-black text-[var(--on-surface)]">{selectedItemName}</h3>
                                    <p className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Transaction History</p>
                                </div>
                                {selectedItemStockId && (
                                    <button
                                        onClick={() => navigate('/stock/' + selectedItemStockId)}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--surface-variant)] border border-[var(--border)] text-[10px] font-black uppercase tracking-wider text-[var(--on-surface)] hover:text-[var(--primary)]"
                                    >
                                        Open Stock
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="p-4 space-y-3">
                            {selectedItemName ? (
                                // Item History View
                                itemHistoryLoading ? (
                                    <div className="py-16 flex justify-center"><Spinner /></div>
                                ) : itemHistory.length === 0 ? (
                                    <div className="py-16 text-center text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">No history found</div>
                                ) : (
                                    <div className="space-y-3">
                                        {itemHistory.map((entry, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => openVoucher(entry.vouchers)}
                                                className="w-full text-left p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm hover:bg-[var(--surface-hover)] transition-all active:scale-[0.99] group"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider">
                                                                {format(new Date(entry.vouchers?.voucher_date), 'dd MMM yyyy')}
                                                            </p>
                                                            <ArrowUpRight size={10} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>
                                                        <p className="text-sm font-black text-[var(--on-surface)]">
                                                            {entry.vouchers?.voucher_type} #{entry.vouchers?.voucher_number}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-black text-[var(--primary)]">
                                                        {formatCurrency(entry.amount)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <span className="px-3 py-1.5 bg-[var(--surface-variant)] rounded-lg text-xs font-bold text-[var(--on-surface)]">
                                                        Qty: {entry.quantity} {entry.unit || 'Units'}
                                                    </span>
                                                    <span className="px-3 py-1.5 bg-[var(--surface-variant)] rounded-lg text-xs font-bold text-[var(--on-surface)]">
                                                        Rate: ₹{entry.rate}
                                                    </span>
                                                    {entry.running_item_qty !== undefined && entry.running_item_qty !== null && (
                                                        <span className="px-3 py-1.5 bg-[var(--surface-variant)] rounded-lg text-xs font-bold text-[var(--primary)]">
                                                            Running: {Number(entry.running_item_qty).toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )
                            ) : (
                                // Items List View
                                (itemsViewType === 'sold' ? itemsSold : itemsPurchased).length === 0 ? (
                                    <div className="text-center py-20 text-[var(--text-muted)] text-xs font-bold uppercase tracking-widest">No items found</div>
                                ) : (
                                    (itemsViewType === 'sold' ? itemsSold : itemsPurchased).map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => fetchItemHistory(item.name, item.id || null)}
                                            className="w-full text-left flex justify-between items-center p-4 bg-[var(--surface)] rounded-2xl border border-[var(--border)] hover:bg-[var(--surface-hover)] transition-all active:scale-[0.99]"
                                        >
                                            <div>
                                                <p className="text-sm font-black text-[var(--on-surface)] mb-1">{item.name}</p>
                                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide">{item.quantity} units total</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-[var(--primary)]">{formatCurrency(item.amount)}</p>
                                                <div className="flex items-center justify-end gap-1 mt-1 text-[var(--primary)] opacity-80">
                                                    <span className="text-[9px] font-bold uppercase tracking-wider">History</span>
                                                    <ChevronRight size={12} />
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )
                            )}
                        </div>
                    </motion.div>
                )}

                {/* NOTES TAB */}
                {activeTab === 'notes' && (
                    <motion.div
                        key="notes"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="p-4 space-y-4"
                    >
                        {/* Existing Notes */}
                        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] overflow-hidden min-h-[200px]">
                            {notes ? (
                                <div className="p-4 space-y-3">
                                    {notes.split('\n').map((note, i) => (
                                        <div key={i} className="p-3 bg-[var(--surface-variant)] rounded-xl">
                                            <p className="text-xs text-[var(--on-surface)]">{note}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                                    <Edit3 size={32} className="mb-3 opacity-30" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No notes yet</p>
                                    <p className="text-[10px] mt-1 opacity-60">Add a note below</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Note Input (for Notes Tab) */}
            {activeTab === 'notes' && (
                <div className="fixed bottom-20 left-0 right-0 p-4 bg-[var(--surface)] border-t border-[var(--border)] max-w-2xl mx-auto">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            placeholder="Enter Notes"
                            className="flex-1 bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--on-surface)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                        />
                        <button
                            onClick={handleAddNote}
                            disabled={!noteInput.trim()}
                            className="px-5 py-3 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-transform"
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}

            {/* Floating WhatsApp Button */}
            <div className="fixed bottom-24 right-4 z-50 md:hidden">
                <button
                    onClick={handleWhatsApp}
                    className="w-14 h-14 rounded-full bg-emerald-500 shadow-2xl shadow-emerald-500/40 flex items-center justify-center text-white active:scale-90 transition-transform"
                >
                    <MessageCircle size={24} fill="white" />
                </button>
            </div>

            {/* Modal removed - fully using Tabs for items view now */}
        </div >
    );
}

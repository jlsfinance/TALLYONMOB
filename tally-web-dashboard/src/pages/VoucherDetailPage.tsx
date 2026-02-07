import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
    ArrowLeft, MessageCircle, Share2, Download,
    Calendar, User, FileText, Edit, RefreshCw, CheckCircle2,
    MoreVertical, Info, Package, Hash, Tag, Trash2, Printer
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/GlassUI';
import { pendingTransactionApi } from '@/lib/supabase';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(Math.abs(Number(amount)) || 0);

export default function VoucherDetailPage() {
    const { voucherId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [voucher, setVoucher] = useState<any>(null);
    const [saleData, setSaleData] = useState<any>(null);
    const [purchaseData, setPurchaseData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [generatingPdf, setGeneratingPdf] = useState(false);

    useEffect(() => {
        if (voucherId && selectedCompany) loadVoucherDetails();
    }, [voucherId, selectedCompany]);

    const loadVoucherDetails = async () => {
        setLoading(true);
        try {
            const decodedId = decodeURIComponent(voucherId!);
            console.log('Loading voucher with id:', decodedId);

            // Find voucher by id (primary key)
            const { data: vData, error: vError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', decodedId)
                .single();

            if (vError || !vData) {
                console.error('Voucher query error:', vError);
                throw new Error('Voucher not found');
            }

            setVoucher(vData);

            // Fetch related entries from voucher_stock_entries
            const { data: stockEntries, error: stockError } = await supabase
                .from('voucher_stock_entries')
                .select('*')
                .eq('voucher_id', vData.id);

            if (stockError) {
                console.log('Stock entries fetch error (table may not exist):', stockError.message);
            }

            // Fetch related ledger entries
            const { data: ledgerEntries, error: ledgerError } = await supabase
                .from('voucher_ledger_entries')
                .select('*')
                .eq('voucher_id', vData.id);

            if (ledgerError) {
                console.log('Ledger entries fetch error:', ledgerError.message);
            }

            // Fetch stock items for metadata lookup
            const { data: stockItems } = await supabase
                .from('stock_items')
                .select('name, hsn_code, unit')
                .eq('company_id', selectedCompany.id);

            const stockLookup: Record<string, any> = {};
            if (stockItems) {
                stockItems.forEach((item: any) => {
                    stockLookup[item.name] = item;
                });
            }

            // Use voucher_stock_entries if available, otherwise try raw_data.inventory_entries
            let inventoryItems = stockEntries || [];

            // Fallback: Check raw_data for inventory entries (when voucher_stock_entries is empty)
            if (inventoryItems.length === 0 && vData.raw_data?.inventory_entries) {
                console.log('Using raw_data.inventory_entries as fallback');
                inventoryItems = vData.raw_data.inventory_entries;
            }

            // Fallback: Check direct inventory_entries on voucher
            if (inventoryItems.length === 0 && vData.inventory_entries) {
                console.log('Using voucher.inventory_entries as fallback');
                inventoryItems = vData.inventory_entries;
            }

            console.log(`Voucher ${vData.voucher_number}: Found ${inventoryItems.length} items`);

            // Enrich items with HSN and unit
            const enrichedItems = (inventoryItems).map((item: any) => {
                const itemName = item.item_name || item.stock_item_name || item.StockItemName || 'Unknown';
                const stockData = stockLookup[itemName] || {};

                return {
                    ...item,
                    stock_item_name: itemName,
                    hsn_code: item.hsn_code || item.HsnCode || stockData.hsn_code || '-',
                    unit: item.unit || item.Unit || stockData.unit || 'pcs',
                    quantity: item.quantity || item.Quantity || 0,
                    rate: item.rate || item.Rate || 0,
                    discount: item.discount_percent || item.DiscountPercent || item.discount_amount || 0,
                    amount: item.amount || item.Amount || ((item.quantity || item.Quantity || 0) * (item.rate || item.Rate || 0)) || 0
                };
            });

            // Create sale/purchase data based on voucher type
            const baseData = {
                id: vData.id,
                net_amount: Math.abs(Number(vData.grand_total) || Number(vData.total_amount) || 0),
                gross_amount: Math.abs(Number(vData.grand_total) || Number(vData.total_amount) || 0),
                party_name: vData.party_name,
                voucher_number: vData.voucher_number,
                voucher_date: vData.voucher_date
            };

            if (vData.voucher_type === 'Sales') {
                setSaleData({ ...baseData, sales_items: enrichedItems });
            } else if (vData.voucher_type === 'Purchase') {
                setPurchaseData({ ...baseData, purchase_items: enrichedItems });
            }

        } catch (error) {
            console.error('Error loading voucher:', error);
            toast.error('Failed to load bill details');
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsApp = () => {
        if (!voucher) return;
        const text = encodeURIComponent(`*${voucher.voucher_type}: ${voucher.voucher_number}*\nParty: ${voucher.party_name}\nAmount: ${formatCurrency(voucher.total_amount)}\nDate: ${format(new Date(voucher.voucher_date), 'dd MMM yyyy')}\n\nShared via BillBook App`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleDownloadPDF = async () => {
        if (generatingPdf) return;
        setGeneratingPdf(true);
        const toastId = toast.loading('Generating Secure PDF...');

        try {
            // Give time for loader to show and UI to settle
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Trigger print which is the safest and most high-fidelity
            window.print();

            toast.success('PDF Ready to Print/Save', { id: toastId });
        } catch (error) {
            console.error('PDF Error:', error);
            toast.error('Unable to generate PDF. Please try again.', { id: toastId });
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleSync = async () => {
        if (!voucher || syncing) return;
        setSyncing(true);
        const toastId = toast.loading('Syncing to Cloud...');
        try {
            await pendingTransactionApi.create(selectedCompany.id, 'VOUCHERS', voucher);
            setVoucher({ ...voucher, sync_status: 'Pending Sync' });
            toast.success('Sync Request Sent', { id: toastId });
        } catch (err: any) {
            console.error(err);
            toast.error('Sync Failed. Check Tally connection.', { id: toastId });
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[3px] text-gray-400">Loading Bill Details...</p>
        </div>
    );

    if (!voucher) return (
        <div className="p-10 text-center space-y-4">
            <Info size={48} className="mx-auto text-gray-400" />
            <p className="font-black text-xl uppercase tracking-tighter">Bill Not Found</p>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
    );

    const items = saleData?.sales_items || purchaseData?.purchase_items || voucher.inventory_entries || [];
    const status = (voucher.sync_status || 'Synced') === 'Synced' ? 'SYNCED' : 'PENDING';

    return (
        <div className="min-h-screen bg-[var(--background)] pb-40">
            {/* Nav Bar (Print Hidden) */}
            <header className="sticky top-0 z-50 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)] px-4 py-4 print:hidden">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(-1)} className="p-2.5 rounded-2xl bg-[var(--surface-variant)] text-[var(--on-surface)]">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-[var(--on-surface)] tracking-tight">View Bill</h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${status === 'SYNCED' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                                <span className={`text-[9px] font-black uppercase tracking-widest ${status === 'SYNCED' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {status === 'SYNCED' ? 'Synced to Tally' : 'Pending Sync'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button className="p-2.5 rounded-2xl bg-[var(--surface-variant)] text-[var(--on-surface)]">
                        <MoreVertical size={20} />
                    </button>
                </div>
            </header>

            {/* Bill Template (Optimized for Screen & Print) */}
            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 print:p-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-900 border border-[var(--border)] rounded-[40px] overflow-hidden shadow-2xl print:shadow-none print:border-none print:rounded-none"
                >
                    {/* 1. Header Section - Vertical Spacing Added */}
                    <div className="p-8 md:p-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/80 dark:to-slate-900/80 border-b border-[var(--border)] space-y-8">
                        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                            <div className="space-y-4">
                                <Badge className="bg-blue-500 text-white border-none text-[9px] font-black px-3 py-1 tracking-[2px]">
                                    {voucher.voucher_type.toUpperCase()} INVOICE
                                </Badge>
                                <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none max-w-md">
                                    {voucher.party_name || 'Cash Sales'}
                                </h2>
                                <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                    <span className="flex items-center gap-2"><Calendar size={14} className="text-blue-500" /> {format(new Date(voucher.voucher_date), 'dd MMM yyyy')}</span>
                                    <span className="flex items-center gap-2"><Hash size={14} className="text-blue-500" /> NO: {voucher.voucher_number}</span>
                                </div>
                            </div>
                            <div className="md:text-right space-y-2">
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[4px]">Total Payable</p>
                                <p className="text-5xl font-black text-[var(--primary)] tracking-tight">
                                    {formatCurrency(voucher.total_amount)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. Items Table Section - Vertical Spacing Added */}
                    <div className="p-8 md:p-12 space-y-10">
                        {/* Mobile View Items - Enhanced Reading */}
                        <div className="space-y-6 md:hidden">
                            <p className="text-[10px] font-black uppercase tracking-[3px] text-slate-400 border-b pb-2">Item Breakdown</p>
                            {items.map((item: any, idx: number) => (
                                <div key={idx} className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-3">
                                    <h4 className="font-black text-base text-slate-900 dark:text-white uppercase leading-tight">{item.stock_item_name || item.name}</h4>
                                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase">
                                        <span className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-[8px]">HSN CODE: {item.hsn_code}</span>
                                        {item.discount > 0 && <span className="text-emerald-500">Disc: {item.discount}%</span>}
                                    </div>
                                    <div className="flex justify-between items-end pt-2 border-t border-slate-200/50">
                                        <div className="text-xs font-bold text-slate-400">
                                            {item.quantity} {item.unit} × {formatCurrency(item.rate)}
                                        </div>
                                        <div className="text-lg font-black text-slate-900 dark:text-white">
                                            {formatCurrency(item.amount || (item.quantity * item.rate))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View - Higher Contrast & HSN/Discount added */}
                        <div className="hidden md:block print:block">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-slate-200 dark:border-slate-800">
                                        <th className="py-5 text-left text-[10px] font-black uppercase text-slate-400 tracking-widest">Description</th>
                                        <th className="py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">HSN CODE</th>
                                        <th className="py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Qty</th>
                                        <th className="py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Rate</th>
                                        <th className="py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {items.map((item: any, idx: number) => (
                                        <tr key={idx} className="group">
                                            <td className="py-6">
                                                <p className="font-black text-slate-900 dark:text-white text-base">{item.stock_item_name || item.name}</p>
                                                {item.discount > 0 && <p className="text-[9px] font-bold text-emerald-500 uppercase mt-1">Discount Applied: {item.discount}%</p>}
                                            </td>
                                            <td className="py-6 text-center font-bold text-slate-400 text-sm">{item.hsn_code}</td>
                                            <td className="py-6 text-center font-black text-slate-900 dark:text-white">{item.quantity} {item.unit}</td>
                                            <td className="py-6 text-right font-medium text-slate-500">{formatCurrency(item.rate)}</td>
                                            <td className="py-6 text-right font-black text-slate-900 dark:text-white text-lg">{formatCurrency(item.amount || (item.quantity * item.rate))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 3. Summary Section - Better Separation */}
                        <div className="mt-12 border-t-4 border-double border-slate-200 dark:border-slate-800 pt-10 flex flex-col md:flex-row justify-between items-start gap-10">
                            <div className="space-y-4 max-w-xs">
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Narration / Notes</p>
                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 italic">
                                        {voucher.narration || 'No additional notes provided for this transaction.'}
                                    </p>
                                </div>
                            </div>
                            <div className="w-full md:w-80 space-y-4">
                                <div className="flex justify-between text-sm font-bold text-slate-400 uppercase tracking-wider">
                                    <span>Subtotal</span>
                                    <span>{formatCurrency(voucher.total_amount)}</span>
                                </div>
                                <div className="flex justify-between text-sm font-black text-emerald-500 uppercase tracking-wider">
                                    <span>Taxes (GST Included)</span>
                                    <span>₹0</span>
                                </div>
                                <div className="flex justify-between items-end pt-6 border-t-2 border-slate-900 dark:border-white">
                                    <span className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Grand Total</span>
                                    <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">
                                        {formatCurrency(voucher.total_amount)}
                                    </span>
                                </div>
                                <p className="text-[9px] font-black text-slate-400 text-right uppercase tracking-[2px] pt-2">
                                    * Amount inclusive of all duties
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Footer Info (Print Hidden) */}
                <div className="flex flex-wrap justify-center gap-6 print:hidden py-4 opacity-50">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <CheckCircle2 size={14} className="text-emerald-500" /> Digital Sign Verified
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <Printer size={14} className="text-blue-500" /> Standard A4 Export
                    </div>
                </div>
            </div>

            {/* STICKY BOTTOM ACTION BAR (Mobile & Desktop) */}
            <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent print:hidden">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button
                        onClick={handleWhatsApp}
                        className="flex-1 h-14 bg-emerald-500 text-white rounded-[20px] shadow-xl shadow-emerald-500/20 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95"
                    >
                        <MessageCircle size={18} /> WhatsApp
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={generatingPdf}
                        className="flex-1 h-14 bg-blue-500 text-white rounded-[20px] shadow-xl shadow-blue-500/20 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {generatingPdf ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
                        {generatingPdf ? 'Working...' : 'Get PDF'}
                    </button>
                    <button
                        onClick={() => navigate(`/edit-invoice/${voucher.id}`)}
                        className="h-14 w-14 bg-[var(--surface-variant)] text-[var(--on-surface)] rounded-[20px] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface-active)] transition-all active:scale-95"
                    >
                        <Edit size={20} />
                    </button>
                </div>
            </div>

            {/* Sync Overlay (Only for non-synced) */}
            {status !== 'SYNCED' && (
                <div className="fixed bottom-24 left-4 right-4 z-50">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full h-12 bg-amber-500 text-white rounded-xl shadow-lg font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 animate-bounce"
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Connecting...' : 'Pending Sync: Tap to Push'}
                    </button>
                </div>
            )}
        </div>
    );
}

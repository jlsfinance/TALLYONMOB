import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase as insforgeClient, voucherApi } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
    ArrowLeft, MessageCircle, Share2, Download,
    Calendar, User, FileText, Edit, RefreshCw, CheckCircle2,
    MoreVertical, Info, Package, Hash, Tag, Trash2, Printer,
    ArrowUpRight, Share, Box, Send
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/GlassUI';
import { pendingTransactionApi } from '@/lib/supabase';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { HeaderPortal } from '@/components/layout/HeaderPortal';
import toast from 'react-hot-toast';
import { generateTallyVoucherXml, sendToTally } from '@/services/tallyExportService';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
}).format(Math.abs(Number(amount)) || 0);

const DR_TYPES = new Set(['Sales', 'Sales Invoice', 'Payment', 'Debit Note']);
const CR_TYPES = new Set(['Purchase', 'Purchase Invoice', 'Receipt', 'Credit Note']);

export default function VoucherDetailPage() {
    const { voucherId } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const supabase: any = insforgeClient;
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


            if (decodedId === 'undefined' || !decodedId) {
                toast.error('Invalid Voucher ID');
                navigate(-1);
                return;
            }

            // Find voucher by id (primary key)
            const { data: vData, error: vError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('id', decodedId)
                .single();

            if (vError || !vData) {
                console.error('Voucher query error:', vError);

                // Try to find in pending_transactions as fallback
                const { data: pData } = await supabase
                    .from('pending_transactions')
                    .select('*')
                    .eq('id', decodedId)
                    .single();

                if (pData) {
                    const vDataRaw = pData.voucher_data || {};
                    const mappedVoucher = {
                        ...vDataRaw,
                        id: pData.id,
                        status: pData.status,
                        voucher_type: pData.transaction_type || vDataRaw.voucherType || 'Sales',
                        voucher_number: vDataRaw.voucher_number || vDataRaw.invoiceNumber || 'NEW',
                        voucher_date: vDataRaw.voucher_date || vDataRaw.date || pData.created_at,
                        party_name: vDataRaw.party_name || vDataRaw.customerName || 'Pending Customer',
                        total_amount: vDataRaw.total_amount || vDataRaw.grand_total || vDataRaw.total || 0,
                        narration: vDataRaw.narration,
                        inventory_entries: vDataRaw.inventory_entries || vDataRaw.items || [],
                        sync_status: pData.status === 'failed' ? 'Sync Failed' : 'Pending Sync',
                        created_at: pData.created_at
                    };
                    setVoucher(mappedVoucher);
                    setLoading(false);
                    return;
                }
                throw new Error('Voucher not found');
            }

            let mainVoucher = vData;

            // Fallback: If party_ledger_id is missing but party_name exists, try to find it
            if (!mainVoucher.party_ledger_id && mainVoucher.party_name) {
                const { data: pData } = await supabase
                    .from('ledgers')
                    .select('id')
                    .eq('company_id', selectedCompany.id)
                    .ilike('name', mainVoucher.party_name.trim())
                    .maybeSingle();

                if (pData) {
                    mainVoucher = { ...mainVoucher, party_ledger_id: pData.id };
                }
            }

            const ctxRes = await voucherApi.getWithContext(vData.id, {
                companyId: selectedCompany.id,
                ledgerName: mainVoucher.party_name
            } as any);

            setVoucher({
                ...mainVoucher,
                context: ctxRes.data?.context || null,
                inventory_entries: Array.isArray(mainVoucher.inventory_entries) ? mainVoucher.inventory_entries : [],
                ledger_entries: Array.isArray(mainVoucher.ledger_entries) ? mainVoucher.ledger_entries : []
            });

            // Fetch stock entries, ledger entries, and stock items in PARALLEL
            const voucherLookupIds = Array.from(new Set([vData.id, vData.voucher_id, decodedId].filter(Boolean)));
            const [stockResult, ledgerResult, stockItemsResult] = await Promise.all([
                supabase.from('voucher_stock_entries').select('*').in('voucher_id', voucherLookupIds),
                supabase.from('voucher_ledger_entries').select('*').in('voucher_id', voucherLookupIds),
                supabase.from('stock_items').select('id, name, hsn_code, unit, gst_rate').eq('company_id', selectedCompany.id)
            ]);
            const stockEntries = stockResult.data;
            const stockError = stockResult.error;
            const ledgerEntries = ledgerResult.data;
            const stockItems = stockItemsResult.data;
            console.log('[VoucherDetail] voucher_id=' + vData.id + ' stockEntries=' + (stockEntries?.length ?? 'null') + ' ledgerEntries=' + (ledgerEntries?.length ?? 'null'));

            const stockLookup: Record<string, any> = {};
            if (stockItems) {
                stockItems.forEach((item: any) => {
                    stockLookup[item.name] = item;
                    stockLookup[String(item.name || '').toLowerCase()] = item;
                });
            }

                        // Use voucher_stock_entries if available, otherwise fall back to raw payload.
            let inventoryItems = stockEntries || [];

            const parsedRawData = (() => {
                if (!vData?.raw_data) return {};
                if (typeof vData.raw_data === 'object') return vData.raw_data;
                if (typeof vData.raw_data === 'string') {
                    try {
                        return JSON.parse(vData.raw_data);
                    } catch (_) {
                        return {};
                    }
                }
                return {};
            })();

            if (inventoryItems.length === 0) {
                inventoryItems =
                    parsedRawData.inventory_entries
                    || parsedRawData.inventoryEntries
                    || parsedRawData.items
                    || parsedRawData.stock_entries
                    || vData.inventory_entries
                    || vData.items
                    || [];
            }
            // Fallback to sales_items / purchase_items for older sync datasets.
            const loadItemsFromRelatedTable = async (parentTable: string, childTable: string, childForeignKey: string) => {
                const parentIds = new Set<string>();

                const addParentIds = (rows: any[] | null | undefined) => {
                    (rows || []).forEach((row: any) => row?.id && parentIds.add(row.id));
                };

                const matchCompany = supabase.from(parentTable).select('id').eq('company_id', selectedCompany.id);

                const { data: byVoucherId } = await matchCompany.in('voucher_id', voucherLookupIds);
                addParentIds(byVoucherId);

                const { data: byParentId } = await supabase
                    .from(parentTable)
                    .select('id')
                    .eq('company_id', selectedCompany.id)
                    .in('id', voucherLookupIds);
                addParentIds(byParentId);

                if (vData.master_id) {
                    const { data: byMasterId } = await supabase
                        .from(parentTable)
                        .select('id')
                        .eq('company_id', selectedCompany.id)
                        .eq('master_id', vData.master_id);
                    addParentIds(byMasterId);
                }

                if (vData.alter_id) {
                    const { data: byAlterId } = await supabase
                        .from(parentTable)
                        .select('id')
                        .eq('company_id', selectedCompany.id)
                        .eq('alter_id', vData.alter_id);
                    addParentIds(byAlterId);
                }

                if (vData.voucher_number) {
                    let invoiceQuery = supabase
                        .from(parentTable)
                        .select('id')
                        .eq('company_id', selectedCompany.id)
                        .eq('invoice_number', vData.voucher_number);

                    if (vData.voucher_date) {
                        invoiceQuery = invoiceQuery.eq('invoice_date', vData.voucher_date);
                    }

                    if (vData.party_name) {
                        invoiceQuery = invoiceQuery.ilike('party_ledger_name', String(vData.party_name).trim());
                    }

                    const { data: byInvoiceIdentity } = await invoiceQuery;
                    addParentIds(byInvoiceIdentity);
                }

                const parentIdList = Array.from(parentIds);
                if (parentIdList.length === 0) return [];

                const { data: childRows } = await supabase
                    .from(childTable)
                    .select('*')
                    .in(childForeignKey, parentIdList);

                return childRows || [];
            };

            if (inventoryItems.length === 0 && String(vData.voucher_type || '').toLowerCase().includes('sale')) {
                inventoryItems = await loadItemsFromRelatedTable('sales', 'sales_items', 'sale_id');
            }

            if (inventoryItems.length === 0 && String(vData.voucher_type || '').toLowerCase().includes('purchase')) {
                inventoryItems = await loadItemsFromRelatedTable('purchases', 'purchase_items', 'purchase_id');
            }
            // Enrich items with HSN and unit
            const enrichedItems = (inventoryItems).map((item: any) => {
                const itemName = item.item_name || item.stock_item_name || item.StockItemName || item.name || 'Unknown';
                const stockData = stockLookup[itemName] || stockLookup[String(itemName).toLowerCase()] || {};

                const rawGst = item.gst_rate ?? item.tax_rate ?? item.GSTRate ?? item.gst ?? stockData.gst_rate ?? 0;
                const rawDiscount = item.discount_percent ?? item.DiscountPercent ?? item.discount_amount ?? item.discount ?? item.disc ?? 0;
                const rawQty = item.quantity ?? item.Quantity ?? item.qty ?? item.billed_qty ?? item.actual_qty ?? 0;
                const rawRate = item.rate ?? item.Rate ?? item.unit_price ?? 0;
                const rawAmount = item.amount ?? item.Amount ?? item.line_total ?? (Number(rawQty) * Number(rawRate));

                return {
                    ...item,
                    stock_item_id: stockData.id,
                    stock_item_name: itemName,
                    hsn_code: item.hsn_code || item.hsn || item.HsnCode || stockData.hsn_code || '-',
                    unit: item.unit || item.Unit || stockData.unit || 'pcs',
                    quantity: Number(rawQty),
                    rate: Number(rawRate),
                    gst_rate: Number(rawGst),
                    discount: Number(rawDiscount),
                    amount: Number(rawAmount)
                };
            });

            setVoucher((current: any) => current ? ({
                ...current,
                inventory_entries: enrichedItems,
                ledger_entries: ledgerEntries || current.ledger_entries || []
            }) : current);

            // Create sale/purchase data based on voucher type
            const baseData = {
                id: vData.id,
                net_amount: Math.abs(Number(vData.grand_total) || Number(vData.total_amount) || 0),
                gross_amount: Math.abs(Number(vData.grand_total) || Number(vData.total_amount) || 0),
                party_name: vData.party_name,
                voucher_number: vData.voucher_number,
                voucher_date: vData.voucher_date
            };

            const normalizedVoucherType = String(vData.voucher_type || '').toLowerCase();
            if (normalizedVoucherType.includes('sale')) {
                setSaleData({ ...baseData, sales_items: enrichedItems });
            } else if (normalizedVoucherType.includes('purchase')) {
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

    const handleDownloadPDF = () => {
        // Navigate to the proper PDF page which uses jsPDF for professional PDF generation
        navigate(`/invoice/${voucherId}`);
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

    const handleSyncToTally = async () => {
        if (!voucher) return;
        const toastId = toast.loading('Sending to Tally...');
        try {
            const xml = generateTallyVoucherXml({
                ...voucher,
                company_name: selectedCompany?.name || '',
                items: saleData?.sales_items || purchaseData?.purchase_items || voucher.inventory_entries || [],
                ledger_entries: voucher.ledger_entries || []
            });
            const result = await sendToTally(xml);
            if (result.success) {
                toast.success('Synced to Tally!', { id: toastId });
            } else {
                toast.error(`Tally Error: ${result.error}`, { id: toastId });
            }
        } catch (err: any) {
            toast.error('Sync failed: ' + err.message, { id: toastId });
        }
    };

    if (loading) return (
        <div className="min-h-screen flex flex-col items-center justify-center space-y-4 bg-[var(--background)]">
            <RefreshCw className="w-8 h-8 text-[var(--primary)] animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[3px] text-[var(--text-muted)]">Loading...</p>
        </div>
    );

    if (!voucher) return (
        <div className="min-h-screen p-10 flex flex-col items-center justify-center text-center space-y-4 bg-[var(--background)]">
            <Info size={48} className="text-[var(--text-muted)] opacity-50" />
            <p className="font-black text-xl text-[var(--on-surface)] uppercase tracking-tighter">Bill Not Found</p>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
        </div>
    );

    const items = saleData?.sales_items || purchaseData?.purchase_items || voucher.inventory_entries || [];
    const accountingVoucherWithoutItems = Boolean(voucher?.is_accounting_voucher) && items.length === 0;
    const status = (voucher.sync_status || 'Synced') === 'Synced' ? 'SYNCED' : 'PENDING';
    const voucherAmount = Math.abs(Number(voucher.total_amount || voucher.grand_total || 0));
    const fallbackIsDebit = DR_TYPES.has(voucher.voucher_type);
    const fallbackIsCredit = CR_TYPES.has(voucher.voucher_type);
    const voucherEffect = voucher.context?.voucher_effect || {
        debit: fallbackIsDebit ? voucherAmount : 0,
        credit: fallbackIsCredit ? voucherAmount : 0,
        net: (fallbackIsDebit ? voucherAmount : 0) - (fallbackIsCredit ? voucherAmount : 0)
    };


    return (
        <div className="min-h-screen bg-[var(--background)] pb-32 font-['Inter',sans-serif]">
            {/* Header Actions Portal */}
            <HeaderPortal type="actions">
                <div className="flex items-center gap-0.5 md:gap-1">
                    <button
                        onClick={handleWhatsApp}
                        className="p-2 rounded-xl text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-all"
                        title="WhatsApp"
                    >
                        <MessageCircle size={18} />
                    </button>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={generatingPdf}
                        className="p-2 rounded-xl text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-all"
                        title="Share PDF"
                    >
                        {generatingPdf ? <RefreshCw size={18} className="animate-spin" /> : <Share size={18} />}
                    </button>
                    <button
                        onClick={() => navigate(`/edit-invoice/${voucherId}`)}
                        className="p-2 rounded-xl text-[var(--on-surface)] hover:bg-[var(--surface-variant)] transition-all"
                        title="Edit Invoice"
                    >
                        <Edit size={18} />
                    </button>
                    <button
                        onClick={handleSyncToTally}
                        className="p-2 rounded-xl text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] shadow-sm transition-all"
                        title="Sync to Tally"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </HeaderPortal>

            {/* Local Sticky Header - Simplified with only Back Button */}
            <header className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between bg-[var(--background)]/80 backdrop-blur-md border-b border-[var(--border)]/50">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 rounded-full active:bg-[var(--surface-variant)] text-[var(--on-surface)] transition-all"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 px-4">
                    <p className="text-[10px] font-black uppercase tracking-[2px] text-[var(--text-muted)] truncate">
                        {voucher.voucher_type} #{voucher.voucher_number}
                    </p>
                </div>
            </header>

            <main className="px-5 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* 1. Hero Amount Section - Centered & Bold */}
                <div className="text-center space-y-2 py-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[3px] text-[var(--text-muted)] opacity-60">Total Payable</p>
                    <h1 className="text-5xl md:text-6xl font-black text-[var(--on-surface)] tracking-tighter tabular-nums leading-none">
                        {formatCurrency(voucher.total_amount || voucher.grand_total || 0).replace('.00', '')}
                    </h1>
                    <div className="flex justify-center pt-2">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${status === 'SYNCED' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-amber-500/30 text-amber-500 bg-amber-500/5'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${status === 'SYNCED' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            {status === 'SYNCED' ? 'Synced' : 'Pending'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Voucher Effect</p>
                        <p className={"text-sm font-black " + ((voucherEffect.net || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                            {(voucherEffect.net || 0) >= 0 ? 'Dr +' : 'Cr -'} {formatCurrency(voucherEffect.net || 0)}
                        </p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Debit</p>
                        <p className="text-sm font-black text-emerald-500">{formatCurrency(voucherEffect.debit || 0)}</p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Credit</p>
                        <p className="text-sm font-black text-rose-500">{formatCurrency(voucherEffect.credit || 0)}</p>
                    </div>
                </div>

                {voucher.context?.running_balance_after !== null && voucher.context?.running_balance_after !== undefined && (
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Running Balance After This Voucher</p>
                        <p className={"text-lg font-black " + (Number(voucher.context.running_balance_after) >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                            {formatCurrency(voucher.context.running_balance_after)} {Number(voucher.context.running_balance_after) >= 0 ? 'Dr' : 'Cr'}
                        </p>
                    </div>
                )}

                {/* 2. Bill Context Card */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[32px] p-6 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Hash size={120} />
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Bill To</p>
                            <h3
                                className="text-2xl font-black text-[var(--on-surface)] leading-tight cursor-pointer hover:text-[var(--primary)] transition-colors"
                                onClick={() => voucher.party_ledger_id && navigate(`/ledgers/${voucher.party_ledger_id}`)}
                            >
                                {voucher.party_name}
                            </h3>
                            {(voucher.party_gstin || voucher.party_gst_number) && (
                                <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1 uppercase tracking-wide">GSTIN: {voucher.party_gstin || voucher.party_gst_number}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Invoice No</p>
                                <p className="text-sm font-black text-[var(--on-surface)]">#{voucher.voucher_number}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Date</p>
                                <p className="text-sm font-black text-[var(--on-surface)]">{format(new Date(voucher.voucher_date), 'dd MMM, yyyy')}</p>
                            </div>
                        </div>

                        {/* Company Bank Details (If visible/available) */}
                        {selectedCompany.bank_details && (
                            <div className="pt-4 border-t border-[var(--border)]/50">
                                <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-1">Pay To</p>
                                <p className="text-xs font-bold text-[var(--on-surface)]">{selectedCompany.bank_name}</p>
                                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">A/C: {selectedCompany.account_number} â€¢ IFSC: {selectedCompany.ifsc_code}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Items List - Minimal Cards */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Items Included ({items.length})</h4>
                    </div>

                    <div className="space-y-3">
                        {items.length === 0 ? (
                            <div className="py-12 text-center border-2 border-dashed border-[var(--border)] rounded-[24px] px-5">
                                <Package size={32} className="mx-auto text-[var(--text-muted)] opacity-20 mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">No Items Found</p>
                                {accountingVoucherWithoutItems && (
                                    <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)] max-w-xs mx-auto">
                                        This voucher is currently synced as an accounting voucher. Item lines were not available in the saved source payload.
                                    </p>
                                )}
                            </div>
                        ) : (
                            items.map((item: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="bg-[var(--surface)] border border-[var(--border)] rounded-[24px] p-5 active:scale-[0.98] transition-transform flex justify-between items-start gap-4"
                                >
                                    <div className="space-y-1.5 flex-1">
                                        <p
                                            className="text-sm font-bold text-[var(--on-surface)] leading-snug cursor-pointer hover:text-[var(--primary)] transition-colors"
                                            onClick={() => item.stock_item_id && navigate(`/stock/${item.stock_item_id}`)}
                                        >
                                            {item.stock_item_name || item.name}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="bg-[var(--surface-variant)] px-2.5 py-1 rounded-lg text-[10px] font-bold text-[var(--on-surface)]">
                                                {item.quantity} {item.unit}
                                            </div>
                                            <span className="text-[10px] text-[var(--text-muted)] font-medium">@ {formatCurrency(item.rate)}</span>
                                            {item.gst_rate > 0 && <span className="text-[9px] font-black text-amber-500 uppercase">GST {item.gst_rate}%</span>}
                                            <span className="text-[9px] font-black text-[var(--text-muted)] uppercase">HSN {item.hsn_code || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-[var(--on-surface)]">
                                            {formatCurrency(item.amount || (item.quantity * item.rate))}
                                        </p>
                                        {item.discount > 0 && (
                                            <p className="text-[9px] font-bold text-emerald-500 mt-1">Disc -{item.discount}%</p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 4. Notes Section */}
                {voucher.narration && (
                    <div className="px-2">
                        <div className="bg-[var(--surface-variant)]/30 rounded-2xl p-5 border border-[var(--border)]">
                            <div className="flex items-center gap-2 mb-2 text-[var(--text-muted)]">
                                <Info size={12} />
                                <p className="text-[10px] font-black uppercase tracking-widest">Notes</p>
                            </div>
                            <p className="text-xs font-medium text-[var(--on-surface)] italic leading-relaxed opacity-80">"{voucher.narration}"</p>
                        </div>
                    </div>
                )}
            </main>


            {/* Sync Overlay Logic */}
            <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleSyncToTally}
                className="fixed bottom-24 right-6 w-12 h-12 bg-[var(--primary)] text-white rounded-full shadow-xl shadow-[var(--primary)]/30 flex items-center justify-center z-30"
            >
                <Send size={20} />
            </motion.button>
        </div>
    );
}







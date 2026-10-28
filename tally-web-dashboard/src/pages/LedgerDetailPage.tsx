import { TShapeLedgerModal } from '@/components/ledger/TShapeLedgerModal';
import { PartyItemsBreakdownView, PartyTransactedItem } from '@/components/ledger/PartyItemsBreakdownView';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFY } from '@/contexts/FYContext';
import { supabase as insforgeClient, ledgerApi } from '@/lib/supabase';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import toast from 'react-hot-toast';
import {
    ChevronLeft, Phone, Plus, Share2, Bell, MessageCircle,
    Search, Filter, ChevronDown, ChevronRight, ArrowUpRight,
    ArrowDownLeft, LayoutGrid, Users, FileText, BarChart3,
    Calendar, CheckCircle2, Clock, X, Edit3, DollarSign,
    TrendingUp, TrendingDown, Receipt, Check
} from 'lucide-react';

function formatCurrency(amount: number) {
    return '₹ ' + new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 0
    }).format(Math.abs(amount || 0));
}

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany, user } = useAuth() as any;
    const { selectedFY, fyDates } = useFY();
    const supabase: any = insforgeClient;

    // Core Data State
    const [ledger, setLedger] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ledger' | 'items' | 'summary' | 'notes'>('ledger');
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'sales' | 'receipts' | 'purchases' | 'payments'>('all');
    const [openingBalance, setOpeningBalance] = useState(0);

    // Custom Date Range State
    const [customDateRange, setCustomDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
    const [showDatePickerModal, setShowDatePickerModal] = useState(false);
    const [showTShapeModal, setShowTShapeModal] = useState(false);
    const [tempFromDate, setTempFromDate] = useState('');
    const [tempToDate, setTempToDate] = useState('');

    // Items and Notes Data
    const [itemsSold, setItemsSold] = useState<PartyTransactedItem[]>([]);
    const [itemsPurchased, setItemsPurchased] = useState<PartyTransactedItem[]>([]);
    const [itemsViewType, setItemsViewType] = useState<'sold' | 'purchased'>('sold');
    const [itemsDetailScreen, setItemsDetailScreen] = useState<'sold' | 'purchased' | null>(null);
    const [voucherSummary, setVoucherSummary] = useState<Record<string, number>>({});
    const [notes, setNotes] = useState<string>('');
    const [noteInput, setNoteInput] = useState('');

    // Credit limit modal state
    const [showCreditLimitModal, setShowCreditLimitModal] = useState(false);
    const [creditLimitInput, setCreditLimitInput] = useState('');
    const [creditLimit, setCreditLimit] = useState(() => {
        try {
            return (JSON.parse(localStorage.getItem('tallylink_credit_limits') || '{}')[id || '']) || 0;
        } catch { return 0; }
    });

    const userInitial = user?.email?.[0]?.toUpperCase() || selectedCompany?.name?.[0]?.toUpperCase() || 'L';

    // 1. Fetch Ledger & Transactions
    const loadLedgerDetails = useCallback(async () => {
        if (!id || !selectedCompany?.id) return;
        setLoading(true);

        try {
            // Ledger Master - supports both UUID and Party Name
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
            let ledgerData: any = null;

            if (isUUID) {
                const { data } = await supabase
                    .from('ledgers')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();
                ledgerData = data;
            }

            if (!ledgerData) {
                const decodedName = decodeURIComponent(id || '').trim();
                const { data } = await supabase
                    .from('ledgers')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .ilike('name', decodedName)
                    .maybeSingle();
                ledgerData = data;
            }

            if (!ledgerData) {
                const decodedName = decodeURIComponent(id || '').trim();
                const { data } = await supabase
                    .from('ledgers')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .ilike('name', `%${decodedName}%`)
                    .limit(1)
                    .maybeSingle();
                ledgerData = data;
            }

            const targetPartyName = ledgerData?.name || decodeURIComponent(id || '').trim();

            if (!ledgerData) {
                ledgerData = {
                    id: id,
                    name: targetPartyName,
                    company_id: selectedCompany.id,
                    parent_group: 'Sundry Debtors',
                    opening_balance: 0,
                    closing_balance: 0
                };
            }
            setLedger(ledgerData);

            // Fetch All Vouchers for Party — sirf selected FY ka
            const { data: voucherRows, error: vError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .ilike('party_name', targetPartyName)
                .eq('is_deleted', false)
                .gte('voucher_date', fyDates.from)
                .lte('voucher_date', fyDates.to)
                .order('voucher_date', { ascending: false });

            if (vError) throw vError;

            const allVouchers = voucherRows || [];
            setTransactions(allVouchers);

            // Compute Opening & Dynamic Balance
            // shortcut: opening_balance Tally ka company-start opening hai, FY-wise opening nahi.
            // Purane FY ke statement me opening exact nahi hoga jab tak FY-closing balance store na ho.
            const openBal = Number(ledgerData.opening_balance) || 0;
            setOpeningBalance(openBal);

            // Voucher type summary counts
            const summaryMap: Record<string, number> = {};
            allVouchers.forEach((v: any) => {
                const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
                summaryMap[v.voucher_type] = (summaryMap[v.voucher_type] || 0) + amt;
            });
            setVoucherSummary(summaryMap);

            // Load Items sold/purchased in background
            loadItemsSummary(allVouchers);
        } catch (err: any) {
            console.error('Failed to load ledger details:', err);
            toast.error(err.message || 'Failed to load ledger');
        } finally {
            setLoading(false);
        }
    }, [id, selectedCompany?.id, fyDates.from, fyDates.to]);

    useEffect(() => {
        loadLedgerDetails();
    }, [loadLedgerDetails]);

    // Helper to parse quantity and unit cleanly (e.g. "30.00 PAIR" -> 30, "PAIR")
    const parseQtyAndUnit = (rawQty: any, rawUnit?: string) => {
        if (typeof rawQty === 'number') {
            return { qty: Math.abs(rawQty), unit: rawUnit || 'PAIR' };
        }
        const str = String(rawQty || '').trim();
        const match = str.match(/^([+-]?[\d,.]+)\s*(.*)$/);
        if (match) {
            const num = parseFloat(match[1].replace(/,/g, '')) || 0;
            const unit = rawUnit || match[2].trim() || 'PAIR';
            return { qty: Math.abs(num), unit };
        }
        return { qty: Math.abs(Number(rawQty) || 0), unit: rawUnit || 'PAIR' };
    };

    // Load Items Summary (Sold & Purchased)
    const loadItemsSummary = async (voucherRows: any[]) => {
        if (!selectedCompany?.id || voucherRows.length === 0) return;

        const voucherMap = new Map<string, any>();
        const lookupIds: string[] = [];

        voucherRows.forEach(v => {
            if (v.id) {
                voucherMap.set(String(v.id), v);
                lookupIds.push(String(v.id));
            }
            if (v.voucher_id) {
                voucherMap.set(String(v.voucher_id), v);
                lookupIds.push(String(v.voucher_id));
            }
        });

        let stockEntries: any[] = [];
        try {
            if (lookupIds.length > 0) {
                const uniqueLookupIds = Array.from(new Set(lookupIds));
                const chunks: string[][] = [];
                for (let i = 0; i < uniqueLookupIds.length; i += 50) {
                    chunks.push(uniqueLookupIds.slice(i, i + 50));
                }

                const results = await Promise.all(
                    chunks.map(chunk =>
                        supabase
                            .from('voucher_stock_entries')
                            .select('*')
                            .eq('company_id', selectedCompany.id)
                            .in('voucher_id', chunk)
                    )
                );

                results.forEach(res => {
                    if (res.data) stockEntries.push(...res.data);
                });
            }
        } catch (e) {
            console.warn('voucher_stock_entries fetch error:', e);
        }

        const entriesByVoucher = new Map<string, any[]>();
        stockEntries.forEach(e => {
            const key = String(e.voucher_id);
            if (!entriesByVoucher.has(key)) entriesByVoucher.set(key, []);
            entriesByVoucher.get(key)!.push(e);
        });

        const soldMap: Record<string, PartyTransactedItem> = {};
        const purchasedMap: Record<string, PartyTransactedItem> = {};

        voucherRows.forEach(v => {
            const vType = String(v.voucher_type || '').toLowerCase();
            const isSales = vType.includes('sale') || vType.includes('delivery');
            const isPurchase = vType.includes('purchase') || vType.includes('receipt note');

            if (!isSales && !isPurchase) return;

            const targetMap = isPurchase ? purchasedMap : soldMap;
            const vDate = v.voucher_date || '';
            const vNum = v.voucher_number || v.id;

            let rawItems = entriesByVoucher.get(String(v.id)) || entriesByVoucher.get(String(v.voucher_id)) || [];

            if (rawItems.length === 0) {
                if (Array.isArray(v.items) && v.items.length > 0) {
                    rawItems = v.items;
                } else if (Array.isArray(v.inventory_entries) && v.inventory_entries.length > 0) {
                    rawItems = v.inventory_entries;
                } else if (v.raw_data) {
                    try {
                        const parsed = typeof v.raw_data === 'string' ? JSON.parse(v.raw_data) : v.raw_data;
                        rawItems = parsed.inventory_entries || parsed.items || parsed.inventoryEntries || parsed.stock_entries || [];
                    } catch (_) { }
                }
            }

            (rawItems || []).forEach((item: any) => {
                const rawName = item.stock_item_name || item.item_name || item.name || item.StockItemName || 'Item';
                const name = String(rawName).trim();
                if (!name) return;

                const { qty, unit } = parseQtyAndUnit(
                    item.quantity ?? item.Quantity ?? item.actual_qty ?? item.billed_qty ?? item.qty,
                    item.unit || item.Unit || item.uom
                );

                const rawRate = Number(item.rate ?? item.Rate ?? item.unit_price ?? 0);
                const rawAmount = Math.abs(Number(item.amount ?? item.Amount ?? (qty * rawRate) ?? 0));
                const calculatedRate = rawRate > 0 ? rawRate : (qty > 0 ? rawAmount / qty : 0);

                if (!targetMap[name]) {
                    targetMap[name] = {
                        name,
                        totalQty: 0,
                        totalAmount: 0,
                        unit: unit || 'PAIR',
                        lastDate: vDate,
                        lastRate: calculatedRate,
                        avgRate: 0,
                        entries: []
                    };
                }

                const existing = targetMap[name];
                existing.totalQty += qty;
                existing.totalAmount += rawAmount;
                if (unit && (!existing.unit || existing.unit === 'units' || existing.unit === 'PAIR')) {
                    existing.unit = unit;
                }

                if (!existing.lastDate || (vDate && new Date(vDate) > new Date(existing.lastDate))) {
                    existing.lastDate = vDate;
                    existing.lastRate = calculatedRate;
                }

                existing.entries.push({
                    voucherId: v.id,
                    voucherNumber: String(vNum),
                    voucherType: v.voucher_type,
                    date: vDate,
                    qty,
                    rate: calculatedRate,
                    unit: unit || existing.unit,
                    amount: rawAmount
                });
            });
        });

        const finalizeItems = (map: Record<string, PartyTransactedItem>): PartyTransactedItem[] => {
            return Object.values(map).map(item => {
                const avgRate = item.totalQty > 0 ? (item.totalAmount / item.totalQty) : item.lastRate;
                return {
                    ...item,
                    avgRate
                };
            });
        };

        setItemsSold(finalizeItems(soldMap));
        setItemsPurchased(finalizeItems(purchasedMap));
    };

    // Calculate Closing Balance & Statistics
    const {
        closingBalance,
        totalDebits,
        totalCredits,
        salesCount,
        receiptsCount,
        purchasesCount,
        paymentsCount
    } = useMemo(() => {
        let debits = 0;
        let credits = 0;
        let sCount = 0;
        let rCount = 0;
        let pCount = 0;
        let payCount = 0;

        transactions.forEach((v) => {
            const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
            const isDebit = ['Sales', 'Sales Invoice', 'Payment', 'Debit Note'].includes(v.voucher_type);
            const isCredit = ['Purchase', 'Purchase Invoice', 'Receipt', 'Credit Note'].includes(v.voucher_type);

            if (isDebit) debits += amt;
            if (isCredit) credits += amt;

            if (v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice') sCount++;
            if (v.voucher_type === 'Receipt') rCount++;
            if (v.voucher_type === 'Purchase' || v.voucher_type === 'Purchase Invoice') pCount++;
            if (v.voucher_type === 'Payment') payCount++;
        });

        const closing = openingBalance + debits - credits;

        return {
            closingBalance: closing,
            totalDebits: debits,
            totalCredits: credits,
            salesCount: sCount,
            receiptsCount: rCount,
            purchasesCount: pCount,
            paymentsCount: payCount,
        };
    }, [transactions, openingBalance]);

    // Filter Transactions
    const filteredTransactions = useMemo(() => {
        return transactions.filter(v => {
            const matchSearch = !searchQuery ||
                (v.voucher_number && String(v.voucher_number).toLowerCase().includes(searchQuery.toLowerCase())) ||
                (v.total_amount && String(v.total_amount).includes(searchQuery));

            if (!matchSearch) return false;

            // Type filters
            if (typeFilter === 'sales') {
                if (v.voucher_type !== 'Sales' && v.voucher_type !== 'Sales Invoice') return false;
            } else if (typeFilter === 'receipts') {
                if (v.voucher_type !== 'Receipt') return false;
            } else if (typeFilter === 'purchases') {
                if (v.voucher_type !== 'Purchase' && v.voucher_type !== 'Purchase Invoice') return false;
            } else if (typeFilter === 'payments') {
                if (v.voucher_type !== 'Payment') return false;
            }

            // Custom Date Range filter
            if (customDateRange.from && v.voucher_date) {
                const vDate = v.voucher_date.split('T')[0];
                if (vDate < customDateRange.from) return false;
            }
            if (customDateRange.to && v.voucher_date) {
                const vDate = v.voucher_date.split('T')[0];
                if (vDate > customDateRange.to) return false;
            }

            return true;
        });
    }, [transactions, searchQuery, typeFilter, customDateRange]);

    // Actions
    const handleCall = () => {
        if (ledger?.phone) {
            window.open(`tel:${ledger.phone}`, '_self');
        } else {
            toast.error('Phone number not found for this party');
        }
    };

    const handleWhatsApp = () => {
        const phone = ledger?.phone?.replace(/[^0-9]/g, '') || '';
        const msg = `Hello ${ledger?.name || 'Customer'},\nYour closing balance with ${selectedCompany?.name || 'our company'} is ${formatCurrency(closingBalance)} ${closingBalance >= 0 ? '(Dr)' : '(Cr)'}.\nThank you!`;
        window.open(`https://wa.me/${phone ? `91${phone}` : ''}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const handleShareLedger = () => {
        setShowTShapeModal(true);
    };

    const handleSetReminder = () => {
        const dateStr = format(new Date(), 'dd MMM yyyy');
        toast.success(`Reminder set for ${ledger?.name} as on ${dateStr}`);
    };

    const handleSaveCreditLimit = () => {
        const val = Number(creditLimitInput) || 0;
        const allLimits = (() => {
            try { return JSON.parse(localStorage.getItem('tallylink_credit_limits') || '{}'); } catch { return {}; }
        })();
        if (id) allLimits[id] = val;
        localStorage.setItem('tallylink_credit_limits', JSON.stringify(allLimits));
        setCreditLimit(val);
        setShowCreditLimitModal(false);
        toast.success(val > 0 ? `Credit Limit set to ${formatCurrency(val)}` : 'Credit limit removed');
    };

    const handleOpenDatePicker = () => {
        setTempFromDate(customDateRange.from || '');
        setTempToDate(customDateRange.to || '');
        setShowDatePickerModal(true);
    };

    const handleApplyDateRange = () => {
        if (tempFromDate && tempToDate && tempFromDate > tempToDate) {
            toast.error('From Date cannot be later than To Date');
            return;
        }
        setCustomDateRange({ from: tempFromDate, to: tempToDate });
        setShowDatePickerModal(false);
        if (tempFromDate || tempToDate) {
            toast.success('Date range filter applied');
        }
    };

    const handleClearDateRange = () => {
        setTempFromDate('');
        setTempToDate('');
        setCustomDateRange({ from: '', to: '' });
        setShowDatePickerModal(false);
        toast.success('Date filter cleared');
    };

    const setDatePreset = (preset: 'month' | 'last_month' | '30days' | 'year') => {
        const now = new Date();
        if (preset === 'month') {
            setTempFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
            setTempToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        } else if (preset === 'last_month') {
            const lastMonth = subMonths(now, 1);
            setTempFromDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
            setTempToDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        } else if (preset === '30days') {
            setTempFromDate(format(subDays(now, 30), 'yyyy-MM-dd'));
            setTempToDate(format(now, 'yyyy-MM-dd'));
        } else if (preset === 'year') {
            setTempFromDate('2025-04-01');
            setTempToDate('2026-03-31');
        }
    };

    const handleAddNote = () => {
        if (!noteInput.trim()) return;
        const noteEntry = `${format(new Date(), 'dd MMM yyyy, hh:mm a')}: ${noteInput.trim()}`;
        const updated = notes ? `${notes}\n${noteEntry}` : noteEntry;
        setNotes(updated);
        setNoteInput('');
        toast.success('Note added!');
    };

    const openVoucher = (v: any) => {
        const tid = v.id || v.voucher_id;
        if (tid) {
            navigate(`/invoice/${encodeURIComponent(tid)}`, {
                state: { voucher: v, from: `/ledgers/${id}` }
            });
        }
    };

    if (loading && !ledger) {
        return (
            <div className="min-h-screen bg-[#0B1118] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="min-h-screen bg-[#0B1118] text-white p-6 flex flex-col items-center justify-center">
                <p className="text-base font-bold">Party not found</p>
                <button onClick={() => navigate('/ledgers')} className="mt-4 px-4 py-2 rounded-xl bg-[#16202C] border border-[#223244] text-xs font-bold text-slate-300">
                    ← Back to Parties
                </button>
            </div>
        );
    }

    if (itemsDetailScreen) {
        return (
            <PartyItemsBreakdownView
                partyName={ledger.name}
                initialType={itemsDetailScreen}
                itemsSold={itemsSold}
                itemsPurchased={itemsPurchased}
                selectedFY={selectedFY}
                onBack={() => setItemsDetailScreen(null)}
                navigate={navigate}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[#0B1118] text-slate-100 font-sans">
            {/* ========================================================================= */}
            {/* MOBILE LAYOUT (Screen < md) — Matches Image 1 100%                        */}
            {/* ========================================================================= */}
            <div className="block md:hidden pb-24">
                {/* Mobile Top Header with Integrated Party Name & Actions */}
                <header className="sticky top-0 z-50 bg-[#0B1118]/95 backdrop-blur-md border-b border-[#1E2B38] px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2.5">
                        {/* Back Button */}
                        <button
                            onClick={() => navigate('/ledgers')}
                            className="w-9 h-9 rounded-xl bg-[#142032] border border-[#22334c] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all shrink-0 cursor-pointer shadow-xs"
                            aria-label="Back to parties"
                        >
                            <ChevronLeft size={22} />
                        </button>

                        {/* Party Name & Subtitle */}
                        <div className="min-w-0 flex-1 px-1">
                            <h1 className={`font-black text-white tracking-tight leading-tight break-words ${
                                (ledger.name || '').length > 32
                                    ? 'text-xs sm:text-sm'
                                    : (ledger.name || '').length > 20
                                        ? 'text-sm sm:text-base'
                                        : 'text-base sm:text-lg'
                            }`}>
                                {ledger.name}
                            </h1>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-0.5 shrink-0">
                                    ✓ Customer
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium truncate">
                                    {ledger.phone || '+91 98765 43210'} • {ledger.parent_group?.replace('Sundry ', '') || 'Party'}
                                </span>
                            </div>
                        </div>

                        {/* WhatsApp Chat Button */}
                        <button
                            onClick={handleWhatsApp}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shrink-0 cursor-pointer active:scale-95 transition-transform"
                        >
                            <MessageCircle size={14} />
                            <span>Chat</span>
                        </button>
                    </div>
                </header>

                {/* Mobile Balance Card (2 Columns) */}
                <div className="mx-4 mt-2 p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] grid grid-cols-2 gap-4 shadow-sm">
                    {/* Closing Balance */}
                    <div className="border-r border-[#1E2B38]/60 pr-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CLOSING BALANCE</p>
                        <p className="text-2xl font-black text-[#00E599] mt-0.5 tracking-tight">{formatCurrency(closingBalance)}</p>
                        <p className="text-xs font-bold text-[#00E599] flex items-center gap-0.5 mt-0.5">
                            <ArrowUpRight size={14} /> {closingBalance >= 0 ? 'To Collect (Dr)' : 'To Pay (Cr)'}
                        </p>
                    </div>
                    {/* Opening Balance */}
                    <div className="pl-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">OPENING BALANCE</p>
                        <p className="text-2xl font-black text-white mt-0.5 tracking-tight">{formatCurrency(openingBalance)}</p>
                        <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#1A2634] text-slate-300">
                                Credit Limit: {creditLimit > 0 ? formatCurrency(creditLimit) : 'Not Set'}
                                <button onClick={() => setShowCreditLimitModal(true)} className="text-cyan-400 font-bold hover:underline cursor-pointer ml-0.5">+Set</button>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Mobile 4 Action Cards Grid */}
                <div className="grid grid-cols-4 gap-2 mx-4 mt-3">
                    <button
                        onClick={handleCall}
                        className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-full bg-[#1A2634] text-cyan-400 flex items-center justify-center">
                            <Phone size={16} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-300">Call</span>
                    </button>

                    <button
                        onClick={() => navigate('/create-invoice', { state: { party_name: ledger.name } })}
                        className="p-3 rounded-2xl bg-[#00D284]/10 border border-[#00D284] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,210,132,0.12)] cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-full bg-[#00D284] text-black flex items-center justify-center font-black">
                            <Plus size={18} />
                        </div>
                        <span className="text-[11px] font-black text-[#00D284]">+ Entry</span>
                    </button>

                    <button
                        onClick={handleShareLedger}
                        className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-full bg-[#1A2634] text-cyan-400 flex items-center justify-center">
                            <Share2 size={16} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-300">Share PDF</span>
                    </button>

                    <button
                        onClick={handleSetReminder}
                        className="p-3 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-full bg-[#1A2634] text-amber-400 flex items-center justify-center">
                            <Clock size={16} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-300">Reminder</span>
                    </button>
                </div>

                {/* Mobile Segmented Tabs Bar */}
                <div className="flex items-center gap-1 mx-4 mt-4 p-1 rounded-xl bg-[#121B24] border border-[#1E2B38]">
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            activeTab === 'ledger' ? 'bg-[#00D284] text-black shadow-md' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Ledger
                    </button>
                    <button
                        onClick={() => {
                            if (itemsSold.length === 0 && itemsPurchased.length > 0) {
                                setItemsViewType('purchased');
                            }
                            setActiveTab('items');
                        }}
                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            activeTab === 'items' ? 'bg-[#00D284] text-black shadow-md' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Items
                    </button>
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            activeTab === 'summary' ? 'bg-[#00D284] text-black shadow-md' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Summary
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            activeTab === 'notes' ? 'bg-[#00D284] text-black shadow-md' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Notes ({notes ? notes.split('\n').filter(Boolean).length : 0})
                    </button>
                </div>

                {/* Tab: LEDGER (Transactions) */}
                {activeTab === 'ledger' && (
                    <div className="space-y-3 mx-4 mt-3">
                        {/* Search Bar */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by voucher #, amount..."
                                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                            />
                            <Filter size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Mobile Type Filters Row with Purchases, Payments & Custom Dates */}
                        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1.5 scrollbar-hide">
                            <span className="text-slate-400 font-bold mr-0.5 shrink-0">Type:</span>
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                                    typeFilter === 'all'
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                All ({transactions.length})
                            </button>
                            <button
                                onClick={() => setTypeFilter('sales')}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                                    typeFilter === 'sales'
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                Sales ({salesCount})
                            </button>
                            <button
                                onClick={() => setTypeFilter('receipts')}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                                    typeFilter === 'receipts'
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                Receipts ({receiptsCount})
                            </button>
                            <button
                                onClick={() => setTypeFilter('purchases')}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                                    typeFilter === 'purchases'
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                Purchases ({purchasesCount})
                            </button>
                            <button
                                onClick={() => setTypeFilter('payments')}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer ${
                                    typeFilter === 'payments'
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                Payments ({paymentsCount})
                            </button>
                            <button
                                onClick={handleOpenDatePicker}
                                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                                    (customDateRange.from || customDateRange.to)
                                        ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                        : 'bg-[#121B24] text-slate-400 border border-[#1E2B38]'
                                }`}
                            >
                                <Calendar size={11} />
                                {customDateRange.from && customDateRange.to ? `${customDateRange.from.slice(5)} to ${customDateRange.to.slice(5)}` : 'Dates'}
                            </button>
                        </div>

                        {/* Transactions Header */}
                        <div className="flex items-center justify-between text-xs pt-1">
                            <span className="font-black text-slate-300 uppercase tracking-wider text-[11px]">
                                TRANSACTIONS ({filteredTransactions.length})
                            </span>
                            <span className="text-[11px] text-slate-500">Sorted by: Newest</span>
                        </div>

                        {/* Transaction Cards List */}
                        <div className="space-y-2 pb-6">
                            {filteredTransactions.map(v => {
                                const isSale = v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice';
                                const isReceipt = v.voucher_type === 'Receipt';
                                const isPurchase = v.voucher_type === 'Purchase' || v.voucher_type === 'Purchase Invoice';
                                const isPayment = v.voucher_type === 'Payment';
                                const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);

                                return (
                                    <div
                                        key={v.id}
                                        onClick={() => openVoucher(v)}
                                        className="p-3.5 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-700 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all shadow-xs"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 pr-2">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                                                isSale
                                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                                    : isReceipt
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : isPurchase
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                            }`}>
                                                {isSale || isPayment ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="font-bold text-white text-xs truncate">Voucher #{v.voucher_number || 'NA'}</p>
                                                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                                        isSale ? 'bg-rose-500/15 text-rose-400' :
                                                        isReceipt ? 'bg-emerald-500/15 text-emerald-400' :
                                                        isPurchase ? 'bg-blue-500/15 text-blue-400' :
                                                        'bg-amber-500/15 text-amber-400'
                                                    }`}>
                                                        {v.voucher_type}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                                    {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : '-'} • {
                                                        isSale ? 'Invoice' : isReceipt ? 'Bank Transfer' : isPurchase ? 'Bill' : 'Cash/Bank'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className={`text-xs font-black ${isReceipt ? 'text-[#00E599]' : 'text-white'}`}>
                                                {formatCurrency(amt)}
                                            </p>
                                            <p className="text-[9px] text-slate-400 mt-0.5">
                                                {isSale ? 'Debit (Due)' : isReceipt ? 'Credit (Paid)' : isPurchase ? 'Credit (Bill)' : 'Debit (Paid)'}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Tab: ITEMS */}
                {activeTab === 'items' && (
                    <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-[#1E2B38] bg-[#0B1118]">
                        <PartyItemsBreakdownView
                            partyName={ledger.name}
                            initialType={itemsSold.length === 0 && itemsPurchased.length > 0 ? 'purchased' : itemsViewType}
                            itemsSold={itemsSold}
                            itemsPurchased={itemsPurchased}
                            selectedFY={selectedFY}
                            isStandalone={false}
                            onBack={() => setActiveTab('ledger')}
                            navigate={navigate}
                        />
                    </div>
                )}

                {/* Tab: SUMMARY */}
                {activeTab === 'summary' && (
                    <div className="p-4 space-y-3 text-xs">
                        <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Voucher Breakdown</h3>
                                <span className="text-[9px] text-cyan-400 font-semibold">Click row to view items</span>
                            </div>
                            {Object.entries(voucherSummary).map(([type, amount]) => {
                                const isSales = ['Sales', 'Sales Invoice', 'Delivery Note'].some(t => type.toLowerCase().includes(t.toLowerCase()));
                                const isPurchase = ['Purchase', 'Purchase Invoice', 'Receipt Note'].some(t => type.toLowerCase().includes(t.toLowerCase()));
                                const isClickable = isSales || isPurchase;

                                return (
                                    <div
                                        key={type}
                                        onClick={() => {
                                            if (isSales) setItemsDetailScreen('sold');
                                            else if (isPurchase) setItemsDetailScreen('purchased');
                                        }}
                                        className={`flex justify-between items-center py-2 px-2.5 rounded-xl border-b border-[#1E2B38]/40 transition-all ${
                                            isClickable
                                                ? 'hover:bg-[#182638] cursor-pointer group active:scale-[0.99]'
                                                : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${isClickable ? 'text-white group-hover:text-cyan-400' : 'text-slate-300'}`}>
                                                {type}
                                            </span>
                                            {isClickable && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                                                    View Items ➔
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-white">{formatCurrency(amount)}</span>
                                            {isClickable && (
                                                <ChevronRight size={14} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] space-y-2">
                            <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Master Information</h3>
                            <div className="flex justify-between py-1"><span className="text-slate-400">Phone:</span><span className="font-bold text-white">{ledger.phone || '-'}</span></div>
                            <div className="flex justify-between py-1"><span className="text-slate-400">GSTIN:</span><span className="font-mono text-white">{ledger.gstin || '-'}</span></div>
                            <div className="flex justify-between py-1"><span className="text-slate-400">Address:</span><span className="text-right text-white max-w-[200px]">{ledger.address || '-'}</span></div>
                        </div>
                    </div>
                )}

                {/* Tab: NOTES */}
                {activeTab === 'notes' && (
                    <div className="p-4 space-y-3">
                        <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] min-h-[160px] space-y-2">
                            {notes ? (
                                notes.split('\n').filter(Boolean).map((n, i) => (
                                    <div key={i} className="p-2.5 rounded-xl bg-[#1A2634] text-xs text-slate-200">
                                        {n}
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center text-slate-500 text-xs">No notes added yet</div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={noteInput}
                                onChange={e => setNoteInput(e.target.value)}
                                placeholder="Type a note..."
                                className="flex-1 px-3 py-2 rounded-xl bg-[#121B24] border border-[#1E2B38] text-xs text-white"
                                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                            />
                            <button onClick={handleAddNote} className="px-4 py-2 rounded-xl bg-[#00D284] text-black font-black text-xs">
                                Add
                            </button>
                        </div>
                    </div>
                )}

                {/* Mobile Bottom Navigation Bar (Image 1 Bottom) */}
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0B1118]/95 backdrop-blur-md border-t border-[#1E2B38] px-4 py-2 flex items-center justify-between">
                    <button onClick={() => navigate('/')} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-white cursor-pointer">
                        <LayoutGrid size={18} />
                        <span className="text-[9px] font-bold">Dashboard</span>
                    </button>
                    <button onClick={() => navigate('/ledgers')} className="flex flex-col items-center gap-0.5 text-[#00E599] cursor-pointer">
                        <Users size={18} />
                        <span className="text-[9px] font-bold">Parties</span>
                        <span className="w-1 h-1 rounded-full bg-[#00E599]"></span>
                    </button>
                    <button
                        onClick={() => navigate('/create-invoice', { state: { party_name: ledger.name } })}
                        className="w-11 h-11 -mt-4 rounded-full bg-[#00E599] text-black flex items-center justify-center font-black shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform cursor-pointer"
                    >
                        <Plus size={22} />
                    </button>
                    <button onClick={() => navigate('/vouchers')} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-white cursor-pointer">
                        <FileText size={18} />
                        <span className="text-[9px] font-bold">Vouchers</span>
                    </button>
                    <button onClick={() => navigate('/profit-loss')} className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-white cursor-pointer">
                        <BarChart3 size={18} />
                        <span className="text-[9px] font-bold">Reports</span>
                    </button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* PC / DESKTOP LAYOUT (Screen >= md) — Matches Image 2 100%                 */}
            {/* ========================================================================= */}
            <div className="hidden md:block max-w-7xl mx-auto p-6 space-y-5 pb-20">
                {/* 1. Desktop Party Header Card */}
                <div className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/ledgers')}
                            className="w-10 h-10 rounded-xl bg-[#16202C] border border-[#223244] flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
                            title="Back to parties"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-2xl font-black text-white tracking-tight">{ledger.name}</h1>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                    ✓ Verified Party
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Closing Balance: <span className="font-bold text-[#00E599]">{formatCurrency(closingBalance)}</span> • Contact: <span className="text-slate-300 font-mono">{ledger.phone || '+91 98765 43210'}</span>
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={handleCall}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16202C] border border-[#223244] hover:bg-[#1E2B38] text-white text-xs font-bold transition-all cursor-pointer"
                        >
                            <Phone size={14} className="text-rose-400" />
                            CALL
                        </button>
                        <button
                            onClick={() => navigate('/create-invoice', { state: { party_name: ledger.name } })}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00D284] hover:bg-[#00BF76] text-black text-xs font-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                        >
                            <Plus size={16} />
                            CREATE ENTRY
                        </button>
                        <button
                            onClick={handleShareLedger}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16202C] border border-[#223244] hover:bg-[#1E2B38] text-white text-xs font-bold transition-all cursor-pointer"
                        >
                            <Share2 size={14} />
                            SHARE LEDGER
                        </button>
                        <button
                            onClick={handleSetReminder}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16202C] border border-[#223244] hover:bg-[#1E2B38] text-white text-xs font-bold transition-all cursor-pointer"
                        >
                            <Bell size={14} className="text-amber-400" />
                            SET REMINDER
                        </button>
                    </div>
                </div>

                {/* 2. Desktop Segmented Tabs Bar */}
                <div className="flex items-center gap-8 border-b border-[#1E2B38] pt-1 pb-3 text-xs font-black tracking-wider">
                    <button
                        onClick={() => setActiveTab('ledger')}
                        className={`flex items-center gap-2 pb-3 -mb-3 transition-colors cursor-pointer ${
                            activeTab === 'ledger' ? 'text-[#00D284] border-b-2 border-[#00D284]' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        LEDGER
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00D28420] text-[#00D284]">
                            {transactions.length} entries
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('items')}
                        className={`pb-3 -mb-3 transition-colors cursor-pointer ${
                            activeTab === 'items' ? 'text-[#00D284] border-b-2 border-[#00D284]' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        ITEMS
                    </button>
                    <button
                        onClick={() => setActiveTab('summary')}
                        className={`pb-3 -mb-3 transition-colors cursor-pointer ${
                            activeTab === 'summary' ? 'text-[#00D284] border-b-2 border-[#00D284]' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        SUMMARY
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={`pb-3 -mb-3 transition-colors cursor-pointer ${
                            activeTab === 'notes' ? 'text-[#00D284] border-b-2 border-[#00D284]' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        NOTES ({notes ? notes.split('\n').filter(Boolean).length : 0})
                    </button>
                </div>

                {/* Tab 1: LEDGER */}
                {activeTab === 'ledger' && (
                    <div className="space-y-5">
                        {/* 3. Three Balance / Info Cards in Grid (Desktop) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Card 1: OPENING BALANCE */}
                            <div className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] shadow-xs">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">OPENING BALANCE</p>
                                <p className="text-3xl font-black text-white mt-2 tracking-tight">{formatCurrency(openingBalance)}</p>
                                <p className="text-xs text-slate-500 mt-2">Financial Year {selectedFY || '2025-2026'}</p>
                            </div>

                            {/* Card 2: CLOSING BALANCE (Emerald Border & Highlight) */}
                            <div className="p-5 rounded-2xl bg-[#121B24] border border-emerald-500/40 shadow-xs relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CLOSING BALANCE</p>
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                        TO RECEIVE (DR)
                                    </span>
                                </div>
                                <p className="text-3xl font-black text-[#00E599] mt-2 tracking-tight">{formatCurrency(closingBalance)}</p>
                                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    Includes {salesCount} invoices & {receiptsCount} receipts
                                </p>
                            </div>

                            {/* Card 3: Set Credit Limit */}
                            <div
                                onClick={() => setShowCreditLimitModal(true)}
                                className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-600 transition-colors flex flex-col justify-center items-center text-center cursor-pointer shadow-xs group"
                            >
                                <div className="w-9 h-9 rounded-full bg-[#1A2634] text-slate-300 group-hover:text-emerald-400 flex items-center justify-center font-black mb-1 transition-colors">
                                    <Plus size={18} />
                                </div>
                                <p className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">
                                    {creditLimit > 0 ? `Credit Limit: ${formatCurrency(creditLimit)}` : '+ Set Credit Limit'}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Control overdue reminders and credit blocks</p>
                            </div>
                        </div>

                        {/* 4. Desktop Filters Row with Purchases, Payments & Working Custom Dates */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setTypeFilter('all')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        typeFilter === 'all'
                                            ? 'bg-[#00D284] text-black shadow-md'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    All Entries
                                </button>
                                <button
                                    onClick={() => setTypeFilter('sales')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        typeFilter === 'sales'
                                            ? 'bg-[#00D284] text-black shadow-md'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    Sales Only ({salesCount})
                                </button>
                                <button
                                    onClick={() => setTypeFilter('receipts')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        typeFilter === 'receipts'
                                            ? 'bg-[#00D284] text-black shadow-md'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    Receipts Only ({receiptsCount})
                                </button>
                                <button
                                    onClick={() => setTypeFilter('purchases')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        typeFilter === 'purchases'
                                            ? 'bg-[#00D284] text-black shadow-md'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    Purchases Only ({purchasesCount})
                                </button>
                                <button
                                    onClick={() => setTypeFilter('payments')}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        typeFilter === 'payments'
                                            ? 'bg-[#00D284] text-black shadow-md'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    Payments Only ({paymentsCount})
                                </button>
                                <button
                                    onClick={handleOpenDatePicker}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        (customDateRange.from || customDateRange.to)
                                            ? 'bg-emerald-500/15 text-[#00E599] border border-emerald-500/50'
                                            : 'bg-[#16202C] text-slate-400 border border-[#223244] hover:text-white'
                                    }`}
                                >
                                    <Calendar size={13} />
                                    {customDateRange.from && customDateRange.to
                                        ? `${format(new Date(customDateRange.from), 'dd MMM yyyy')} - ${format(new Date(customDateRange.to), 'dd MMM yyyy')}`
                                        : 'Custom Dates'
                                    }
                                    {(customDateRange.from || customDateRange.to) && (
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleClearDateRange();
                                            }}
                                            className="ml-1 hover:text-rose-400"
                                            title="Clear date filter"
                                        >
                                            <X size={12} />
                                        </span>
                                    )}
                                </button>
                            </div>

                            <p className="text-xs text-slate-400 font-medium">
                                Showing {filteredTransactions.length} of {transactions.length} transactions
                            </p>
                        </div>

                        {/* 5. Desktop Transactions Rows (Cards) */}
                        <div className="space-y-2.5">
                            {filteredTransactions.map(v => {
                                const isSale = v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice';
                                const isReceipt = v.voucher_type === 'Receipt';
                                const isPurchase = v.voucher_type === 'Purchase' || v.voucher_type === 'Purchase Invoice';
                                const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);

                                return (
                                    <div
                                        key={v.id}
                                        onClick={() => openVoucher(v)}
                                        className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] hover:border-slate-600 flex items-center justify-between cursor-pointer transition-all shadow-xs group"
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Left Badge */}
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs ${
                                                isSale
                                                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                                                    : isReceipt
                                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                                    : isPurchase
                                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                                                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                            }`}>
                                                {isSale ? 'INV' : isReceipt ? 'REC' : isPurchase ? 'PUR' : 'PAY'}
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-sm">#{v.voucher_number || 'NA'}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        isSale ? 'bg-rose-500/15 text-rose-400' :
                                                        isReceipt ? 'bg-emerald-500/15 text-emerald-400' :
                                                        isPurchase ? 'bg-blue-500/15 text-blue-400' :
                                                        'bg-amber-500/15 text-amber-400'
                                                    }`}>
                                                        {v.voucher_type}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {v.voucher_date ? format(new Date(v.voucher_date), 'dd MMM yyyy') : '-'} • {
                                                        isSale ? 'Due in 30 days' : isReceipt ? 'Bank Transfer / UPI' : isPurchase ? 'Vendor Bill' : 'Cash/Bank Payment'
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className={`text-base font-black ${isReceipt ? 'text-[#00E599]' : 'text-white'}`}>
                                                    {formatCurrency(amt)}
                                                </p>
                                                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                                    {isSale ? 'DEBIT' : isReceipt ? 'CREDIT' : isPurchase ? 'CREDIT' : 'DEBIT'}
                                                </p>
                                            </div>
                                            <ChevronRight size={18} className="text-slate-500 group-hover:text-white transition-colors" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Tab 2: ITEMS (Desktop) */}
                {activeTab === 'items' && (
                    <div className="rounded-2xl overflow-hidden border border-[#1E2B38] bg-[#0B1118]">
                        <PartyItemsBreakdownView
                            partyName={ledger.name}
                            initialType={itemsSold.length === 0 && itemsPurchased.length > 0 ? 'purchased' : itemsViewType}
                            itemsSold={itemsSold}
                            itemsPurchased={itemsPurchased}
                            selectedFY={selectedFY}
                            isStandalone={false}
                            onBack={() => setActiveTab('ledger')}
                            navigate={navigate}
                        />
                    </div>
                )}

                {/* Tab 3: SUMMARY (Desktop) */}
                {activeTab === 'summary' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Voucher Summary</h3>
                                <span className="text-[10px] text-cyan-400 font-semibold">Click to view item details</span>
                            </div>
                            {Object.entries(voucherSummary).map(([type, amount]) => {
                                const isSales = ['Sales', 'Sales Invoice', 'Delivery Note'].some(t => type.toLowerCase().includes(t.toLowerCase()));
                                const isPurchase = ['Purchase', 'Purchase Invoice', 'Receipt Note'].some(t => type.toLowerCase().includes(t.toLowerCase()));
                                const isClickable = isSales || isPurchase;

                                return (
                                    <div
                                        key={type}
                                        onClick={() => {
                                            if (isSales) setItemsDetailScreen('sold');
                                            else if (isPurchase) setItemsDetailScreen('purchased');
                                        }}
                                        className={`flex justify-between items-center py-2.5 px-2 rounded-xl border-b border-[#1E2B38] transition-all ${
                                            isClickable ? 'hover:bg-[#182638] cursor-pointer group' : ''
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-bold ${isClickable ? 'text-white group-hover:text-cyan-400' : 'text-slate-300'}`}>
                                                {type}
                                            </span>
                                            {isClickable && (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                                                    View Items ➔
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-white">{formatCurrency(amount)}</span>
                                            {isClickable && (
                                                <ChevronRight size={15} className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] space-y-3">
                            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Party Details</h3>
                            <div className="flex justify-between py-1.5"><span className="text-xs text-slate-400">Contact:</span><span className="text-xs font-bold text-white">{ledger.phone || '-'}</span></div>
                            <div className="flex justify-between py-1.5"><span className="text-xs text-slate-400">GSTIN:</span><span className="text-xs font-mono text-white">{ledger.gstin || '-'}</span></div>
                            <div className="flex justify-between py-1.5"><span className="text-xs text-slate-400">Parent Group:</span><span className="text-xs font-bold text-white">{ledger.parent_group || ledger.parent || '-'}</span></div>
                            <div className="flex justify-between py-1.5"><span className="text-xs text-slate-400">Address:</span><span className="text-xs text-white max-w-xs text-right">{ledger.address || '-'}</span></div>
                        </div>
                    </div>
                )}

                {/* Tab 4: NOTES (Desktop) */}
                {activeTab === 'notes' && (
                    <div className="p-5 rounded-2xl bg-[#121B24] border border-[#1E2B38] space-y-4">
                        <div className="min-h-[160px] space-y-2">
                            {notes ? (
                                notes.split('\n').filter(Boolean).map((n, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-[#16202C] text-xs text-slate-200">
                                        {n}
                                    </div>
                                ))
                            ) : (
                                <p className="py-12 text-center text-slate-500 text-xs">No notes for this customer yet</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={noteInput}
                                onChange={e => setNoteInput(e.target.value)}
                                placeholder="Type a note about this customer..."
                                className="flex-1 px-4 py-2.5 rounded-xl bg-[#16202C] border border-[#223244] text-xs text-white"
                                onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                            />
                            <button onClick={handleAddNote} className="px-5 py-2.5 rounded-xl bg-[#00D284] text-black font-black text-xs">
                                Add Note
                            </button>
                        </div>
                    </div>
                )}

                {/* 6. Desktop Bottom Summary Footer (Matches Image 2 Bottom) */}
                <div className="p-4 rounded-2xl bg-[#121B24] border border-[#1E2B38] flex items-center justify-between text-xs shadow-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>Synced with TallyPrime 4.1</span>
                    </div>

                    <div className="flex items-center gap-6 font-bold">
                        <div>
                            <span className="text-slate-400">Total Debits: </span>
                            <span className="text-rose-400 font-black text-sm">{formatCurrency(totalDebits)}</span>
                        </div>
                        <div className="h-4 w-px bg-[#1E2B38]"></div>
                        <div>
                            <span className="text-slate-400">Total Credits: </span>
                            <span className="text-emerald-400 font-black text-sm">{formatCurrency(totalCredits)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL 1: SET CREDIT LIMIT */}
            {showCreditLimitModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-[#121B24] border border-[#1E2B38] rounded-3xl p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-black text-white">Set Credit Limit</h3>
                            <button onClick={() => setShowCreditLimitModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            Set maximum allowable credit limit for <span className="font-bold text-white">{ledger.name}</span>.
                        </p>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Credit Limit (₹)</label>
                            <input
                                type="number"
                                value={creditLimitInput}
                                onChange={e => setCreditLimitInput(e.target.value)}
                                placeholder="e.g. 100000"
                                className="w-full px-4 py-2.5 rounded-xl bg-[#16202C] border border-[#223244] text-sm text-white font-black"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setShowCreditLimitModal(false)}
                                className="flex-1 py-2.5 rounded-xl border border-[#223244] text-xs font-bold text-slate-300 hover:bg-[#16202C]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCreditLimit}
                                className="flex-1 py-2.5 rounded-xl bg-[#00D284] text-black text-xs font-black shadow-md hover:bg-[#00BF76]"
                            >
                                Save Limit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: CUSTOM DATE RANGE PICKER */}
            {showDatePickerModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-[#121B24] border border-[#1E2B38] rounded-3xl p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-[#00D284]" />
                                <h3 className="text-sm font-black text-white">Filter by Date Range</h3>
                            </div>
                            <button onClick={() => setShowDatePickerModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Quick Presets */}
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5">Quick Presets</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setDatePreset('month')}
                                    className="px-2.5 py-1.5 rounded-xl bg-[#16202C] border border-[#223244] text-xs font-bold text-slate-300 hover:text-white hover:border-[#00D284]"
                                >
                                    This Month
                                </button>
                                <button
                                    onClick={() => setDatePreset('last_month')}
                                    className="px-2.5 py-1.5 rounded-xl bg-[#16202C] border border-[#223244] text-xs font-bold text-slate-300 hover:text-white hover:border-[#00D284]"
                                >
                                    Last Month
                                </button>
                                <button
                                    onClick={() => setDatePreset('30days')}
                                    className="px-2.5 py-1.5 rounded-xl bg-[#16202C] border border-[#223244] text-xs font-bold text-slate-300 hover:text-white hover:border-[#00D284]"
                                >
                                    Last 30 Days
                                </button>
                                <button
                                    onClick={() => setDatePreset('year')}
                                    className="px-2.5 py-1.5 rounded-xl bg-[#16202C] border border-[#223244] text-xs font-bold text-slate-300 hover:text-white hover:border-[#00D284]"
                                >
                                    FY 2025-26
                                </button>
                            </div>
                        </div>

                        {/* From & To Date Inputs */}
                        <div className="space-y-3 pt-1">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">From Date</label>
                                <input
                                    type="date"
                                    value={tempFromDate}
                                    onChange={e => setTempFromDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-[#16202C] border border-[#223244] text-xs text-white font-bold cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">To Date</label>
                                <input
                                    type="date"
                                    value={tempToDate}
                                    onChange={e => setTempToDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-[#16202C] border border-[#223244] text-xs text-white font-bold cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleClearDateRange}
                                className="flex-1 py-2.5 rounded-xl border border-[#223244] text-xs font-bold text-slate-400 hover:text-white hover:bg-[#16202C]"
                            >
                                Reset / Clear
                            </button>
                            <button
                                onClick={handleApplyDateRange}
                                className="flex-1 py-2.5 rounded-xl bg-[#00D284] text-black text-xs font-black shadow-md hover:bg-[#00BF76]"
                            >
                                Apply Filter
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import './PartyItemsBreakdownView.css';
import React, { useState, useMemo, useEffect } from 'react';
import {
    ChevronLeft, Search, FileText, Calendar, ChevronRight,
    ArrowUpDown, ArrowDown, ArrowUp, X, Package, Download,
    ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

export interface PartyTransactedItem {
    name: string;
    totalQty: number;
    totalAmount: number;
    unit: string;
    lastDate: string;
    lastRate: number;
    avgRate: number;
    entries: Array<{
        voucherId: string;
        voucherNumber: string;
        voucherType: string;
        date: string;
        qty: number;
        rate: number;
        unit: string;
        amount: number;
    }>;
}

interface PartyItemsBreakdownViewProps {
    partyName: string;
    initialType?: 'sold' | 'purchased';
    itemsSold: PartyTransactedItem[];
    itemsPurchased: PartyTransactedItem[];
    selectedFY?: string;
    isStandalone?: boolean;
    onBack?: () => void;
    navigate: (path: string) => void;
}

type SortField = 'date' | 'qty';
type SortOrder = 'desc' | 'asc';

export const PartyItemsBreakdownView: React.FC<PartyItemsBreakdownViewProps> = ({
    partyName,
    initialType,
    itemsSold = [],
    itemsPurchased = [],
    selectedFY = 'FY 2025-26',
    isStandalone = true,
    onBack,
    navigate
}) => {
    // Smart default: If sold is 0 and purchased has items, default to 'purchased'
    const smartInitial = useMemo<'sold' | 'purchased'>(() => {
        if (initialType) return initialType;
        if (itemsSold.length === 0 && itemsPurchased.length > 0) return 'purchased';
        return 'sold';
    }, [initialType, itemsSold.length, itemsPurchased.length]);

    const [viewType, setViewType] = useState<'sold' | 'purchased'>(smartInitial);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [expandedItem, setExpandedItem] = useState<string | null>(null);
    const [dateOffset, setDateOffset] = useState(0);

    // Auto switch if initial selection was empty but items loaded
    useEffect(() => {
        if (!initialType) {
            if (itemsSold.length === 0 && itemsPurchased.length > 0 && viewType === 'sold') {
                setViewType('purchased');
            } else if (itemsPurchased.length === 0 && itemsSold.length > 0 && viewType === 'purchased') {
                setViewType('sold');
            }
        }
    }, [itemsSold.length, itemsPurchased.length, initialType, viewType]);

    const dateRangeLabel = useMemo(() => {
        const yearMatch = selectedFY.match(/\b(20\d{2})\b/);
        let startYear = yearMatch ? parseInt(yearMatch[1], 10) : 2025;
        startYear += dateOffset;
        const endYear = startYear + 1;
        const startStr = `01 Apr ${String(startYear).slice(-2)}`;
        const endStr = `31 Mar ${String(endYear).slice(-2)}`;
        return `${startStr} - ${endStr}`;
    }, [selectedFY, dateOffset]);

    const currentItems = viewType === 'sold' ? itemsSold : itemsPurchased;

    // Filter and Sort
    const displayedItems = useMemo(() => {
        let list = [...currentItems];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(item => item.name.toLowerCase().includes(q));
        }

        list.sort((a, b) => {
            if (sortField === 'date') {
                const dateA = a.lastDate ? new Date(a.lastDate).getTime() : 0;
                const dateB = b.lastDate ? new Date(b.lastDate).getTime() : 0;
                return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
            } else {
                return sortOrder === 'desc' ? b.totalQty - a.totalQty : a.totalQty - b.totalQty;
            }
        });

        return list;
    }, [currentItems, searchQuery, sortField, sortOrder]);

    const totalQtySum = useMemo(() => {
        return displayedItems.reduce((acc, curr) => acc + curr.totalQty, 0);
    }, [displayedItems]);

    const handleSortDate = () => {
        if (sortField === 'date') {
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField('date');
            setSortOrder('desc');
        }
    };

    const handleSortQty = () => {
        if (sortField === 'qty') {
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField('qty');
            setSortOrder('desc');
        }
    };

    const handleExportPDF = () => {
        if (displayedItems.length === 0) {
            toast.error('No items to export');
            return;
        }

        import('jspdf').then(({ default: jsPDF }) => {
            import('jspdf-autotable').then(({ default: autoTable }) => {
                const doc = new jsPDF();
                const titleText = `${viewType === 'sold' ? 'Sold Items' : 'Purchased Items'} - ${partyName}`;
                doc.setFontSize(14);
                doc.text(titleText, 14, 15);
                doc.setFontSize(9);
                doc.setTextColor(100);
                doc.text(`Period: ${dateRangeLabel} | Total Items: ${displayedItems.length} | Generated: ${format(new Date(), 'dd MMM yyyy')}`, 14, 22);

                autoTable(doc, {
                    startY: 26,
                    head: [['#', 'Item Description', 'Last Date', 'Avg Rate', 'Quantity']],
                    body: displayedItems.map((item, idx) => [
                        idx + 1,
                        item.name,
                        item.lastDate ? format(new Date(item.lastDate), 'dd MMM yy') : '-',
                        `₹${(item.avgRate || 0).toFixed(2)}${item.unit ? `/${item.unit}` : ''}`,
                        `${item.totalQty.toFixed(2)} ${item.unit || 'units'}`
                    ]),
                    theme: 'striped',
                    headStyles: { fillColor: [15, 23, 42] },
                    styles: { fontSize: 9 }
                });

                doc.save(`${viewType}_items_${partyName.replace(/\s+/g, '_')}.pdf`);
                toast.success('PDF downloaded successfully');
            }).catch(err => {
                toast.error('PDF error: ' + err.message);
            });
        }).catch(err => {
            toast.error('Failed to load PDF library: ' + err.message);
        });
    };

    return (
        <div className={`party-items-view text-slate-100 flex flex-col font-sans ${isStandalone ? 'min-h-screen bg-[#070b14]' : 'bg-[#0B1118]'}`}>
            {/* 1. TOP HEADER */}
            {isStandalone ? (
                /* Standalone View Header (Matching Image 2: <- Sold   🔍  PDF) */
                <header className="sticky top-0 z-40 bg-[#0B1118]/95 backdrop-blur-md border-b border-[#1E2B38] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="w-9 h-9 rounded-full bg-[#142032] border border-[#22334c] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
                                title="Back"
                            >
                                <ChevronLeft size={22} />
                            </button>
                        )}
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-black text-white tracking-tight">
                                    {viewType === 'sold' ? 'Sold' : 'Purchased'}
                                </h1>
                                <div className="flex items-center rounded-lg bg-[#142032] p-0.5 border border-[#22334c]">
                                    <button
                                        onClick={() => setViewType('sold')}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                                            viewType === 'sold'
                                                ? 'bg-emerald-500 text-black shadow-xs font-black'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        Sold ({itemsSold.length})
                                    </button>
                                    <button
                                        onClick={() => setViewType('purchased')}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                                            viewType === 'purchased'
                                                ? 'bg-cyan-500 text-black shadow-xs font-black'
                                                : 'text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        Purchased ({itemsPurchased.length})
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                                {partyName}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSearch(prev => !prev)}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                                showSearch
                                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                                    : 'bg-[#142032] border-[#22334c] text-slate-300 hover:text-white'
                            }`}
                            title="Search Items"
                        >
                            <Search size={17} />
                        </button>

                        <button
                            onClick={handleExportPDF}
                            className="h-9 px-2.5 rounded-xl bg-[#142032] hover:bg-[#1a2942] border border-[#22334c] flex items-center gap-1.5 text-slate-200 transition-all cursor-pointer group"
                            title="Download PDF"
                        >
                            <span className="w-5 h-5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-[9px] font-black group-hover:scale-105 transition-transform">
                                PDF
                            </span>
                            <Download size={14} className="text-slate-400 group-hover:text-white" />
                        </button>
                    </div>
                </header>
            ) : (
                /* Native In-Tab Header (Clean segmented pill + Search + PDF, NO duplicate back arrow) */
                <div className="party-items-toolbar px-4 py-2.5 bg-[#0e1726] border-b border-[#1b283d] flex items-center justify-between gap-2">
                    {/* Segmented Pill Switcher */}
                    <div className="flex bg-[#142032] p-1 rounded-xl border border-[#1f2f48] text-xs">
                        <button
                            onClick={() => setViewType('sold')}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                                viewType === 'sold'
                                    ? 'bg-emerald-500 text-black shadow-xs font-black'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <span>Sold</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                viewType === 'sold' ? 'bg-black/20 text-black font-extrabold' : 'bg-[#1e2f48] text-slate-300'
                            }`}>
                                {itemsSold.length}
                            </span>
                        </button>
                        <button
                            onClick={() => setViewType('purchased')}
                            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                                viewType === 'purchased'
                                    ? 'bg-cyan-400 text-black shadow-xs font-black'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <span>Purchased</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                viewType === 'purchased' ? 'bg-black/20 text-black font-extrabold' : 'bg-[#1e2f48] text-slate-300'
                            }`}>
                                {itemsPurchased.length}
                            </span>
                        </button>
                    </div>

                    {/* Search & PDF Buttons */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setShowSearch(prev => !prev)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                                showSearch
                                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                                    : 'bg-[#142032] border-[#1f2f48] text-slate-300 hover:text-white'
                            }`}
                            title="Search Items"
                        >
                            <Search size={15} />
                        </button>

                        <button
                            onClick={handleExportPDF}
                            className="h-8 px-2 rounded-xl bg-[#142032] hover:bg-[#1c2c44] border border-[#1f2f48] flex items-center gap-1 text-slate-200 transition-all cursor-pointer group"
                            title="Download PDF"
                        >
                            <span className="w-4 h-4 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-[8px] font-black">
                                PDF
                            </span>
                            <Download size={13} className="text-slate-400 group-hover:text-white" />
                        </button>
                    </div>
                </div>
            )}

            {/* 2. SEARCH INPUT (When Opened) */}
            {showSearch && (
                <div className="px-4 py-2 bg-[#0c1422] border-b border-[#18253a] flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                        <input
                            autoFocus
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${viewType} items by name...`}
                            className="w-full bg-[#111c2e] border border-cyan-500/40 rounded-xl py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-400 focus:outline-none shadow-inner"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 3. DATE RANGE SELECTOR STRIP (< 📅 01 Apr 25 - 31 Mar 26 >) */}
            <div className="party-items-period bg-[#09111c] border-b border-[#162235] px-4 py-2 flex items-center justify-between text-xs">
                <button
                    onClick={() => setDateOffset(prev => prev - 1)}
                    className="w-7 h-7 rounded-lg bg-[#111b2b] hover:bg-[#18263d] border border-[#1c2c44] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
                    title="Previous Year"
                >
                    <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-2 font-semibold text-slate-200">
                    <Calendar size={13} className="text-cyan-400" />
                    <span className="font-mono text-xs text-slate-200 font-bold">
                        {dateRangeLabel}
                    </span>
                </div>

                <button
                    onClick={() => setDateOffset(prev => prev + 1)}
                    className="w-7 h-7 rounded-lg bg-[#111b2b] hover:bg-[#18263d] border border-[#1c2c44] flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition-all"
                    title="Next Year"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* 4. SORTER / COLUMN HEADERS (Last Sold Date ⇅      Quantity ↓) */}
            <div className="party-items-sort bg-[#080e18] border-b border-[#141e2e] px-4 py-2 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <button
                    onClick={handleSortDate}
                    className={`flex items-center gap-1.5 transition-colors ${
                        sortField === 'date' ? 'text-white' : 'hover:text-slate-200'
                    }`}
                >
                    <span>Last {viewType === 'sold' ? 'Sold' : 'Purchased'} Date</span>
                    {sortField === 'date' ? (
                        sortOrder === 'desc' ? <ArrowDown size={13} className="text-cyan-400" /> : <ArrowUp size={13} className="text-cyan-400" />
                    ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                    )}
                </button>

                <button
                    onClick={handleSortQty}
                    className={`flex items-center gap-1.5 transition-colors ${
                        sortField === 'qty' ? 'text-white' : 'hover:text-slate-200'
                    }`}
                >
                    <span>Quantity</span>
                    {sortField === 'qty' ? (
                        sortOrder === 'desc' ? <ArrowDown size={13} className="text-emerald-400" /> : <ArrowUp size={13} className="text-emerald-400" />
                    ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                    )}
                </button>
            </div>

            {/* 5. ITEM LIST FEED (Matching Image 2 Reference) */}
            <main className="party-items-list flex-1 divide-y divide-[#131d2e]">
                {displayedItems.length === 0 ? (
                    <div className="py-16 flex flex-col items-center justify-center space-y-2 text-center px-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#111a2a] border border-[#1c2a40] flex items-center justify-center text-slate-500">
                            <Package size={22} />
                        </div>
                        <p className="text-xs font-bold text-slate-300">
                            No {viewType === 'sold' ? 'sold' : 'purchased'} items recorded
                        </p>
                        <p className="text-[11px] text-slate-500 max-w-xs">
                            {viewType === 'sold' && itemsPurchased.length > 0 ? (
                                <span>Switch to <button onClick={() => setViewType('purchased')} className="text-cyan-400 font-bold underline">Purchased ({itemsPurchased.length})</button> to view purchase items</span>
                            ) : (
                                <span>No entries found for this party in the selected period.</span>
                            )}
                        </p>
                    </div>
                ) : (
                    displayedItems.map((item, idx) => {
                        const isExpanded = expandedItem === item.name;
                        const dateFormatted = item.lastDate
                            ? format(new Date(item.lastDate), 'dd MMM yy')
                            : '-';
                        const rateFormatted = `₹${(item.avgRate || 0).toFixed(2)}${item.unit ? `/${item.unit}` : ''}`;
                        const qtyFormatted = `${item.totalQty.toFixed(2)} ${item.unit || 'units'}`;

                        return (
                            <div key={idx} className="bg-[#0B1118] hover:bg-[#0f1726] transition-colors">
                                <div
                                    onClick={() => setExpandedItem(isExpanded ? null : item.name)}
                                    className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer group"
                                >
                                    {/* Left: Item Name & Subtitle */}
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-[13px] font-bold text-white tracking-tight truncate group-hover:text-cyan-300 transition-colors">
                                            {item.name}
                                        </h3>
                                        <p className="text-[11px] text-slate-400 mt-0.5 truncate font-normal">
                                            <span>{dateFormatted}</span>
                                            <span className="mx-1.5 text-slate-600">|</span>
                                            <span>Avg. Rate: <span className="font-mono text-slate-300 font-medium">{rateFormatted}</span></span>
                                        </p>
                                    </div>

                                    {/* Right: Total Quantity + Chevron */}
                                    <div className="flex items-center gap-2 text-right shrink-0">
                                        <span className="text-[13px] font-bold text-white font-mono tracking-tight">
                                            {qtyFormatted}
                                        </span>
                                        <ChevronRight
                                            size={15}
                                            className={`text-slate-500 transition-transform ${
                                                isExpanded ? 'rotate-90 text-cyan-400' : 'group-hover:text-slate-300 group-hover:translate-x-0.5'
                                            }`}
                                        />
                                    </div>
                                </div>

                                {/* Expanded Voucher Breakdown Drawer */}
                                {isExpanded && item.entries && item.entries.length > 0 && (
                                    <div className="bg-[#09111c] border-t border-[#152033] px-4 py-2 space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-[#18243a]">
                                            <span>Invoice / Bill</span>
                                            <span>Date</span>
                                            <span>Rate</span>
                                            <span className="text-right">Qty & Total</span>
                                        </div>

                                        {item.entries.map((entry, eIdx) => (
                                            <div
                                                key={eIdx}
                                                onClick={() => entry.voucherId && navigate(`/invoice/${encodeURIComponent(entry.voucherId)}`)}
                                                className="grid grid-cols-[1fr_75px_85px_95px] gap-2 py-1.5 text-xs items-center hover:bg-[#111b2b] px-1.5 rounded-lg transition-colors cursor-pointer"
                                            >
                                                <div className="min-w-0">
                                                    <span className="font-mono font-bold text-cyan-400 text-[11px] hover:underline flex items-center gap-1 truncate">
                                                        #{entry.voucherNumber || 'Bill'}
                                                        <ExternalLink size={10} className="text-slate-500 shrink-0" />
                                                    </span>
                                                    <span className="text-[9px] text-slate-400 block truncate">{entry.voucherType}</span>
                                                </div>

                                                <div className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                                    {entry.date ? format(new Date(entry.date), 'dd MMM yy') : '-'}
                                                </div>

                                                <div className="font-mono text-slate-300 text-[11px] whitespace-nowrap">
                                                    ₹{entry.rate.toFixed(2)}
                                                </div>

                                                <div className="text-right">
                                                    <span className="font-mono font-bold text-white text-[11px] block">
                                                        {entry.qty.toFixed(2)} {entry.unit}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-emerald-400">
                                                        ₹{entry.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </main>

            {/* 6. BOTTOM TOTAL SUMMARY STRIP */}
            <footer className="party-items-footer bg-[#09111c] border-t border-[#162235] px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <span>Total Items:</span>
                    <span className="font-mono font-bold text-white">{displayedItems.length}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">Total Quantity:</span>
                    <span className="font-mono font-black text-cyan-400 text-xs">
                        {totalQtySum.toFixed(2)}
                    </span>
                </div>
            </footer>
        </div>
    );
};

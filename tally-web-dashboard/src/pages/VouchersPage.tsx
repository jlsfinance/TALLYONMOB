import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
import { useAuth } from '../contexts/AuthContext';
import { supabase, pendingTransactionApi } from '../lib/insforge';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Search, Activity, ArrowUpRight, ArrowDownLeft,
    Zap, Calendar
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
    Spinner, EmptyState
} from '../components/ui/GlassUI';
import { SkeletonTable } from '../components/ui/Skeleton';
import TransactionCard from '../components/shared/TransactionCard';
import { CompactDateFilter } from '../components/shared/CompactDateFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';

export default function VouchersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('party') || '');
    const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
    const [syncStatusFilter, setSyncStatusFilter] = useState<string | null>(null);
    const activeRequestRef = useRef(0);

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [selectedMonth, setSelectedMonth] = useState<string | null>(() => format(new Date(), 'yyyy-MM'));

    const handleExportCSV = () => {
        const headers = [
            { key: 'voucher_number', label: 'Voucher No' },
            { key: 'voucher_type', label: 'Type' },
            { key: 'voucher_date', label: 'Date' },
            { key: 'party_name', label: 'Party Name' },
            { key: 'total_amount', label: 'Amount' }
        ];
        import('../lib/exportToCSV').then(({ exportToCSV }) => {
            exportToCSV(
                filteredVouchers,
                headers,
                `Vouchers_${selectedCompany.name}_${selectedMonth || selectedFy}.csv`
            );
        }).catch(err => {
            toast.error('Failed to export: ' + err.message);
        });
    };

    // Generate months for the selected FY
    const monthsInFy = useMemo(() => {
        const startYearText = selectedFy.split(' ')[1].split('-')[0];
        const startYear = parseInt(startYearText);
        const months = [];

        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1);
            months.push({
                key: format(date, 'yyyy-MM'),
                label: format(date, 'MMM'),
                fullLabel: format(date, 'MMMM yyyy'),
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd')
            });
        }
        const allOption = {
            key: 'all',
            label: 'ALL',
            fullLabel: 'Full Financial Year',
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };

        return [allOption, ...months.reverse()];
    }, [selectedFy]);

    useEffect(() => {
        if (searchTerm) {
            setSelectedMonth('all');
        }
    }, [searchTerm]);

    const { data: vouchersData, isLoading: vouchersLoading } = useQuery(
        ['vouchers', selectedCompany?.id, selectedMonth, selectedType, selectedFy],
        async () => {
            const companyId = selectedCompany?.id;
            if (!companyId || !selectedMonth) return [];

            if (selectedType === 'Pending') {
                const { data, error } = await pendingTransactionApi.list(companyId, 'pending');
                if (error) throw error;

                return (data || []).map((current: any) => ({
                    id: current.id,
                    voucher_number: current.voucher_data?.voucher_number || 'PENDING',
                    party_name: current.voucher_data?.party_name || 'Unknown',
                    voucher_type: current.transaction_type,
                    voucher_date: current.voucher_data?.voucher_date || current.created_at,
                    total_amount: current.voucher_data?.grand_total || 0,
                    sync_status: 'Pending'
                }));
            }

            const monthObj = monthsInFy.find((m: any) => m.key === selectedMonth);
            if (!monthObj) return [];

            const limit = selectedMonth === 'all' ? 2000 : 1000;
            let query = supabase.from('vouchers')
                .select('id, voucher_number, party_name, voucher_type, voucher_date, total_amount, grand_total')
                .eq('company_id', companyId)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .gte('voucher_date', monthObj.start)
                .lte('voucher_date', monthObj.end)
                .order('voucher_date', { ascending: false })
                .limit(limit);

            if (selectedType !== 'all') {
                query = query.eq('voucher_type', selectedType);
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map((v: any) => ({
                ...v,
                total_amount: Number(v.total_amount ?? v.grand_total ?? 0)
            }));
        },
        {
            enabled: !!selectedCompany?.id && !!selectedMonth,
        }
    );

    const vouchers = vouchersData || [];
    const loading = vouchersLoading;

    const filteredVouchers = vouchers.filter(v =>
        v.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const [showSearch, setShowSearch] = useState(false);

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24">
            <HeaderPortal type="title">
                <div>
                    <h1 className="text-sm md:text-xl font-black text-[var(--on-surface)] tracking-tighter uppercase leading-none">Journal Node</h1>
                    <p className="hidden md:block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany.name}</p>
                </div>
            </HeaderPortal>

            <HeaderPortal type="search">
                <div className="flex items-center gap-2">
                    <AnimatePresence>
                        {showSearch ? (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: '200px', opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="relative overflow-hidden"
                            >
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary)]" />
                                <input
                                    autoFocus
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onBlur={() => !searchTerm && setShowSearch(false)}
                                    className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-xl py-1.5 pl-9 pr-3 text-[11px] font-bold text-[var(--on-surface)] focus:outline-none focus:border-[var(--primary)]"
                                />
                            </motion.div>
                        ) : (
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2 rounded-xl hover:bg-[var(--surface-variant)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-all"
                            >
                                <Search size={18} />
                            </button>
                        )}
                    </AnimatePresence>
                </div>
            </HeaderPortal>

            <HeaderPortal type="filters">
                <div className="flex items-center gap-2">
                    <CompactDateFilter
                        selectedFy={selectedFy}
                        onFyChange={setSelectedFy}
                        selectedMonth={selectedMonth}
                        onMonthChange={setSelectedMonth}
                        monthsInFy={monthsInFy}
                    />
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-variant)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                        Export CSV
                    </button>
                </div>
            </HeaderPortal>

            {/* Sticky Header Section for Mobile */}
            <div className="sticky top-0 z-20 bg-[var(--background)]/80 backdrop-blur-md pt-2 pb-3 -mx-4 px-4 space-y-3 shadow-xl shadow-[var(--background)]">

                {/* Type Filter - Compact Chips */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                    {voucherTypes.map((type) => {
                        const isActive = selectedType === type.key;
                        return (
                            <button
                                key={type.key}
                                onClick={() => setSelectedType(type.key)}
                                className={`
                                    flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border
                                    ${isActive
                                        ? 'bg-[var(--on-surface)] text-[var(--surface)] border-[var(--on-surface)] shadow-lg ring-2 ring-[var(--on-surface)]/10 scale-105'
                                        : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                    }
                                `}
                            >
                                <span className="flex-shrink-0 scale-110 md:scale-100">{type.icon}</span>
                                <span className={`${isActive ? 'block' : 'hidden md:block'} transition-all duration-300`}>
                                    {type.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Stream List */}
            <AnimatePresence mode="wait">
                {loading ? (
                    <SkeletonTable rows={8} cols={5} />
                ) : filteredVouchers.length === 0 ? (
                    <EmptyState icon={<FileText size={48} />} title="No Records" description="Try another month or FY" />
                ) : (
                    <div className="space-y-1.5 h-[650px] overflow-hidden">
                        <List
                            height={650}
                            itemCount={filteredVouchers.length}
                            itemSize={74}
                            width="100%"
                        >
                            {({ index, style }) => {
                                const v = filteredVouchers[index];
                                return (
                                    <div style={style} className="pr-2 pb-1.5">
                                        <TransactionCard
                                            key={v.voucher_id || v.id || index}
                                            type={v.voucher_type}
                                            partyName={v.party_name || (v.voucher_type + ' #' + v.voucher_number)}
                                            voucherNumber={v.voucher_number}
                                            date={v.voucher_date}
                                            amount={Number(v.total_amount) || 0}
                                            status={v.sync_status || 'Synced'}
                                            onClick={() => navigate(`/vouchers/${encodeURIComponent(v.id)}`)}
                                        />
                                    </div>
                                );
                            }}
                        </List>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}





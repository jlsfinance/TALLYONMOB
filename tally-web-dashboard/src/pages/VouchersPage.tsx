import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, pendingTransactionApi } from '../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Search, Activity, ArrowUpRight, ArrowDownLeft,
    Zap, Calendar
} from 'lucide-react';
import {
    Spinner, EmptyState
} from '../components/ui/GlassUI';
import TransactionCard from '../components/shared/TransactionCard';
import { CompactDateFilter } from '../components/shared/CompactDateFilter';
import { HeaderPortal } from '../components/layout/HeaderPortal';

export default function VouchersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('party') || '');
    const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
    const [syncStatusFilter, setSyncStatusFilter] = useState<string | null>(null);

    // Calculate current FY dynamically (FY starts in April)
    const getCurrentFy = () => {
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const endYear = (currentYear + 1).toString().slice(2);
        return `FY ${currentYear}-${endYear}`;
    };

    const [selectedFy, setSelectedFy] = useState(getCurrentFy());
    const [selectedMonth, setSelectedMonth] = useState<string | null>('all');

    const voucherTypes = [
        { key: 'all', label: 'All', icon: <Activity size={12} /> },
        { key: 'Sales', label: 'Sales', icon: <ArrowUpRight size={12} /> },
        { key: 'Purchase', label: 'Purchase', icon: <ArrowDownLeft size={12} /> },
        { key: 'Receipt', label: 'Receipt', icon: <Zap size={12} /> },
        { key: 'Payment', label: 'Payment', icon: <Zap size={12} /> },
        { key: 'Pending', label: 'Pending Sync', icon: <Activity size={12} /> },
    ];

    // Generate months for the selected FY
    const monthsInFy = useMemo(() => {
        const startYearText = selectedFy.split(' ')[1].split('-')[0];
        const startYear = parseInt(startYearText);
        const months = [];

        // FY starts from April of startYear to March of startYear + 1
        for (let i = 0; i < 12; i++) {
            const date = new Date(startYear, 3 + i, 1); // 3 = April
            months.push({
                key: format(date, 'yyyy-MM'),
                label: format(date, 'MMM'),
                fullLabel: format(date, 'MMMM yyyy'),
                start: format(startOfMonth(date), 'yyyy-MM-dd'),
                end: format(endOfMonth(date), 'yyyy-MM-dd')
            });
        }
        // Add an "ALL" option for the full year
        const allOption = {
            key: 'all',
            label: 'ALL',
            fullLabel: 'Full Financial Year',
            start: `${startYear}-04-01`,
            end: `${startYear + 1}-03-31`
        };

        return [allOption, ...months.reverse()]; // Show ALL then latest months first
    }, [selectedFy]);

    // Simplified auto-selection (Default to ALL as per user request)
    useEffect(() => {
        if (searchTerm) {
            setSelectedMonth('all');
        }
    }, [searchTerm]);

    useEffect(() => {
        if (selectedMonth && selectedCompany) loadVouchers();
    }, [selectedMonth, selectedType, selectedCompany]);

    const loadVouchers = async () => {
        setLoading(true);

        // Handle Pending Transactions explicitly
        if (selectedType === 'Pending') {
            try {
                const { data, error } = await pendingTransactionApi.list(selectedCompany.id, 'pending');
                if (error) throw error;

                const mapped = (data || []).map((current: any) => ({
                    id: current.id,
                    voucher_number: current.voucher_data?.voucher_number || 'PENDING',
                    party_name: current.voucher_data?.party_name || 'Unknown',
                    voucher_type: current.transaction_type,
                    voucher_date: current.voucher_data?.voucher_date || current.created_at,
                    total_amount: current.voucher_data?.grand_total || 0,
                    sync_status: 'Pending'
                }));

                setVouchers(mapped);
            } catch (err) {
                console.error('Failed to load pending vouchers:', err);
                setVouchers([]);
            } finally {
                setLoading(false);
            }
            return;
        }

        const monthObj = monthsInFy.find((m: any) => m.key === selectedMonth);
        if (!monthObj) {
            setLoading(false);
            return;
        }

        try {
            let query = supabase.from('vouchers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', monthObj.start)
                .lte('voucher_date', monthObj.end)
                .order('voucher_date', { ascending: false })
                .limit(50000); // Increased limit for full year views

            if (selectedType !== 'all') {
                query = query.eq('voucher_type', selectedType);
            }

            const { data, error } = await query;
            if (error) throw error;

            setVouchers(data || []);
        } catch (err) {
            console.error('Failed to load vouchers:', err);
            setVouchers([]);
        } finally {
            setLoading(false);
        }
    };

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
                <CompactDateFilter
                    selectedFy={selectedFy}
                    onFyChange={setSelectedFy}
                    selectedMonth={selectedMonth}
                    onMonthChange={setSelectedMonth}
                    monthsInFy={monthsInFy}
                />
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
                    <div className="flex flex-col items-center justify-center py-20">
                        <Spinner size="md" />
                        <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text-muted)] mt-4">Streaming Node Data...</p>
                    </div>
                ) : filteredVouchers.length === 0 ? (
                    <EmptyState icon={<FileText size={48} />} title="No Records" description="Try another month or FY" />
                ) : (
                    <div className="space-y-1.5">
                        {filteredVouchers.map((v, idx) => (
                            <TransactionCard
                                key={v.voucher_id || v.id || idx}
                                type={v.voucher_type}
                                partyName={v.party_name || (v.voucher_type + ' #' + v.voucher_number)}
                                voucherNumber={v.voucher_number}
                                date={v.voucher_date}
                                amount={Number(v.total_amount) || 0}
                                status={v.sync_status || 'Synced'}
                                onClick={() => navigate(`/vouchers/${encodeURIComponent(v.id)}`)}
                            />
                        ))}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

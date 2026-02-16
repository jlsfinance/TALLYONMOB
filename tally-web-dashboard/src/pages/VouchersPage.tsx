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
import { FinancialYearFilter } from '../components/shared/FinancialYearFilter';

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
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

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

    // Auto-select "ALL" if there is a search term (party filter), otherwise find recent month
    useEffect(() => {
        const findMonthWithVouchers = async () => {
            if (!selectedCompany || monthsInFy.length === 0) return;

            // If searching for a party, default to "ALL" to show full history
            if (searchTerm) {
                setSelectedMonth('all');
                return;
            }

            // Check each month starting from most recent to find one with vouchers
            for (const month of monthsInFy) {
                if (month.key === 'all') continue; // Skip ALL check for auto-selection

                const { count } = await supabase
                    .from('vouchers')
                    .select('*', { count: 'exact', head: true })
                    .eq('company_id', selectedCompany.id)
                    .gte('voucher_date', month.start)
                    .lte('voucher_date', month.end);

                if (count && count > 0) {
                    setSelectedMonth(month.key);
                    return;
                }
            }
            // Fallback to ALL if no specific month has data
            setSelectedMonth('all');
        };

        findMonthWithVouchers();
    }, [monthsInFy, selectedCompany, searchTerm]); // Add searchTerm dependency

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

    if (!selectedCompany) return null;

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-24 px-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--on-surface)] tracking-tighter uppercase">Transactions</h1>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{selectedCompany.name}</p>
                </div>
            </div>

            {/* Global FY Slider */}
            <FinancialYearFilter selectedFy={selectedFy} onFyChange={setSelectedFy} />

            {/* Month Filter for Selected FY - Compact Horizontal Scroller */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 -mx-2 px-2">
                {monthsInFy.map((m) => {
                    const isActive = selectedMonth === m.key;
                    return (
                        <button
                            key={m.key}
                            onClick={() => setSelectedMonth(m.key)}
                            className={`
                                min-w-[60px] flex flex-col items-center py-2 px-3 rounded-2xl text-[9px] font-black uppercase transition-all border
                                ${isActive
                                    ? 'bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] border-none text-white shadow-lg scale-105 z-10'
                                    : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)] opacity-70'
                                }
                            `}
                        >
                            <Calendar size={12} className={isActive ? 'mb-1 opacity-100' : 'mb-1 opacity-40'} />
                            {m.label}
                        </button>
                    );
                })}
            </div>

            {/* Sticky Header Section for Mobile */}
            <div className="sticky top-0 z-20 bg-[var(--background)]/80 backdrop-blur-md pt-2 pb-3 -mx-4 px-4 space-y-3 shadow-xl shadow-[var(--background)]">
                {/* Search Bar - Most critical for mobile UX */}
                <div className="relative group">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--primary)] opacity-50" />
                    <input
                        placeholder="SEARCH PARTY OR VOUCHER..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--surface-variant)] border border-[var(--border)] rounded-2xl py-3.5 pl-11 pr-4 text-[11px] font-black text-[var(--on-surface)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] focus:outline-none transition-all placeholder:text-[var(--text-muted)] placeholder:font-black"
                    />
                </div>

                {/* Type Filter - Compact Chips */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                    {voucherTypes.map((type) => {
                        const isActive = selectedType === type.key;
                        return (
                            <button
                                key={type.key}
                                onClick={() => setSelectedType(type.key)}
                                className={`
                                    flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border
                                    ${isActive
                                        ? 'bg-[var(--on-surface)] text-[var(--surface)] border-[var(--on-surface)] shadow-md'
                                        : 'bg-[var(--surface-variant)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-active)]'
                                    }
                                `}
                            >
                                {type.icon}
                                {type.label}
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
                    <div className="space-y-3">
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

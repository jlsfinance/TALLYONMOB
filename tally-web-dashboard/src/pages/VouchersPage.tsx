import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { motion } from 'framer-motion';
import { FileText, Search, Plus, Filter } from 'lucide-react';
import { Card, Chip, Badge, Input, ListItem, Avatar, Fab, Spinner, EmptyState } from '@/components/ui/GlassUI';

export default function VouchersPage() {
    const { selectedCompany } = useAuth() as any;
    const [searchParams] = useSearchParams();
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
    const [months, setMonths] = useState<any[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

    const voucherTypes = [
        { key: 'all', label: 'All' },
        { key: 'Sales', label: 'Sales' },
        { key: 'Purchase', label: 'Purchase' },
        { key: 'Receipt', label: 'Receipt' },
        { key: 'Payment', label: 'Payment' },
    ];

    useEffect(() => {
        loadMonthStats();
    }, [selectedCompany]);

    useEffect(() => {
        if (selectedMonth && selectedCompany) loadVouchers();
    }, [selectedMonth, selectedType, selectedCompany]);

    const loadMonthStats = async () => {
        if (!selectedCompany) return;

        const now = new Date();
        const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);

        const monthList = [];
        let current = now;

        while (current >= fyStart) {
            const monthStart = format(startOfMonth(current), 'yyyy-MM-dd');
            const monthEnd = format(endOfMonth(current), 'yyyy-MM-dd');

            const { count } = await supabase.from('vouchers').select('*', { count: 'exact', head: true })
                .eq('company_id', selectedCompany.id)
                .gte('voucher_date', monthStart)
                .lte('voucher_date', monthEnd);

            monthList.push({
                key: monthStart,
                label: format(current, 'MMM yy'),
                fullLabel: format(current, 'MMMM yyyy'),
                count: count || 0,
                start: monthStart,
                end: monthEnd
            });

            current = subMonths(current, 1);
        }

        setMonths(monthList);
        if (monthList.length > 0) setSelectedMonth(monthList[0].key);
    };

    const loadVouchers = async () => {
        if (!selectedCompany || !selectedMonth) return;
        setLoading(true);

        const month = months.find(m => m.key === selectedMonth);
        if (!month) return;

        let query = supabase.from('vouchers')
            .select('*')
            .eq('company_id', selectedCompany.id)
            .gte('voucher_date', month.start)
            .lte('voucher_date', month.end)
            .order('voucher_date', { ascending: false });

        if (selectedType !== 'all') {
            query = query.eq('voucher_type', selectedType);
        }

        const { data } = await query;
        setVouchers(data || []);
        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)} Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredVouchers = vouchers.filter(v =>
        v.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)]">Vouchers</h1>
                <p className="text-[var(--on-surface-variant)] mt-1">
                    {months.find(m => m.key === selectedMonth)?.fullLabel || 'Select month'}
                </p>
            </div>

            {/* Month Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {months.map((month) => (
                    <Chip
                        key={month.key}
                        selected={selectedMonth === month.key}
                        onClick={() => setSelectedMonth(month.key)}
                    >
                        <div className="text-center">
                            <div>{month.label}</div>
                            <div className="text-xs opacity-70">{month.count}</div>
                        </div>
                    </Chip>
                ))}
            </div>

            {/* Type Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {voucherTypes.map((type) => (
                    <Chip
                        key={type.key}
                        selected={selectedType === type.key}
                        onClick={() => setSelectedType(type.key)}
                        size="sm"
                    >
                        {type.label}
                    </Chip>
                ))}
            </div>

            {/* Search */}
            <Input
                placeholder="Search voucher or party..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search size={18} />}
            />

            {/* Voucher List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            ) : filteredVouchers.length === 0 ? (
                <EmptyState
                    icon={<FileText size={48} />}
                    title="No vouchers found"
                    description="Try adjusting your filters"
                />
            ) : (
                <Card padding="none">
                    <div className="divide-y divide-[var(--border)]">
                        {filteredVouchers.map((voucher) => {
                            const isCredit = voucher.voucher_type === 'Sales' || voucher.voucher_type === 'Receipt';
                            const colorMap: Record<string, 'success' | 'error' | 'warning' | 'primary'> = {
                                'Sales': 'success',
                                'Purchase': 'warning',
                                'Receipt': 'primary',
                                'Payment': 'error'
                            };

                            return (
                                <Link key={voucher.voucher_id} to={`/vouchers/${encodeURIComponent(voucher.voucher_id)}`}>
                                    <ListItem
                                        title={voucher.party_name || 'Unknown Party'}
                                        subtitle={`#${voucher.voucher_number} • ${format(new Date(voucher.voucher_date), 'dd MMM yyyy')}`}
                                        leading={
                                            <Avatar
                                                name={voucher.voucher_type?.charAt(0) || 'V'}
                                                color={colorMap[voucher.voucher_type] || 'primary'}
                                            />
                                        }
                                        trailing={
                                            <div className="text-right">
                                                <p className={`font-semibold ${isCredit ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                                                    {isCredit ? '+' : '-'} {formatCurrency(Math.abs(voucher.total_amount || 0))}
                                                </p>
                                                <Badge variant={colorMap[voucher.voucher_type] || 'default'}>
                                                    {voucher.voucher_type}
                                                </Badge>
                                            </div>
                                        }
                                    />
                                </Link>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* FAB */}
            <div className="fixed bottom-20 md:bottom-6 right-6 z-50">
                <Fab icon={<Plus size={24} />} />
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ledgerApi } from '@/lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Search, Plus, Wallet, CreditCard, Building2, Banknote } from 'lucide-react';
import { Card, StatCard, Chip, Badge, Input, ListItem, Avatar, Fab, Spinner, EmptyState } from '@/components/ui/GlassUI';

export default function LedgersPage() {
    const { selectedCompany } = useAuth() as any;
    const [searchParams] = useSearchParams();
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');
    const [stats, setStats] = useState({ total: 0, debit: 0, credit: 0, count: 0 });

    const groupFilters = [
        { key: 'all', label: 'All', icon: <Users size={14} /> },
        { key: 'Sundry Debtors', label: 'Debtors', icon: <Wallet size={14} /> },
        { key: 'Sundry Creditors', label: 'Creditors', icon: <CreditCard size={14} /> },
        { key: 'Bank Accounts', label: 'Banks', icon: <Building2 size={14} /> },
        { key: 'Cash-in-Hand', label: 'Cash', icon: <Banknote size={14} /> },
    ];

    useEffect(() => {
        if (selectedCompany) loadLedgers();
    }, [selectedCompany, selectedGroup]);

    const loadLedgers = async () => {
        setLoading(true);
        const { data } = await ledgerApi.list(
            selectedCompany.id,
            selectedGroup !== 'all' ? selectedGroup : null
        );
        setLedgers(data || []);

        const all = data || [];
        const debitTotal = all.filter((l: any) => l.closing_balance > 0).reduce((s: number, l: any) => s + l.closing_balance, 0);
        const creditTotal = all.filter((l: any) => l.closing_balance < 0).reduce((s: number, l: any) => s + Math.abs(l.closing_balance), 0);

        setStats({
            total: debitTotal - creditTotal,
            debit: debitTotal,
            credit: creditTotal,
            count: all.length
        });

        setLoading(false);
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)} Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)} L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const filteredLedgers = ledgers.filter((l: any) =>
        l.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[var(--on-surface)]">Parties</h1>
                <p className="text-[var(--on-surface-variant)] mt-1">
                    {stats.count} parties • Net: <span className="font-semibold text-[var(--on-surface)]">{formatCurrency(stats.total)}</span>
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
                <StatCard
                    title="Receivable"
                    value={formatCurrency(stats.debit)}
                    icon={<Wallet size={20} />}
                    color="success"
                />
                <StatCard
                    title="Payable"
                    value={formatCurrency(stats.credit)}
                    icon={<CreditCard size={20} />}
                    color="error"
                />
            </div>

            {/* Group Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {groupFilters.map((filter) => (
                    <Chip
                        key={filter.key}
                        selected={selectedGroup === filter.key}
                        onClick={() => setSelectedGroup(filter.key)}
                        icon={filter.icon}
                    >
                        {filter.label}
                    </Chip>
                ))}
            </div>

            {/* Search */}
            <Input
                placeholder="Search party name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search size={18} />}
            />

            {/* Ledger List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" />
                </div>
            ) : filteredLedgers.length === 0 ? (
                <EmptyState
                    icon={<Users size={48} />}
                    title="No parties found"
                    description="Try adjusting your filters"
                />
            ) : (
                <Card padding="none">
                    <div className="divide-y divide-[var(--border)]">
                        {filteredLedgers.map((ledger: any) => {
                            const isDebit = ledger.closing_balance > 0;
                            const balance = Math.abs(ledger.closing_balance || 0);

                            return (
                                <Link key={ledger.id} to={`/ledgers/${ledger.id}`}>
                                    <ListItem
                                        title={ledger.name}
                                        subtitle={ledger.parent_group || 'General'}
                                        leading={
                                            <Avatar
                                                name={ledger.name}
                                                color={isDebit ? 'success' : 'error'}
                                            />
                                        }
                                        trailing={
                                            <div className="text-right">
                                                <p className={`font-semibold ${isDebit ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
                                                    {formatCurrency(balance)}
                                                </p>
                                                <Badge variant={isDebit ? 'success' : 'error'}>
                                                    {isDebit ? 'Receivable' : 'Payable'}
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

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/insforge';
import {
    UserX, Search, Filter, Calendar, TrendingDown, AlertTriangle,
    MessageCircle, Mail, Phone, Share2, Loader2, ChevronRight,
    IndianRupee, Clock, ArrowUpRight, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './InactiveCustomersPage.css';

interface InactiveCustomer {
    id: string;
    name: string;
    current_balance: number;
    lastTransactionDate: string | null;
    daysSinceLastTransaction: number;
    totalTransactions: number;
    totalValue: number;
    email?: string;
    phone?: string;
}

export default function InactiveCustomersPage() {
    const { selectedCompany } = useAuth() as any;
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<InactiveCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [inactiveDays, setInactiveDays] = useState(30);
    const [sortBy, setSortBy] = useState<'days' | 'value' | 'name'>('days');

    useEffect(() => {
        if (selectedCompany?.id) loadInactiveCustomers();
    }, [selectedCompany, inactiveDays]);

    const loadInactiveCustomers = async () => {
        setLoading(true);
        try {
            // Get all sundry debtors
            const { data: ledgers } = await supabase
                .from('ledgers')
                .select('*')
                .eq('company_id', selectedCompany.id)
                .in('parent', ['Sundry Debtors', 'sundry debtors', 'SUNDRY DEBTORS']);

            if (!ledgers) return;

            // Get all sales vouchers for this company
            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('party_name, voucher_date, total_amount, grand_total')
                .eq('company_id', selectedCompany.id)
                .eq('is_deleted', false)
                .in('voucher_type', ['Sales', 'Receipt']).limit(50000);

            const now = new Date();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

            const inactiveList: InactiveCustomer[] = [];

            for (const ledger of ledgers) {
                const partyVouchers = (vouchers || []).filter(v => v.party_name === ledger.name);
                const sortedByDate = partyVouchers.sort((a, b) =>
                    new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime()
                );

                const lastDate = sortedByDate[0]?.voucher_date || null;
                const lastDateObj = lastDate ? new Date(lastDate) : new Date(0);
                const daysSince = Math.floor((now.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));

                if (!lastDate || lastDateObj < cutoffDate) {
                    const totalValue = partyVouchers.reduce((sum, v) =>
                        sum + Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0), 0
                    );

                    inactiveList.push({
                        id: ledger.id,
                        name: ledger.name,
                        current_balance: ledger.current_balance || 0,
                        lastTransactionDate: lastDate,
                        daysSinceLastTransaction: lastDate ? daysSince : 999,
                        totalTransactions: partyVouchers.length,
                        totalValue,
                        email: ledger.email,
                        phone: ledger.phone
                    });
                }
            }

            setCustomers(inactiveList);
        } catch (err) {
            toast.error('Failed to load inactive customers');
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        let result = customers;
        if (searchQuery) {
            result = result.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        if (sortBy === 'days') {
            result = [...result].sort((a, b) => b.daysSinceLastTransaction - a.daysSinceLastTransaction);
        } else if (sortBy === 'value') {
            result = [...result].sort((a, b) => b.totalValue - a.totalValue);
        } else {
            result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        }
        return result;
    }, [customers, searchQuery, sortBy]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount));

    const getDaysColor = (days: number) => {
        if (days > 180) return 'text-red-400 bg-red-500/10';
        if (days > 90) return 'text-amber-400 bg-amber-500/10';
        return 'text-yellow-400 bg-yellow-500/10';
    };

    const sendReEngagement = (customer: InactiveCustomer, channel: 'whatsapp' | 'email') => {
        const companyName = selectedCompany?.name || 'हमारी टीम';
        const message = `नमस्ते ${customer.name} जी 🙏\n\nआशा है आप और आपका परिवार कुशल-मंगल होंगे। काफी समय से आपसे बात नहीं हुई, तो सोचा आपका हाल-चाल पूछ लें।\n\nआपका भरोसा और साथ हमारे लिए बहुत मायने रखता है। आपकी किसी भी जरूरत में हम खुशी से आपकी सेवा के लिए तैयार हैं। जब भी समय मिले, हमें जरूर याद कीजिएगा।\n\nसस्नेह,\n${companyName}`;

        if (channel === 'whatsapp') {
            const phone = customer.phone?.replace(/[^0-9]/g, '') || '';
            // Use an HTTPS share link so browsers without the WhatsApp app never open a blank custom-protocol tab.
            const recipient = phone ? `91${phone}` : '';
            const params = new URLSearchParams({ text: message });
            const url = `https://wa.me/${recipient}?${params.toString()}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            const subject = `${customer.name} जी, आपका हाल-चाल जानना चाहेंगे`;
            window.open(`mailto:${customer.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
        }
        toast.success('संदेश तैयार है। कृपया खोलकर भेजें।');
    };

    const totalLostRevenue = useMemo(() =>
        filtered.reduce((sum, c) => sum + c.totalValue, 0),
        [filtered]
    );

    return (
        <div className="inactive-page">
            <HeaderPortal type="title"><div className="inactive-header-title"><button onClick={() => navigate('/reports')} aria-label="Back to reports"><ArrowLeft size={18}/></button><h1>Inactive Customers</h1></div></HeaderPortal>
            <div className="inactive-intro"><span>CUSTOMER ACTIVITY</span><p>Find and re-engage customers who haven't transacted recently</p></div>

            {/* Stats */}
            <div className="inactive-stats">
                <div className="inactive-stat">
                    <div className="flex items-center gap-2 mb-2">
                        <UserX className="w-4 h-4 text-red-400" />
                        <span className="text-xs text-[var(--text-muted)]">Inactive</span>
                    </div>
                    <p className="text-xl font-bold text-red-400">{filtered.length}</p>
                </div>
                <div className="inactive-stat">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-[var(--text-muted)]">Lost Revenue</span>
                    </div>
                    <p className="text-lg font-bold text-amber-400">{formatCurrency(totalLostRevenue)}</p>
                </div>
                <div className="inactive-stat">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-[var(--text-muted)]">Period</span>
                    </div>
                    <p className="text-xl font-bold text-blue-400">{inactiveDays}d</p>
                </div>
            </div>

            {/* Filters */}
            <div className="inactive-filters">
                <div className="relative inactive-search">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search customers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)] placeholder-[var(--text-muted)] focus:border-red-500/50 focus:outline-none"
                    />
                </div>
                <select
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(Number(e.target.value))}
                    className="px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                >
                    <option value={30}>30 Days Inactive</option>
                    <option value={60}>60 Days Inactive</option>
                    <option value={90}>90 Days Inactive</option>
                    <option value={180}>180 Days Inactive</option>
                    <option value={365}>1 Year Inactive</option>
                </select>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--on-surface)]"
                >
                    <option value="days">Sort by Days</option>
                    <option value="value">Sort by Value</option>
                    <option value="name">Sort by Name</option>
                </select>
            </div>

            {/* Customer List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <Users className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--on-surface)]">All Active!</h3>
                    <p className="text-sm text-[var(--text-muted)]">All customers are actively transacting</p>
                </div>
            ) : (
                <div className="inactive-list">
                    {filtered.map((customer) => (
                        <div
                            key={customer.id}
                            className="inactive-customer"
                        >
                            <div className="inactive-customer-body">
                                <div className="inactive-customer-top">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-[var(--on-surface)] truncate">{customer.name}</h3>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getDaysColor(customer.daysSinceLastTransaction)}`}>
                                                {customer.daysSinceLastTransaction > 900 ? 'Never transacted' : `${customer.daysSinceLastTransaction} days inactive`}
                                            </span>
                                            <span className="text-xs text-[var(--text-muted)]">
                                                {customer.totalTransactions} transactions
                                            </span>
                                        </div>
                                    </div>
                                    <div className="inactive-customer-amount">
                                        <p className="text-sm font-bold text-[var(--on-surface)]">{formatCurrency(customer.totalValue)}</p>
                                        <p className="text-xs text-[var(--text-muted)]">total business</p>
                                        {customer.current_balance > 0 && (
                                            <p className="text-xs text-red-400 mt-1">
                                                Outstanding: {formatCurrency(customer.current_balance)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {customer.lastTransactionDate && (
                                    <p className="text-xs text-[var(--text-muted)] mt-1">
                                        Last: {new Date(customer.lastTransactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                )}

                                {/* Re-engage Actions */}
                                <div className="flex items-center gap-2 mt-3">
                                    <button
                                        onClick={() => sendReEngagement(customer, 'whatsapp')}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs hover:bg-green-500/20 transition-all"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" /> Re-engage
                                    </button>
                                    <button
                                        onClick={() => sendReEngagement(customer, 'email')}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs hover:bg-blue-500/20 transition-all"
                                    >
                                        <Mail className="w-3.5 h-3.5" /> Email
                                    </button>
                                    {customer.phone && (
                                        <a
                                            href={`tel:${customer.phone}`}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg text-xs hover:bg-purple-500/20 transition-all"
                                        >
                                            <Phone className="w-3.5 h-3.5" /> Call
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


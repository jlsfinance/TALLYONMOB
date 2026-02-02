import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Phone, Mail, MapPin, FileText, Receipt, MessageCircle } from 'lucide-react';
import { GlassCard, MetricCard } from '@/components/ui/GlassUI';
import { format } from 'date-fns';

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth() as any;
    const [ledger, setLedger] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'transactions' | 'info'>('transactions');

    useEffect(() => {
        if (id && selectedCompany) loadLedgerDetails();
    }, [id, selectedCompany]);

    const loadLedgerDetails = async () => {
        setLoading(true);
        try {
            const { data: ledgerData } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', id)
                .single();

            setLedger(ledgerData);

            if (ledgerData) {
                const { data: voucherData } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('company_id', selectedCompany.id)
                    .eq('party_name', ledgerData.name)
                    .order('voucher_date', { ascending: false })
                    .limit(50);

                setTransactions(voucherData || []);
            }
        } catch (error) {
            console.error('Error loading ledger:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(absAmount);
    };

    const handleWhatsApp = () => {
        if (ledger?.phone) {
            const message = `Hello ${ledger.name}, your outstanding balance is ${formatCurrency(ledger.closing_balance)}.`;
            window.open(`https://wa.me/91${ledger.phone}?text=${encodeURIComponent(message)}`, '_blank');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-500">Loading ledger details...</p>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="text-center py-20 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-medium">Ledger not found</p>
                <button onClick={() => navigate('/ledgers')} className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10">
                    ← Back to Ledgers
                </button>
            </div>
        );
    }

    const isDebit = ledger.closing_balance > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <button onClick={() => navigate('/ledgers')} className="p-2 rounded-xl bg-[#121214] border border-white/10 text-gray-400 hover:text-white">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold border ${isDebit ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                            {ledger.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{ledger.name}</h1>
                            <p className="text-gray-500">{ledger.parent_group || 'General'}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`rounded-2xl p-5 border ${isDebit ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    <p className={`text-sm ${isDebit ? 'text-emerald-400' : 'text-red-400'}`}>Closing Balance</p>
                    <p className={`text-2xl font-bold mt-1 ${isDebit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(ledger.closing_balance)}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold mt-2 inline-block border ${isDebit ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        {isDebit ? 'RECEIVABLE' : 'PAYABLE'}
                    </span>
                </div>
                <MetricCard title="Transactions" value={transactions.length.toString()} icon={<Receipt size={20} />} color="blue" />
                <GlassCard className="p-4">
                    <p className="text-sm text-gray-400">Opening Balance</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCurrency(ledger.opening_balance)}</p>
                </GlassCard>
                <GlassCard className="p-4">
                    <p className="text-sm text-gray-400">Credit Limit</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCurrency(ledger.credit_limit || 0)}</p>
                </GlassCard>
            </div>

            {/* Contact Quick Actions */}
            <div className="flex gap-3">
                {ledger.phone && (
                    <a href={`tel:${ledger.phone}`} className="flex items-center gap-2 px-4 py-2.5 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-[#1C1C1F] transition-colors">
                        <Phone size={16} />
                        <span className="text-sm">{ledger.phone}</span>
                    </a>
                )}
                {ledger.email && (
                    <a href={`mailto:${ledger.email}`} className="flex items-center gap-2 px-4 py-2.5 bg-[#121214] border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-[#1C1C1F] transition-colors">
                        <Mail size={16} />
                        <span className="text-sm">{ledger.email}</span>
                    </a>
                )}
                {ledger.phone && (
                    <button onClick={handleWhatsApp} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                        <MessageCircle size={16} />
                        <span className="text-sm">WhatsApp</span>
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/5">
                <button
                    onClick={() => setActiveTab('transactions')}
                    className={`px-4 py-2.5 text-sm font-medium transition-all ${activeTab === 'transactions' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-white'}`}
                >
                    Transactions
                </button>
                <button
                    onClick={() => setActiveTab('info')}
                    className={`px-4 py-2.5 text-sm font-medium transition-all ${activeTab === 'info' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-white'}`}
                >
                    Info
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'transactions' && (
                <div className="space-y-3">
                    {transactions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Receipt size={48} className="mx-auto mb-4 opacity-30" />
                            <p>No transactions found</p>
                        </div>
                    ) : (
                        transactions.map((txn: any) => {
                            const isCredit = ['Receipt', 'Sales', 'Credit Note'].includes(txn.voucher_type);
                            return (
                                <Link key={txn.id} to={`/vouchers/${txn.id}`} className="block">
                                    <GlassCard className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isCredit ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                                                <Receipt size={18} />
                                            </div>
                                            <div>
                                                <p className="font-medium text-white">{txn.voucher_type}</p>
                                                <p className="text-xs text-gray-500">#{txn.voucher_number} • {format(new Date(txn.voucher_date), 'dd MMM yyyy')}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold font-mono ${isCredit ? 'text-emerald-400' : 'text-orange-400'}`}>
                                                {isCredit ? '+' : '-'}{formatCurrency(txn.total_amount)}
                                            </p>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${isCredit ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                                                {txn.voucher_type}
                                            </span>
                                        </div>
                                    </GlassCard>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}

            {activeTab === 'info' && (
                <GlassCard className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-1">GSTIN</p>
                            <p className="text-white font-mono">{ledger.gstin || 'Not Available'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-1">PAN</p>
                            <p className="text-white font-mono">{ledger.pan || 'Not Available'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Credit Days</p>
                            <p className="text-white">{ledger.credit_days || 0} days</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-1">State</p>
                            <p className="text-white">{ledger.state || 'Not Available'}</p>
                        </div>
                        {ledger.address && (
                            <div className="md:col-span-2">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Address</p>
                                <p className="text-white flex items-start gap-2">
                                    <MapPin size={16} className="text-gray-500 mt-0.5 shrink-0" />
                                    {ledger.address}
                                </p>
                            </div>
                        )}
                    </div>
                </GlassCard>
            )}

            {/* Quick Actions */}
            <div className="flex gap-3">
                <Link
                    to={`/ledger-statement/${id}`}
                    className="flex-1 px-4 py-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-center font-medium hover:bg-blue-500/20 transition-colors"
                >
                    View Statement
                </Link>
                <Link
                    to={`/aging-report?party=${ledger.name}`}
                    className="flex-1 px-4 py-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl text-center font-medium hover:bg-purple-500/20 transition-colors"
                >
                    Aging Analysis
                </Link>
            </div>
        </div>
    );
}

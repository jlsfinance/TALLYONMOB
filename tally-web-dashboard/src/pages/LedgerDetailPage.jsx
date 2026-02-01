import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function LedgerDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { selectedCompany } = useAuth();
    const [ledger, setLedger] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('transactions');

    useEffect(() => {
        if (id && selectedCompany) loadLedgerDetails();
    }, [id, selectedCompany]);

    const loadLedgerDetails = async () => {
        setLoading(true);
        try {
            // Get ledger details
            const { data: ledgerData } = await supabase
                .from('ledgers')
                .select('*')
                .eq('id', id)
                .single();

            setLedger(ledgerData);

            // Get transactions (vouchers where this ledger is the party)
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

    const formatCurrency = (amount) => {
        const absAmount = Math.abs(amount || 0);
        if (absAmount >= 10000000) return `₹${(absAmount / 10000000).toFixed(2)}Cr`;
        if (absAmount >= 100000) return `₹${(absAmount / 100000).toFixed(2)}L`;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absAmount);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!ledger) {
        return (
            <div className="text-center py-12">
                <span className="text-5xl">❌</span>
                <p className="mt-4 text-gray-600">Ledger not found</p>
                <button onClick={() => navigate('/ledgers')} className="mt-4 text-indigo-600 hover:underline">
                    ← Back to Ledgers
                </button>
            </div>
        );
    }

    const isDebit = ledger.closing_balance > 0;

    return (
        <div className="space-y-4 pb-20 lg:pb-0">
            {/* Back Button */}
            <button
                onClick={() => navigate('/ledgers')}
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition-colors"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Parties
            </button>

            {/* Header Card */}
            <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>

                <div className="relative z-10">
                    <div className="flex items-start gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${isDebit ? 'bg-emerald-500/30' : 'bg-rose-500/30'
                            }`}>
                            {ledger.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-white text-xl font-bold truncate">{ledger.name}</h1>
                            <p className="text-white/60 text-sm">{ledger.parent_group || 'General'}</p>
                        </div>
                    </div>

                    {/* Balance */}
                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-white/60 text-xs">Closing Balance</p>
                            <p className={`text-2xl font-bold ${isDebit ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {formatCurrency(ledger.closing_balance)}
                            </p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDebit ? 'bg-emerald-500/30 text-emerald-200' : 'bg-rose-500/30 text-rose-200'
                                }`}>
                                {isDebit ? 'Receivable' : 'Payable'}
                            </span>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4">
                            <p className="text-white/60 text-xs">Opening Balance</p>
                            <p className="text-xl font-bold text-white">
                                {formatCurrency(ledger.opening_balance)}
                            </p>
                        </div>
                    </div>

                    {/* Contact Actions */}
                    <div className="flex gap-2 mt-4">
                        {ledger.phone && (
                            <a
                                href={`tel:${ledger.phone}`}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
                            >
                                📞 Call
                            </a>
                        )}
                        {ledger.phone && (
                            <a
                                href={`https://wa.me/${ledger.phone?.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/40 text-white rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
                            >
                                💬 WhatsApp
                            </a>
                        )}
                        {ledger.email && (
                            <a
                                href={`mailto:${ledger.email}`}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
                            >
                                ✉️ Email
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* Contact Info Card */}
            {(ledger.phone || ledger.email || ledger.gstin || ledger.address) && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-800 mb-3">Contact Details</h3>
                    <div className="space-y-2 text-sm">
                        {ledger.phone && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <span>📞</span>
                                <span>{ledger.phone}</span>
                            </div>
                        )}
                        {ledger.email && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <span>✉️</span>
                                <span>{ledger.email}</span>
                            </div>
                        )}
                        {ledger.gstin && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <span>🏢</span>
                                <span>GSTIN: {ledger.gstin}</span>
                            </div>
                        )}
                        {ledger.pan && (
                            <div className="flex items-center gap-3 text-gray-600">
                                <span>🆔</span>
                                <span>PAN: {ledger.pan}</span>
                            </div>
                        )}
                        {ledger.address && (
                            <div className="flex items-start gap-3 text-gray-600">
                                <span>📍</span>
                                <span>{ledger.address}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                <button
                    onClick={() => setActiveTab('transactions')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'transactions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'
                        }`}
                >
                    Transactions
                </button>
                <button
                    onClick={() => setActiveTab('statement')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'statement' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600'
                        }`}
                >
                    Statement
                </button>
            </div>

            {/* Transactions List */}
            <div className="space-y-3">
                {transactions.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <span className="text-5xl">📭</span>
                        <p className="mt-4 font-medium">No transactions found</p>
                    </div>
                ) : (
                    transactions.map(txn => (
                        <Link
                            key={txn.voucher_id}
                            to={`/vouchers/${encodeURIComponent(txn.voucher_id)}`}
                            className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-semibold text-gray-800">{txn.voucher_type}</p>
                                    <p className="text-xs text-gray-500">
                                        #{txn.voucher_number} • {formatDate(txn.voucher_date)}
                                    </p>
                                </div>
                                <div className="text-right flex items-center gap-2">
                                    <div>
                                        <p className={`font-bold ${txn.voucher_type === 'Receipt' ? 'text-emerald-600' :
                                            txn.voucher_type === 'Payment' ? 'text-rose-600' : 'text-gray-800'
                                            }`}>
                                            {formatCurrency(txn.total_amount)}
                                        </p>
                                        {(() => {
                                            const partyEntry = txn.ledger_entries?.find(l =>
                                                l.ledger_name?.toLowerCase() === ledger.name?.toLowerCase()
                                            );
                                            const isDr = partyEntry ? partyEntry.is_debit : (txn.voucher_type === 'Payment' || txn.voucher_type === 'Sales');

                                            return (
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full ${isDr ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {isDr ? 'Dr' : 'Cr'}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </div>
                            {txn.narration && (
                                <p className="text-xs text-gray-400 mt-2 truncate">{txn.narration}</p>
                            )}
                        </Link>
                    ))
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
                <Link
                    to={`/ledger-statement/${id}`}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl py-4 font-semibold shadow-lg hover:shadow-xl transition-all text-center"
                >
                    📋 View Statement
                </Link>
                <button
                    onClick={() => {
                        const msg = `Payment Reminder for ${ledger?.name}\n\nOutstanding: ${formatCurrency(ledger?.closing_balance)}\n\nPlease arrange payment.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl py-4 font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                    📤 Send Reminder
                </button>
            </div>
        </div>
    );
}

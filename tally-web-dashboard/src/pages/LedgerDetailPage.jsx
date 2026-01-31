import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi, reportsApi } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function LedgerDetailPage() {
    const { id } = useParams();
    const { selectedCompany } = useAuth();
    const [ledger, setLedger] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 3)), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    useEffect(() => {
        if (id) {
            loadLedger();
        }
    }, [id]);

    useEffect(() => {
        if (ledger && selectedCompany) {
            loadTransactions();
        }
    }, [ledger, fromDate, toDate]);

    const loadLedger = async () => {
        const { data } = await ledgerApi.getById(id);
        setLedger(data);
        setLoading(false);
    };

    const loadTransactions = async () => {
        const { data } = await reportsApi.getLedgerStatement(
            selectedCompany.id,
            ledger.name,
            fromDate,
            toDate
        );
        setTransactions(data || []);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(Math.abs(amount || 0));
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // Calculate running balance
    let runningBalance = ledger?.opening_balance || 0;
    const transactionsWithBalance = transactions.map(t => {
        runningBalance += t.amount || 0;
        return { ...t, runningBalance };
    });

    const handleShare = () => {
        const text = `Ledger: ${ledger?.name}\nBalance: ${formatCurrency(ledger?.closing_balance)}\nAs of: ${formatDate(new Date())}`;
        if (navigator.share) {
            navigator.share({ title: 'Ledger Details', text });
        } else {
            navigator.clipboard.writeText(text);
            alert('Copied to clipboard!');
        }
    };

    if (loading) {
        return (
            <div className="animate-pulse space-y-6">
                <div className="h-8 bg-gray-200 rounded w-48"></div>
                <div className="bg-white rounded-xl p-6 shadow">
                    <div className="h-6 bg-gray-200 rounded w-64 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                </div>
            </div>
        );
    }

    if (!ledger) {
        return <div className="p-8 text-center text-gray-500">Ledger not found</div>;
    }

    return (
        <div className="space-y-6">
            {/* Back Button */}
            <Link to="/ledgers" className="inline-flex items-center text-blue-600 hover:text-blue-800">
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Ledgers
            </Link>

            {/* Ledger Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">{ledger.name}</h1>
                        <p className="text-blue-200 mt-1">{ledger.parent_group}</p>
                        <div className="flex items-center gap-4 mt-4 text-sm">
                            {ledger.phone && (
                                <a href={`tel:${ledger.phone}`} className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
                                    📞 {ledger.phone}
                                </a>
                            )}
                            {ledger.email && (
                                <a href={`mailto:${ledger.email}`} className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
                                    ✉️ {ledger.email}
                                </a>
                            )}
                            {ledger.gstin && (
                                <span className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
                                    GST: {ledger.gstin}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-blue-200 text-sm">Current Balance</p>
                        <p className="text-3xl font-bold">{formatCurrency(ledger.closing_balance)}</p>
                        <p className="text-blue-200">{ledger.closing_balance >= 0 ? 'Debit' : 'Credit'}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow hover:shadow-md transition"
                >
                    <span>📤</span> Share
                </button>
                {ledger.phone && (
                    <a
                        href={`https://wa.me/${ledger.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition"
                    >
                        <span>💬</span> WhatsApp
                    </a>
                )}
            </div>

            {/* Period Filter */}
            <div className="bg-white rounded-xl p-4 shadow flex flex-col md:flex-row items-center gap-4">
                <span className="text-gray-600 font-medium">Period:</span>
                <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-500">to</span>
                <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2 ml-auto">
                    <button
                        onClick={() => {
                            setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                            setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                        }}
                        className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                        This Month
                    </button>
                    <button
                        onClick={() => {
                            setFromDate(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
                            setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                        }}
                        className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                        Last 3 Months
                    </button>
                </div>
            </div>

            {/* Balance Summary */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 shadow">
                    <p className="text-gray-500 text-sm">Opening Balance</p>
                    <p className="text-xl font-bold text-gray-800">{formatCurrency(ledger.opening_balance)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow">
                    <p className="text-gray-500 text-sm">Transactions</p>
                    <p className="text-xl font-bold text-gray-800">{transactions.length}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow">
                    <p className="text-gray-500 text-sm">Closing Balance</p>
                    <p className={`text-xl font-bold ${ledger.closing_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(ledger.closing_balance)}
                    </p>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800">Transactions</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Voucher</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Debit</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Credit</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {transactionsWithBalance.map((t, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm">{formatDate(t.vch_date)}</td>
                                    <td className="px-4 py-3 text-sm font-medium">{t.voucher_number || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                                            {t.voucher_type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-green-600">
                                        {t.amount > 0 ? formatCurrency(t.amount) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-red-600">
                                        {t.amount < 0 ? formatCurrency(t.amount) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-medium">
                                        {formatCurrency(t.runningBalance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {transactions.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No transactions in selected period
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

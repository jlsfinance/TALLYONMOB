import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { purchasesApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function PurchasesPage() {
    const { selectedCompany } = useAuth();
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    // Initialize dates based on company settings or session
    useEffect(() => {
        if (!selectedCompany) return;

        const sessionKey = `purchases_date_range_${selectedCompany.id}`;
        const saved = sessionStorage.getItem(sessionKey);

        if (saved) {
            try {
                const { from, to } = JSON.parse(saved);
                setFromDate(from);
                setToDate(to);
            } catch (e) {
                setDefaultDates();
            }
        } else {
            setDefaultDates();
        }

        function setDefaultDates() {
            let start;
            if (selectedCompany.books_from) {
                start = new Date(selectedCompany.books_from);
            } else {
                // Calculate FY Start (1st April)
                const now = new Date();
                if (now.getMonth() < 3) { // Jan-Mar
                    start = new Date(now.getFullYear() - 1, 3, 1);
                } else {
                    start = new Date(now.getFullYear(), 3, 1);
                }
            }

            setFromDate(format(start, 'yyyy-MM-dd'));
            setToDate(format(new Date(), 'yyyy-MM-dd'));
        }
    }, [selectedCompany]);

    useEffect(() => {
        if (selectedCompany && fromDate && toDate) {
            loadPurchases();
            // Save to session
            const sessionKey = `purchases_date_range_${selectedCompany.id}`;
            sessionStorage.setItem(sessionKey, JSON.stringify({ from: fromDate, to: toDate }));
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadPurchases = async () => {
        if (!fromDate || !toDate) return;
        setLoading(true);
        const { data } = await purchasesApi.list(selectedCompany.id, { fromDate, toDate });
        setPurchases(data || []);

        const total = data?.reduce((s, p) => s + (p.net_amount || 0), 0) || 0;
        setStats({
            total,
            count: data?.length || 0,
            avgValue: data?.length ? Math.round(total / data.length) : 0
        });

        setLoading(false);
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
            month: 'short'
        });
    };

    const filteredPurchases = purchases.filter(p =>
        p.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-4 pb-20 lg:pb-0">
            {/* Header with Stats */}
            <div className="bg-gradient-to-br from-purple-600 via-violet-700 to-indigo-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-pink-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-gradient-to-br from-violet-400/20 to-indigo-400/20 rounded-full blur-3xl"></div>

                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-white text-xl font-bold">Purchases</h1>
                            <p className="text-white/60 text-sm">{stats.count} bills</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="p-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </button>
                            <button className="p-2 bg-white/10 rounded-lg text-white hover:bg-white/20 transition">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-white font-bold text-lg">{formatCurrency(stats.total)}</p>
                            <p className="text-white/40 text-[10px]">Total Purchase</p>
                        </div>
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-pink-300 font-bold text-lg">{stats.count}</p>
                            <p className="text-white/40 text-[10px]">Bills</p>
                        </div>
                        <div className="text-center p-3 bg-white/10 rounded-xl">
                            <p className="text-violet-300 font-bold text-lg">{formatCurrency(stats.avgValue)}</p>
                            <p className="text-white/40 text-[10px]">Avg Value</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Date Filter */}
            <div className="flex gap-2 items-center bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
                <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
            </div>

            {/* Search */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search party or invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>

            {/* Purchase List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
                            <div className="flex gap-3">
                                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredPurchases.map(purchase => (
                        <Link
                            key={purchase.id}
                            to={`/purchases/${purchase.id}`}
                            className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:border-purple-200 transition-all group"
                        >
                            <div className="flex gap-3 items-start">
                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center text-white font-bold">
                                    {purchase.party_ledger_name?.charAt(0)?.toUpperCase() || '₹'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
                                                {purchase.party_ledger_name || 'Cash Purchase'}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                #{purchase.invoice_number} • {formatDate(purchase.invoice_date)}
                                            </p>
                                        </div>
                                        <div className="text-right ml-2">
                                            <p className="font-bold text-purple-600">
                                                {formatCurrency(purchase.net_amount)}
                                            </p>
                                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                                PURCHASE
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tax Breakdown */}
                                    {(purchase.cgst_amount || purchase.sgst_amount || purchase.igst_amount) && (
                                        <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
                                            {purchase.cgst_amount > 0 && <span>CGST: ₹{purchase.cgst_amount?.toFixed(0)}</span>}
                                            {purchase.sgst_amount > 0 && <span>SGST: ₹{purchase.sgst_amount?.toFixed(0)}</span>}
                                            {purchase.igst_amount > 0 && <span>IGST: ₹{purchase.igst_amount?.toFixed(0)}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="flex justify-end gap-3 mt-3 pt-3 border-t border-gray-50">
                                <button
                                    onClick={(e) => { e.preventDefault(); }}
                                    className="p-2 hover:bg-green-50 rounded-lg text-green-600 transition text-sm"
                                >
                                    💬 WhatsApp
                                </button>
                                <button
                                    onClick={(e) => { e.preventDefault(); }}
                                    className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition text-sm"
                                >
                                    🖨️ Print
                                </button>
                                <button
                                    onClick={(e) => { e.preventDefault(); }}
                                    className="p-2 hover:bg-purple-50 rounded-lg text-purple-600 transition text-sm"
                                >
                                    📤 Share
                                </button>
                            </div>
                        </Link>
                    ))}
                    {filteredPurchases.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <span className="text-5xl">🛒</span>
                            <p className="mt-4 font-medium">No purchases found</p>
                            <p className="text-sm">Try adjusting the date range</p>
                        </div>
                    )}
                </div>
            )}

            {/* Floating Action Button */}
            <button className="fixed bottom-24 lg:bottom-8 right-6 w-14 h-14 bg-gradient-to-br from-purple-500 to-violet-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform z-40">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
}

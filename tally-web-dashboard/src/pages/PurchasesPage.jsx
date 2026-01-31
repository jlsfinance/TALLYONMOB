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
    const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    useEffect(() => {
        if (selectedCompany) {
            loadPurchases();
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadPurchases = async () => {
        setLoading(true);
        const { data } = await purchasesApi.list(selectedCompany.id, { fromDate, toDate });
        setPurchases(data || []);
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const filteredPurchases = purchases.filter(p =>
        p.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalAmount = filteredPurchases.reduce((sum, p) => sum + (p.net_amount || 0), 0);

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Purchase Invoices</h1>
                    <p className="text-gray-500">View and manage purchases</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{filteredPurchases.length} invoices</span>
                    <span className="text-lg font-bold text-red-600">{formatCurrency(totalAmount)}</span>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by party or invoice number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2">
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
                </div>
            </div>

            {/* Quick Period Buttons */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={() => {
                        setFromDate(format(new Date(), 'yyyy-MM-dd'));
                        setToDate(format(new Date(), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1 text-sm bg-white rounded-lg shadow hover:bg-gray-50"
                >
                    Today
                </button>
                <button
                    onClick={() => {
                        setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                        setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1 text-sm bg-white rounded-lg shadow hover:bg-gray-50"
                >
                    This Month
                </button>
                <button
                    onClick={() => {
                        setFromDate(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                        setToDate(format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1 text-sm bg-white rounded-lg shadow hover:bg-gray-50"
                >
                    Last Month
                </button>
            </div>

            {/* Purchases List */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white rounded-xl p-4 shadow animate-pulse">
                            <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-32"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredPurchases.map(purchase => (
                                    <tr key={purchase.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm">{formatDate(purchase.invoice_date)}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-blue-600">{purchase.invoice_number || '-'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div>
                                                <p className="font-medium text-gray-800">{purchase.party_ledger_name}</p>
                                                {purchase.party_gstin && (
                                                    <p className="text-xs text-gray-500">GST: {purchase.party_gstin}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-bold text-red-600">{formatCurrency(purchase.net_amount)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50">
                                <tr>
                                    <td colSpan="3" className="px-4 py-3 text-right font-semibold text-gray-700">
                                        Total:
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-red-600 text-lg">
                                        {formatCurrency(totalAmount)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                        {filteredPurchases.length === 0 && (
                            <div className="p-8 text-center text-gray-500">
                                <div className="text-5xl mb-4">📥</div>
                                <p>No purchase invoices found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

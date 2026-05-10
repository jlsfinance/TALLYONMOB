import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { salesApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function SalesPage() {
    const { selectedCompany } = useAuth();
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const prevCompanyRef = useRef(null);

    useEffect(() => {
        if (selectedCompany) {
            // Only set loading=true if company changed (avoid flash on date change)
            const companyChanged = prevCompanyRef.current !== selectedCompany.id;
            prevCompanyRef.current = selectedCompany.id;
            loadSales(companyChanged);
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadSales = async (showFullLoader = true) => {
        if (showFullLoader) setLoading(true);
        const { data } = await salesApi.list(selectedCompany.id, { fromDate, toDate });
        setSales(data || []);
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

    const filteredSales = sales.filter(s =>
        s.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalAmount = filteredSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Sales Invoices</h1>
                    <p className="text-gray-500 text-sm">View and manage sales transactions</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{filteredSales.length} invoices</span>
                    <span className="text-lg font-bold text-green-600">{formatCurrency(totalAmount)}</span>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by party or invoice..."
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
                        className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <span className="text-gray-400 text-sm">to</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
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
                    className="px-3 py-1.5 text-sm bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100"
                >
                    Today
                </button>
                <button
                    onClick={() => {
                        setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                        setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1.5 text-sm bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100"
                >
                    This Month
                </button>
                <button
                    onClick={() => {
                        setFromDate(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                        setToDate(format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1.5 text-sm bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100"
                >
                    Last Month
                </button>
                <button
                    onClick={() => {
                        setFromDate(format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'));
                        setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-1.5 text-sm bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100"
                >
                    Last 3 Months
                </button>
            </div>

            {/* Sales List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="bg-white rounded-xl p-4 shadow animate-pulse">
                            <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
                            <div className="h-4 bg-gray-200 rounded w-32"></div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                        {filteredSales.map(sale => (
                            <Link
                                key={sale.id}
                                to={`/sales/${sale.id}`}
                                className="block bg-white rounded-xl p-4 shadow hover:shadow-md active:bg-gray-50 mobile-card"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 truncate">{sale.party_ledger_name}</p>
                                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                            <span>{formatDate(sale.invoice_date)}</span>
                                            {sale.invoice_number && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-blue-600 font-medium">#{sale.invoice_number}</span>
                                                </>
                                            )}
                                        </div>
                                        {sale.party_gstin && (
                                            <p className="text-xs text-gray-400 mt-1">GST: {sale.party_gstin}</p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-bold text-green-600 text-lg">{formatCurrency(sale.net_amount)}</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Party</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredSales.map(sale => (
                                        <tr key={sale.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm">{formatDate(sale.invoice_date)}</td>
                                            <td className="px-4 py-3">
                                                <span className="font-medium text-blue-600">{sale.invoice_number || '-'}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div>
                                                    <p className="font-medium text-gray-800">{sale.party_ledger_name}</p>
                                                    {sale.party_gstin && (
                                                        <p className="text-xs text-gray-500">GST: {sale.party_gstin}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-bold text-green-600">{formatCurrency(sale.net_amount)}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Link
                                                    to={`/sales/${sale.id}`}
                                                    className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
                                                >
                                                    View
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {filteredSales.length === 0 && (
                        <div className="bg-white rounded-xl p-8 shadow text-center text-gray-500">
                            <div className="text-5xl mb-4">📄</div>
                            <p>No sales invoices found</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

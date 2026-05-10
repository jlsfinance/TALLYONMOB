import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { purchasesApi } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function PurchasesPage() {
    const { selectedCompany } = useAuth();
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const prevCompanyRef = useRef(null);

    useEffect(() => {
        if (selectedCompany) {
            const companyChanged = prevCompanyRef.current !== selectedCompany.id;
            prevCompanyRef.current = selectedCompany.id;
            loadPurchases(companyChanged);
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadPurchases = async (showFullLoader = true) => {
        if (showFullLoader) setLoading(true);
        const { data } = await purchasesApi.list(selectedCompany.id, { fromDate, toDate });
        setPurchases(data || []);
        setLoading(false);
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
    const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const filteredPurchases = purchases.filter(p =>
        p.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const totalAmount = filteredPurchases.reduce((sum, p) => sum + (p.net_amount || 0), 0);

    if (!selectedCompany) return <div className="p-8 text-center text-gray-500">Please select a company first</div>;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Purchase Invoices</h1>
                    <p className="text-gray-500 text-sm">View and manage purchases</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{filteredPurchases.length} invoices</span>
                    <span className="text-lg font-bold text-red-600">{formatCurrency(totalAmount)}</span>
                </div>
            </div>

            <div className="bg-white rounded-xl p-3 sm:p-4 shadow space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4">
                <div className="flex-1">
                    <input type="text" placeholder="Search by party or invoice..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                    <span className="text-gray-400 text-sm">to</span>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
            </div>

            <div className="flex gap-2 flex-wrap">
                {[['Today', () => { setFromDate(format(new Date(), 'yyyy-MM-dd')); setToDate(format(new Date(), 'yyyy-MM-dd')); }],
                  ['This Month', () => { setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd')); }],
                  ['Last Month', () => { setFromDate(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')); setToDate(format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')); }]
                ].map(([label, fn]) => (
                    <button key={label} onClick={fn} className="px-3 py-1.5 text-sm bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100">{label}</button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl p-4 shadow animate-pulse"><div className="h-5 bg-gray-200 rounded w-48 mb-2" /><div className="h-4 bg-gray-200 rounded w-32" /></div>)}</div>
            ) : (
                <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                        {filteredPurchases.map(p => (
                            <div key={p.id} className="bg-white rounded-xl p-4 shadow mobile-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-800 truncate">{p.party_ledger_name}</p>
                                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                            <span>{formatDate(p.invoice_date)}</span>
                                            {p.invoice_number && <><span>•</span><span className="text-blue-600 font-medium">#{p.invoice_number}</span></>}
                                        </div>
                                        {p.party_gstin && <p className="text-xs text-gray-400 mt-1">GST: {p.party_gstin}</p>}
                                    </div>
                                    <p className="font-bold text-red-600 text-lg flex-shrink-0">{formatCurrency(p.net_amount)}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden">
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
                                    {filteredPurchases.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm">{formatDate(p.invoice_date)}</td>
                                            <td className="px-4 py-3"><span className="font-medium text-blue-600">{p.invoice_number || '-'}</span></td>
                                            <td className="px-4 py-3"><p className="font-medium text-gray-800">{p.party_ledger_name}</p>{p.party_gstin && <p className="text-xs text-gray-500">GST: {p.party_gstin}</p>}</td>
                                            <td className="px-4 py-3 text-right"><span className="font-bold text-red-600">{formatCurrency(p.net_amount)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50"><tr><td colSpan="3" className="px-4 py-3 text-right font-semibold text-gray-700">Total:</td><td className="px-4 py-3 text-right font-bold text-red-600 text-lg">{formatCurrency(totalAmount)}</td></tr></tfoot>
                            </table>
                        </div>
                    </div>

                    {filteredPurchases.length === 0 && (
                        <div className="bg-white rounded-xl p-8 shadow text-center text-gray-500"><div className="text-5xl mb-4">📥</div><p>No purchase invoices found</p></div>
                    )}
                </>
            )}
        </div>
    );
}

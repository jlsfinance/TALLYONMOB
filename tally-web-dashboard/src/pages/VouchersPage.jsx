import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { voucherApi } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function VouchersPage() {
    const { selectedCompany } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    const [voucherTypes, setVoucherTypes] = useState([]);
    const [selectedType, setSelectedType] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState('2024-04-01');
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const prevCompanyRef = useRef(null);

    useEffect(() => {
        if (selectedCompany) {
            const companyChanged = prevCompanyRef.current !== selectedCompany.id;
            prevCompanyRef.current = selectedCompany.id;
            loadData(companyChanged);
        }
    }, [selectedCompany, fromDate, toDate, selectedType]);

    const loadData = async (showFullLoader = true) => {
        if (showFullLoader) setLoading(true);
        const [voucherRes, typesRes] = await Promise.all([
            voucherApi.list(selectedCompany.id, { fromDate, toDate, type: selectedType }),
            voucherApi.getTypes(selectedCompany.id)
        ]);
        setVouchers(voucherRes.data || []);
        setVoucherTypes(typesRes.data || []);
        setLoading(false);
    };

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Math.abs(amount || 0));
    const formatDate = (date) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const getTypeColor = (type) => {
        const colors = { 'Sales': 'bg-green-100 text-green-700', 'Purchase': 'bg-red-100 text-red-700', 'Payment': 'bg-orange-100 text-orange-700', 'Receipt': 'bg-blue-100 text-blue-700', 'Journal': 'bg-purple-100 text-purple-700', 'Contra': 'bg-gray-100 text-gray-700' };
        return colors[type] || 'bg-gray-100 text-gray-700';
    };

    const handlePrint = () => {
        const printContent = document.getElementById('voucher-print-area');
        const win = window.open('', '', 'height=700,width=800');
        win.document.write('<html><head><title>Print Voucher</title>');
        win.document.write('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">');
        win.document.write('</head><body class="p-8">');
        win.document.write(printContent.innerHTML);
        win.document.write('</body></html>');
        win.document.close();
        win.print();
    };

    const filteredVouchers = vouchers.filter(v =>
        v.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const typeSummary = vouchers.reduce((acc, v) => {
        if (!acc[v.voucher_type]) acc[v.voucher_type] = { count: 0, amount: 0 };
        acc[v.voucher_type].count++;
        acc[v.voucher_type].amount += Math.abs(v.total_amount || 0);
        return acc;
    }, {});

    if (!selectedCompany) return <div className="p-8 text-center text-gray-500">Please select a company first</div>;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Vouchers</h1>
                <p className="text-gray-500 text-sm">All transactions and entries</p>
            </div>

            {/* Type Summary - scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Object.entries(typeSummary).map(([type, data]) => (
                    <button key={type} onClick={() => setSelectedType(selectedType === type ? '' : type)}
                        className={`flex-shrink-0 p-3 rounded-xl text-left min-w-[120px] sm:min-w-0 ${selectedType === type ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white shadow hover:shadow-md'}`}>
                        <p className="text-sm font-medium text-gray-600">{type}</p>
                        <p className="text-lg font-bold text-gray-800">{data.count}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(data.amount)}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4">
                <div className="flex-1">
                    <input type="text" placeholder="Search by party or voucher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                    <span className="text-gray-400 text-sm">to</span>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="">All Types</option>
                    {voucherTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {/* Voucher List */}
            {loading ? (
                <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl p-4 shadow animate-pulse"><div className="h-5 bg-gray-200 rounded w-48 mb-2" /><div className="h-4 bg-gray-200 rounded w-32" /></div>)}</div>
            ) : (
                <>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{filteredVouchers.length} vouchers</span>
                        {selectedType && <button onClick={() => setSelectedType('')} className="text-sm text-blue-600 hover:text-blue-800 active:text-blue-900">Clear Filter</button>}
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                        {filteredVouchers.map(v => (
                            <button key={v.id} onClick={() => setSelectedVoucher(v)} className="w-full text-left bg-white rounded-xl p-4 shadow active:bg-gray-50 mobile-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getTypeColor(v.voucher_type)}`}>{v.voucher_type}</span>
                                            <span className="text-xs text-gray-400">#{v.voucher_number || '-'}</span>
                                        </div>
                                        <p className="font-semibold text-gray-800 truncate">{v.party_name || 'No Party'}</p>
                                        <p className="text-sm text-gray-500 mt-0.5">{formatDate(v.voucher_date)}</p>
                                        {v.narration && <p className="text-xs text-gray-400 mt-1 truncate">{v.narration}</p>}
                                    </div>
                                    <p className={`font-bold text-lg flex-shrink-0 ${v.total_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(v.total_amount)}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Voucher</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Party</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredVouchers.map(v => (
                                        <tr key={v.id} onClick={() => setSelectedVoucher(v)} className="hover:bg-gray-50 cursor-pointer">
                                            <td className="px-4 py-3 text-sm">{formatDate(v.voucher_date)}</td>
                                            <td className="px-4 py-3 font-medium text-gray-800">{v.voucher_number || '-'}</td>
                                            <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(v.voucher_type)}`}>{v.voucher_type}</span></td>
                                            <td className="px-4 py-3"><p className="text-gray-800">{v.party_name || '-'}</p>{v.narration && <p className="text-xs text-gray-500 truncate max-w-xs">{v.narration}</p>}</td>
                                            <td className="px-4 py-3 text-right"><span className={`font-bold ${v.total_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(v.total_amount)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {filteredVouchers.length === 0 && <div className="bg-white rounded-xl p-8 shadow text-center text-gray-500"><div className="text-5xl mb-4">📝</div><p>No vouchers found</p></div>}
                </>
            )}

            {/* Voucher Details Modal - Mobile optimized */}
            {selectedVoucher && (
                <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 mobile-overlay-enter" onClick={() => setSelectedVoucher(null)}>
                    <div className="bg-white w-full sm:rounded-2xl sm:max-w-3xl max-h-[92vh] sm:max-h-[90vh] rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Drag handle on mobile */}
                        <div className="sm:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>

                        <div id="voucher-print-area" className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b pb-4">
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">{selectedVoucher.voucher_type}</p>
                                    <h2 className="text-xl sm:text-2xl font-bold">{selectedVoucher.party_name || 'Voucher Details'}</h2>
                                    <p className="text-gray-600 text-sm">#{selectedVoucher.voucher_number} • {formatDate(selectedVoucher.voucher_date)}</p>
                                </div>
                                <div className="sm:text-right">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount</p>
                                    <p className="text-2xl sm:text-3xl font-bold text-gray-800">{formatCurrency(selectedVoucher.total_amount)}</p>
                                </div>
                            </div>

                            {selectedVoucher.narration && (
                                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                                    <p className="text-sm font-semibold text-gray-500 mb-1">Narrations</p>
                                    <p className="text-gray-800 italic text-sm">{selectedVoucher.narration}</p>
                                </div>
                            )}

                            {/* Inventory - card on mobile, table on desktop */}
                            {selectedVoucher.inventory_entries?.length > 0 && (
                                <div>
                                    <h3 className="text-base sm:text-lg font-semibold mb-3">Item Details</h3>
                                    {/* Mobile */}
                                    <div className="sm:hidden space-y-2">
                                        {selectedVoucher.inventory_entries.map((inv, idx) => (
                                            <div key={idx} className="bg-gray-50 rounded-lg p-3">
                                                <p className="font-medium text-sm">{inv.stock_item_name}</p>
                                                <div className="flex justify-between mt-1 text-xs text-gray-600">
                                                    <span>{inv.quantity} {inv.unit} × {formatCurrency(inv.rate)}</span>
                                                    <span className="font-semibold text-gray-800">{formatCurrency(inv.amount)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Desktop */}
                                    <table className="hidden sm:table w-full text-sm border-collapse">
                                        <thead className="bg-gray-50 text-gray-500"><tr><th className="text-left p-3">Item</th><th className="text-right p-3">Qty</th><th className="text-right p-3">Rate</th><th className="text-right p-3">Amount</th></tr></thead>
                                        <tbody className="divide-y">{selectedVoucher.inventory_entries.map((inv, idx) => (
                                            <tr key={idx}><td className="p-3 font-medium">{inv.stock_item_name}</td><td className="p-3 text-right">{inv.quantity} {inv.unit}</td><td className="p-3 text-right">{formatCurrency(inv.rate)}</td><td className="p-3 text-right font-semibold">{formatCurrency(inv.amount)}</td></tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            )}

                            {/* Ledger Entries */}
                            {selectedVoucher.ledger_entries?.length > 0 && (
                                <div>
                                    <h3 className="text-base sm:text-lg font-semibold mb-3">Ledger Entries</h3>
                                    <div className="space-y-1">
                                        {selectedVoucher.ledger_entries.map((led, idx) => (
                                            <div key={idx} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                                                <span className="font-medium">{led.ledger_name}{led.is_debit && <span className="ml-2 text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-500">Dr</span>}</span>
                                                <span>{formatCurrency(led.amount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="border-t p-3 sm:p-4 bg-gray-50 rounded-b-2xl flex justify-between items-center safe-bottom">
                            <button onClick={handlePrint} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 flex items-center gap-2 text-sm font-medium">🖨️ Print</button>
                            <button onClick={() => setSelectedVoucher(null)} className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 active:bg-gray-400 text-sm font-medium">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

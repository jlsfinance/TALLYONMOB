import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { voucherApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function VouchersPage() {
    const { selectedCompany } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    const [voucherTypes, setVoucherTypes] = useState([]);
    const [selectedType, setSelectedType] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState('2024-04-01'); // Default to FY start
    const [toDate, setToDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const [selectedVoucher, setSelectedVoucher] = useState(null);

    useEffect(() => {
        if (selectedCompany) {
            loadData();
        }
    }, [selectedCompany, fromDate, toDate, selectedType]);

    const loadData = async () => {
        setLoading(true);
        const [voucherRes, typesRes] = await Promise.all([
            voucherApi.list(selectedCompany.id, { fromDate, toDate, type: selectedType }),
            voucherApi.getTypes(selectedCompany.id)
        ]);
        setVouchers(voucherRes.data || []);
        setVoucherTypes(typesRes.data || []);
        setLoading(false);
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

    const getTypeColor = (type) => {
        const colors = {
            'Sales': 'bg-green-100 text-green-700',
            'Purchase': 'bg-red-100 text-red-700',
            'Payment': 'bg-orange-100 text-orange-700',
            'Receipt': 'bg-blue-100 text-blue-700',
            'Journal': 'bg-purple-100 text-purple-700',
            'Contra': 'bg-gray-100 text-gray-700'
        };
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

    // Group by type for summary
    const typeSummary = vouchers.reduce((acc, v) => {
        if (!acc[v.voucher_type]) {
            acc[v.voucher_type] = { count: 0, amount: 0 };
        }
        acc[v.voucher_type].count++;
        acc[v.voucher_type].amount += Math.abs(v.total_amount || 0);
        return acc;
    }, {});

    if (!selectedCompany) {
        return <div className="p-8 text-center text-gray-500">Please select a company first</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Vouchers</h1>
                    <p className="text-gray-500">All transactions and entries</p>
                </div>
            </div>

            {/* Type Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(typeSummary).map(([type, data]) => (
                    <button
                        key={type}
                        onClick={() => setSelectedType(selectedType === type ? '' : type)}
                        className={`p-3 rounded-xl text-left transition ${selectedType === type
                            ? 'ring-2 ring-blue-500 bg-blue-50'
                            : 'bg-white shadow hover:shadow-md'
                            }`}
                    >
                        <p className="text-sm font-medium text-gray-600">{type}</p>
                        <p className="text-lg font-bold text-gray-800">{data.count}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(data.amount)}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by party or voucher number..."
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
                <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Types</option>
                    {voucherTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>

            {/* Voucher List */}
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
                    <div className="p-4 border-b flex items-center justify-between">
                        <span className="text-sm text-gray-500">{filteredVouchers.length} vouchers</span>
                        {selectedType && (
                            <button
                                onClick={() => setSelectedType('')}
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                Clear Filter
                            </button>
                        )}
                    </div>
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
                                {filteredVouchers.map(voucher => (
                                    <tr
                                        key={voucher.id}
                                        onClick={() => setSelectedVoucher(voucher)}
                                        className="hover:bg-gray-50 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3 text-sm">{formatDate(voucher.voucher_date)}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-medium text-gray-800">{voucher.voucher_number || '-'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(voucher.voucher_type)}`}>
                                                {voucher.voucher_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-gray-800">{voucher.party_name || '-'}</p>
                                            {voucher.narration && (
                                                <p className="text-xs text-gray-500 truncate max-w-xs">{voucher.narration}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`font-bold ${voucher.total_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(voucher.total_amount)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredVouchers.length === 0 && (
                            <div className="p-8 text-center text-gray-500">
                                <div className="text-5xl mb-4">📝</div>
                                <p>No vouchers found</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Voucher Details Modal */}
            {selectedVoucher && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col">
                        <div id="voucher-print-area" className="p-6 space-y-6">
                            {/* Modal Header */}
                            <div className="flex justify-between items-start border-b pb-4">
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">{selectedVoucher.voucher_type}</p>
                                    <h2 className="text-2xl font-bold ">{selectedVoucher.party_name || 'Voucher Details'}</h2>
                                    <p className="text-gray-600">#{selectedVoucher.voucher_number} • {formatDate(selectedVoucher.voucher_date)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount</p>
                                    <p className="text-3xl font-bold text-gray-800">{formatCurrency(selectedVoucher.total_amount)}</p>
                                </div>
                            </div>

                            {/* Narration */}
                            {selectedVoucher.narration && (
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm font-semibold text-gray-500 mb-1">Narrations</p>
                                    <p className="text-gray-800 italic">{selectedVoucher.narration}</p>
                                </div>
                            )}

                            {/* Inventory Entries */}
                            {selectedVoucher.inventory_entries && selectedVoucher.inventory_entries.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Item Details</h3>
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="bg-gray-50 text-gray-500">
                                            <tr>
                                                <th className="text-left p-3 rounded-l-lg">Item</th>
                                                <th className="text-right p-3">Qty</th>
                                                <th className="text-right p-3">Rate</th>
                                                <th className="text-right p-3 rounded-r-lg">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedVoucher.inventory_entries.map((inv, idx) => (
                                                <tr key={idx}>
                                                    <td className="p-3 font-medium">{inv.stock_item_name}</td>
                                                    <td className="p-3 text-right">{inv.quantity} {inv.unit}</td>
                                                    <td className="p-3 text-right">{formatCurrency(inv.rate)}</td>
                                                    <td className="p-3 text-right font-semibold">{formatCurrency(inv.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Ledger Entries */}
                            {selectedVoucher.ledger_entries && selectedVoucher.ledger_entries.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-3">Ledger Entries</h3>
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="bg-gray-50 text-gray-500">
                                            <tr>
                                                <th className="text-left p-3 rounded-l-lg">Ledger</th>
                                                <th className="text-right p-3 rounded-r-lg">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedVoucher.ledger_entries.map((led, idx) => (
                                                <tr key={idx}>
                                                    <td className="p-3 font-medium">
                                                        {led.ledger_name}
                                                        {led.is_debit && <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">Dr</span>}
                                                    </td>
                                                    <td className="p-3 text-right">{formatCurrency(led.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer / Actions */}
                        <div className="border-t p-4 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                            <button
                                onClick={handlePrint}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                            >
                                <span>🖨️ Print / Download</span>
                            </button>
                            <button
                                onClick={() => setSelectedVoucher(null)}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

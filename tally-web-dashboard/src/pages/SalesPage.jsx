import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { salesApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import '../styles/Material3.css';

export default function SalesPage() {
    const { selectedCompany } = useAuth();
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filterType, setFilterType] = useState('All');
    const [stats, setStats] = useState({ total: 0, count: 0, avgValue: 0 });

    // Initialize dates based on company settings or session
    useEffect(() => {
        if (!selectedCompany) return;

        const sessionKey = `sales_date_range_${selectedCompany.id}`;
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
            loadSales();
            const sessionKey = `sales_date_range_${selectedCompany.id}`;
            sessionStorage.setItem(sessionKey, JSON.stringify({ from: fromDate, to: toDate }));
        }
    }, [selectedCompany, fromDate, toDate]);

    const loadSales = async () => {
        if (!fromDate || !toDate) return;

        setLoading(true);
        const { data } = await salesApi.list(selectedCompany.id, { fromDate, toDate });
        setSales(data || []);

        const total = data?.reduce((s, sale) => s + (sale.net_amount || 0), 0) || 0;
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
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const filteredSales = sales.filter(s => {
        const matchesSearch = s.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase());

        if (filterType === 'All') return matchesSearch;
        // Simple filter based on voucher type string inclusion
        return matchesSearch && s.voucher_type?.includes(filterType);
    });

    if (!selectedCompany) {
        return <div className="page-m3 flex justify-center items-center"><p>Please select a company</p></div>;
    }

    return (
        <div className="page-m3">
            {/* Header */}
            <header className="page-m3__header">
                <h1 className="page-m3__title">
                    <span>📈</span> Sales Register
                </h1>
                <p className="page-m3__subtitle">{stats.count} vouchers found in selected period</p>
            </header>

            {/* Date Range & Search Container */}
            <div className="flex flex-wrap gap-4 mb-6 items-center justify-between">
                <div className="page-m3__date-range">
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="page-m3__date-input"
                    />
                    <span className="text-gray-400">→</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="page-m3__date-input"
                    />
                </div>

                <div className="relative flex-1 max-w-md">
                    <input
                        type="text"
                        placeholder="Search Party Name or Invoice No..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:border-green-700 bg-white shadow-sm"
                    />
                    <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                </div>
            </div>



            {/* Filters */}
            <div className="page-m3__filters">
                {['All', 'Sales', 'Credit Note'].map(type => (
                    <button
                        key={type}
                        className={`page-m3__chip ${filterType === type ? 'active' : ''}`}
                        onClick={() => setFilterType(type)}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Sales List */}
            {loading ? (
                <div className="page-m3__loading">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700 mb-2"></div>
                    <p>Syncing sales data...</p>
                </div>
            ) : (
                <div className="page-m3__list">
                    {filteredSales.map(sale => (
                        <Link
                            key={sale.id}
                            to={`/sales/${sale.id}`}
                            className="page-m3__card"
                        >
                            <div className="page-m3__card-left">
                                <div className="page-m3__avatar">
                                    {sale.party_ledger_name?.charAt(0)?.toUpperCase() || '#'}
                                </div>
                                <div className="page-m3__card-info">
                                    <span className="page-m3__party-name">
                                        {sale.party_ledger_name || 'Cash Sale'}
                                    </span>
                                    <span className="page-m3__details">
                                        #{sale.invoice_number} • {formatDate(sale.invoice_date)}
                                    </span>
                                </div>
                            </div>
                            <div className="page-m3__card-right">
                                <span className="page-m3__amount">
                                    {formatCurrency(sale.net_amount)}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                                    {sale.voucher_type}
                                </span>
                            </div>
                        </Link>
                    ))}

                    {filteredSales.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-4xl mb-2">📭</p>
                            <p>No invoices found in this range</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <Link to="/create-invoice" className="page-m3__fab" title="Create Invoice">
                <span>+</span>
            </Link>
        </div>
    );
}


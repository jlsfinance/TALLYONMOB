import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { salesApi } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import './SalesPage.css';

export default function SalesPage() {
    const { selectedCompany } = useAuth();
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
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
                console.error("Error parsing saved dates", e);
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
            // Save to session
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

    const handleDateChange = (type, value) => {
        if (type === 'from') setFromDate(value);
        else setToDate(value);
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
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    const filteredSales = sales.filter(s =>
        s.party_ledger_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedCompany) {
        return <div className="page-3d__empty"><p>Please select a company first</p></div>;
    }

    return (
        <div className="page-3d sales-3d">
            {/* Header */}
            <header className="sales-3d__header">
                <div className="sales-3d__header-info">
                    <h1 className="page-3d__title">
                        <span className="page-3d__title-icon">📈</span>
                        Sales
                    </h1>
                    <p className="page-3d__subtitle">{stats.count} invoices</p>
                </div>
            </header>

            {/* Stats Row */}
            <div className="sales-3d__stats">
                <div className="sales-3d__stat-card">
                    <span className="sales-3d__stat-value green">{formatCurrency(stats.total)}</span>
                    <span className="sales-3d__stat-label">Total Sales</span>
                </div>
                <div className="sales-3d__stat-card">
                    <span className="sales-3d__stat-value blue">{stats.count}</span>
                    <span className="sales-3d__stat-label">Invoices</span>
                </div>
                <div className="sales-3d__stat-card">
                    <span className="sales-3d__stat-value purple">{formatCurrency(stats.avgValue)}</span>
                    <span className="sales-3d__stat-label">Avg Value</span>
                </div>
            </div>

            {/* Date Filter */}
            <div className="sales-3d__date-filter">
                <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="page-3d__date-input"
                />
                <span>to</span>
                <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="page-3d__date-input"
                />
            </div>

            {/* Search */}
            <div className="page-3d__search">
                <span className="page-3d__search-icon">🔍</span>
                <input
                    type="text"
                    placeholder="Search party or invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="page-3d__search-input"
                />
            </div>

            {/* Sales List */}
            {loading ? (
                <div className="page-3d__loading">
                    <div className="page-3d__spinner" />
                    <p>Loading sales...</p>
                </div>
            ) : (
                <div className="page-3d__list">
                    {filteredSales.map(sale => (
                        <Link
                            key={sale.id}
                            to={`/sales/${sale.id}`}
                            className="page-3d__list-card"
                        >
                            <div className="page-3d__list-left">
                                <div className="page-3d__list-avatar green">
                                    {sale.party_ledger_name?.charAt(0)?.toUpperCase() || '₹'}
                                </div>
                                <div className="page-3d__list-info">
                                    <span className="page-3d__list-name">
                                        {sale.party_ledger_name || 'Cash Sale'}
                                    </span>
                                    <span className="page-3d__list-meta">
                                        #{sale.invoice_number} • {formatDate(sale.invoice_date)}
                                    </span>
                                    {(sale.cgst_amount || sale.sgst_amount || sale.igst_amount) && (
                                        <div className="sales-3d__tax-info">
                                            {sale.cgst_amount > 0 && <span>CGST: ₹{sale.cgst_amount?.toFixed(0)}</span>}
                                            {sale.sgst_amount > 0 && <span>SGST: ₹{sale.sgst_amount?.toFixed(0)}</span>}
                                            {sale.igst_amount > 0 && <span>IGST: ₹{sale.igst_amount?.toFixed(0)}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="page-3d__list-right">
                                <span className="page-3d__list-amount credit">
                                    {formatCurrency(sale.net_amount)}
                                </span>
                                <span className="page-3d__list-badge green">SALE</span>
                            </div>
                        </Link>
                    ))}
                    {filteredSales.length === 0 && (
                        <div className="page-3d__empty">
                            <span className="page-3d__empty-icon">📈</span>
                            <p className="page-3d__empty-text">No sales found</p>
                            <p className="page-3d__empty-hint">Try adjusting the date range</p>
                        </div>
                    )}
                </div>
            )}

            {/* FAB */}
            <Link to="/create-invoice" className="page-3d__fab">➕</Link>
        </div>
    );
}

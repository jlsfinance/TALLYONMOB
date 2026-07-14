import React, { useState, useEffect } from 'react';
import {
    TrendingUp,
    Users,
    Package,
    Filter,
    ChevronDown,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    BarChart3,
    IndianRupee
} from 'lucide-react';
import { supabase } from '../lib/insforge';
import { useAuth } from '../contexts/AuthContext';

const TopAnalyticsSection = () => {
    const { selectedCompany } = useAuth();
    const [activeTab, setActiveTab] = useState('customers');
    const [limit, setLimit] = useState(10);
    const [dateRange, setDateRange] = useState('all');
    const [loading, setLoading] = useState(true);

    // Data states
    const [topCustomers, setTopCustomers] = useState([]);
    const [topItems, setTopItems] = useState([]);
    const [topSuppliers, setTopSuppliers] = useState([]);

    useEffect(() => {
        if (selectedCompany?.id) {
            loadData();
        }
    }, [selectedCompany, limit, dateRange]);

    const getDateFilter = () => {
        const now = new Date();
        switch (dateRange) {
            case 'today':
                return now.toISOString().split('T')[0];
            case 'week':
                const weekAgo = new Date(now.setDate(now.getDate() - 7));
                return weekAgo.toISOString().split('T')[0];
            case 'month':
                const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
                return monthAgo.toISOString().split('T')[0];
            case 'quarter':
                const quarterAgo = new Date(now.setMonth(now.getMonth() - 3));
                return quarterAgo.toISOString().split('T')[0];
            case 'year':
                const yearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
                return yearAgo.toISOString().split('T')[0];
            default:
                return null;
        }
    };

    const loadData = async () => {
        setLoading(true);
        const dateFilter = getDateFilter();

        try {
            // Build base query for vouchers
            let vouchersQuery = supabase
                .from('vouchers')
                .select('party_name, voucher_type, net_amount, invoice_date')
                .eq('company_id', selectedCompany.id);

            if (dateFilter) {
                vouchersQuery = vouchersQuery.gte('invoice_date', dateFilter);
            }

            const { data: vouchers } = await vouchersQuery;

            // Process Top Customers (Sales)
            const customerMap = {};
            const supplierMap = {};

            (vouchers || []).forEach(v => {
                if (!v.party_name) return;

                const amount = parseFloat(v.net_amount) || 0;

                if (v.voucher_type === 'Sales' || v.voucher_type === 'Receipt') {
                    if (!customerMap[v.party_name]) {
                        customerMap[v.party_name] = { name: v.party_name, total: 0, count: 0 };
                    }
                    customerMap[v.party_name].total += amount;
                    customerMap[v.party_name].count++;
                }

                if (v.voucher_type === 'Purchase' || v.voucher_type === 'Payment') {
                    if (!supplierMap[v.party_name]) {
                        supplierMap[v.party_name] = { name: v.party_name, total: 0, count: 0 };
                    }
                    supplierMap[v.party_name].total += amount;
                    supplierMap[v.party_name].count++;
                }
            });

            // Sort and limit
            const sortedCustomers = Object.values(customerMap)
                .sort((a, b) => b.total - a.total)
                .slice(0, limit);

            const sortedSuppliers = Object.values(supplierMap)
                .sort((a, b) => b.total - a.total)
                .slice(0, limit);

            setTopCustomers(sortedCustomers);
            setTopSuppliers(sortedSuppliers);

            // Load Stock Items with sales data
            const { data: stockItems } = await supabase
                .from('stock_items')
                .select('name, opening_balance, opening_value, closing_balance, closing_value')
                .eq('company_id', selectedCompany.id)
                .order('closing_value', { ascending: false })
                .limit(limit);

            setTopItems(stockItems || []);

        } catch (error) {
            console.error('Load analytics error:', error);
        }
        setLoading(false);
    };

    const tabs = [
        { id: 'customers', label: 'Top Customers', icon: Users },
        { id: 'items', label: 'Top Items', icon: Package },
        { id: 'suppliers', label: 'Top Suppliers', icon: TrendingUp }
    ];

    const limitOptions = [10, 20, 50, 100];
    const dateOptions = [
        { value: 'all', label: 'All Time' },
        { value: 'today', label: 'Today' },
        { value: 'week', label: 'Last 7 Days' },
        { value: 'month', label: 'Last 30 Days' },
        { value: 'quarter', label: 'Last Quarter' },
        { value: 'year', label: 'Last Year' }
    ];

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getActiveData = () => {
        switch (activeTab) {
            case 'customers': return topCustomers;
            case 'items': return topItems;
            case 'suppliers': return topSuppliers;
            default: return [];
        }
    };

    const maxValue = Math.max(...getActiveData().map(d => d.total || d.closing_value || 0), 1);

    return (
        <div className="top-analytics">
            <div className="analytics-header">
                <h2>
                    <BarChart3 size={24} />
                    Top Analytics
                </h2>

                <div className="filters">
                    {/* Limit Selector */}
                    <div className="filter-group">
                        <label>Show</label>
                        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                            {limitOptions.map(opt => (
                                <option key={opt} value={opt}>Top {opt}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div className="filter-group">
                        <label><Calendar size={14} /></label>
                        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                            {dateOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="analytics-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="analytics-content">
                {loading ? (
                    <div className="loading">Loading analytics...</div>
                ) : getActiveData().length === 0 ? (
                    <div className="no-data">No data available for selected filters</div>
                ) : (
                    <div className="analytics-list">
                        {getActiveData().map((item, index) => (
                            <div key={index} className="analytics-item">
                                <div className="item-rank">#{index + 1}</div>
                                <div className="item-info">
                                    <span className="item-name">{item.name}</span>
                                    {item.count && (
                                        <span className="item-count">{item.count} transactions</span>
                                    )}
                                </div>
                                <div className="item-bar">
                                    <div
                                        className="bar-fill"
                                        style={{
                                            width: `${((item.total || item.closing_value || 0) / maxValue) * 100}%`
                                        }}
                                    />
                                </div>
                                <div className="item-value">
                                    <IndianRupee size={14} />
                                    {formatCurrency(item.total || item.closing_value || 0).replace('₹', '')}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                .top-analytics {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 20px;
                    padding: 24px;
                    margin-top: 24px;
                }

                .analytics-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 16px;
                }

                .analytics-header h2 {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 1.3rem;
                    color: white;
                    margin: 0;
                }

                .filters {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                .filter-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    padding: 8px 12px;
                }

                .filter-group label {
                    font-size: 0.8rem;
                    color: #9ca3af;
                    display: flex;
                    align-items: center;
                }

                .filter-group select {
                    background: transparent;
                    border: none;
                    color: white;
                    font-size: 0.9rem;
                    cursor: pointer;
                    outline: none;
                }

                .filter-group select option {
                    background: #1a1a2e;
                    color: white;
                }

                .analytics-tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding-bottom: 12px;
                    overflow-x: auto;
                }

                .tab {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 16px;
                    background: transparent;
                    border: none;
                    color: #9ca3af;
                    font-size: 0.9rem;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .tab:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                }

                .tab.active {
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
                    color: white;
                    border: 1px solid rgba(139, 92, 246, 0.3);
                }

                .analytics-content {
                    min-height: 200px;
                }

                .loading, .no-data {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    color: #9ca3af;
                }

                .analytics-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .analytics-item {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                    transition: all 0.2s;
                }

                .analytics-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(139, 92, 246, 0.3);
                }

                .item-rank {
                    width: 36px;
                    height: 36px;
                    background: linear-gradient(135deg, #8b5cf6, #3b82f6);
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 0.85rem;
                    color: white;
                }

                .item-info {
                    flex: 1;
                    min-width: 120px;
                }

                .item-name {
                    display: block;
                    font-weight: 600;
                    color: white;
                    margin-bottom: 4px;
                }

                .item-count {
                    font-size: 0.75rem;
                    color: #9ca3af;
                }

                .item-bar {
                    flex: 2;
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #8b5cf6, #3b82f6);
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }

                .item-value {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-weight: 700;
                    color: #10b981;
                    min-width: 100px;
                    justify-content: flex-end;
                }

                @media (max-width: 768px) {
                    .analytics-item {
                        flex-wrap: wrap;
                    }

                    .item-bar {
                        width: 100%;
                        order: 3;
                    }

                    .item-value {
                        min-width: auto;
                    }
                }
            `}</style>
        </div>
    );
};

export default TopAnalyticsSection;


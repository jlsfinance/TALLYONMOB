import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ledgerApi } from '../lib/supabase';
import { Link } from 'react-router-dom';

export default function LedgersPage() {
    const { selectedCompany } = useAuth();
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (selectedCompany) {
            loadData();
        }
    }, [selectedCompany]);

    const loadData = async () => {
        setLoading(true);
        const [ledgerRes, groupRes] = await Promise.all([
            ledgerApi.list(selectedCompany.id),
            ledgerApi.getGroups(selectedCompany.id)
        ]);
        setLedgers(ledgerRes.data || []);
        setGroups(groupRes.data || []);
        setLoading(false);
    };

    const formatCurrency = (amount) => {
        const absAmount = Math.abs(amount || 0);
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(absAmount);
    };

    const filteredLedgers = ledgers.filter(l => {
        const matchesSearch = l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.phone?.includes(searchTerm) ||
            l.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesGroup = !selectedGroup || l.parent_group === selectedGroup;
        return matchesSearch && matchesGroup;
    });

    // Group ledgers by parent_group
    const groupedLedgers = filteredLedgers.reduce((acc, ledger) => {
        const group = ledger.parent_group || 'Other';
        if (!acc[group]) acc[group] = [];
        acc[group].push(ledger);
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
                    <h1 className="text-2xl font-bold text-gray-800">Ledgers</h1>
                    <p className="text-gray-500">All parties, banks, and accounts</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{filteredLedgers.length} ledgers</span>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by name, phone, or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    <option value="">All Groups</option>
                    {groups.map(g => (
                        <option key={g} value={g}>{g}</option>
                    ))}
                </select>
            </div>

            {/* Ledger List */}
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
                <div className="space-y-6">
                    {Object.entries(groupedLedgers).map(([group, items]) => (
                        <div key={group}>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                {group}
                                <span className="text-gray-400 font-normal">({items.length})</span>
                            </h3>
                            <div className="bg-white rounded-xl shadow overflow-hidden">
                                <div className="divide-y divide-gray-100">
                                    {items.map(ledger => (
                                        <Link
                                            key={ledger.id}
                                            to={`/ledgers/${ledger.id}`}
                                            className="flex items-center justify-between p-4 hover:bg-gray-50 transition"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                                                    {ledger.name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-800">{ledger.name}</p>
                                                    <div className="flex items-center gap-3 text-sm text-gray-500">
                                                        {ledger.phone && <span>📞 {ledger.phone}</span>}
                                                        {ledger.gstin && <span>GST: {ledger.gstin}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold ${ledger.closing_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(ledger.closing_balance)}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {ledger.closing_balance >= 0 ? 'Dr' : 'Cr'}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredLedgers.length === 0 && (
                        <div className="bg-white rounded-xl p-12 shadow text-center">
                            <div className="text-5xl mb-4">🔍</div>
                            <p className="text-gray-500">No ledgers found</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

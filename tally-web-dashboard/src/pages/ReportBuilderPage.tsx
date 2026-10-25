import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/insforge';
import toast from 'react-hot-toast';
import {
    Table2, Play, Download, Filter, Columns, BarChart3,
    Save, Trash2, RefreshCw, ChevronDown, X, FileSpreadsheet, Settings2
} from 'lucide-react';

interface TableConfig {
    name: string;
    label: string;
    fields: { key: string; label: string; type: 'text' | 'number' | 'date' | 'currency' }[];
}

const TABLES: TableConfig[] = [
    {
        name: 'vouchers', label: '📋 Vouchers',
        fields: [
            { key: 'voucher_number', label: 'Voucher No', type: 'text' },
            { key: 'voucher_type', label: 'Type', type: 'text' },
            { key: 'voucher_date', label: 'Date', type: 'date' },
            { key: 'party_name', label: 'Party', type: 'text' },
            { key: 'total_amount', label: 'Amount', type: 'currency' },
            { key: 'grand_total', label: 'Grand Total', type: 'currency' },
            { key: 'narration', label: 'Narration', type: 'text' },
            { key: 'place_of_supply', label: 'Place of Supply', type: 'text' },
        ],
    },
    {
        name: 'ledgers', label: '👥 Ledgers/Parties',
        fields: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'parent_group', label: 'Group', type: 'text' },
            { key: 'closing_balance', label: 'Balance', type: 'currency' },
            { key: 'email', label: 'Email', type: 'text' },
            { key: 'phone', label: 'Phone', type: 'text' },
            { key: 'gstin', label: 'GSTIN', type: 'text' },
            { key: 'address', label: 'Address', type: 'text' },
        ],
    },
    {
        name: 'stock_items', label: '📦 Stock Items',
        fields: [
            { key: 'name', label: 'Item Name', type: 'text' },
            { key: 'stock_group', label: 'Group', type: 'text' },
            { key: 'unit', label: 'Unit', type: 'text' },
            { key: 'opening_stock', label: 'Opening', type: 'number' },
            { key: 'current_stock', label: 'Current Stock', type: 'number' },
            { key: 'rate', label: 'Rate', type: 'currency' },
        ],
    },
];

interface FilterRule {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'in';
    value: string;
}

interface SavedReport {
    name: string;
    table: string;
    fields: string[];
    filters: FilterRule[];
    sortField: string;
    sortDir: 'asc' | 'desc';
}

export default function ReportBuilderPage() {
    const [companyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');
    const [selectedTable, setSelectedTable] = useState<string>('vouchers');
    const [selectedFields, setSelectedFields] = useState<string[]>(['voucher_number', 'voucher_type', 'voucher_date', 'party_name', 'grand_total']);
    const [filters, setFilters] = useState<FilterRule[]>([]);
    const [sortField, setSortField] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [limit, setLimit] = useState(100);

    // Saved reports
    const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
        const saved = localStorage.getItem('tallylink_saved_reports');
        return saved ? JSON.parse(saved) : [];
    });
    const [reportName, setReportName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    const tableConfig = TABLES.find(t => t.name === selectedTable);

    const toggleField = (key: string) => {
        setSelectedFields(prev =>
            prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
        );
    };

    const addFilter = () => {
        if (!tableConfig) return;
        setFilters(prev => [...prev, { field: tableConfig.fields[0].key, operator: 'eq', value: '' }]);
    };

    const updateFilter = (idx: number, updates: Partial<FilterRule>) => {
        setFilters(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));
    };

    const removeFilter = (idx: number) => {
        setFilters(prev => prev.filter((_, i) => i !== idx));
    };

    const runReport = useCallback(async () => {
        if (!companyId || !selectedTable || selectedFields.length === 0) {
            toast.error('Select at least one field');
            return;
        }

        setLoading(true);
        try {
            let query = supabase
                .from(selectedTable)
                .select(selectedFields.join(', '))
                .eq('company_id', companyId);

            // Only add is_deleted filter for vouchers
            if (selectedTable === 'vouchers') {
                query = query.eq('is_deleted', false);
            }

            // Date filter for vouchers
            if (selectedTable === 'vouchers') {
                if (fromDate) query = query.gte('voucher_date', fromDate);
                if (toDate) query = query.lte('voucher_date', toDate);
            }

            // Apply filters
            for (const filter of filters) {
                if (!filter.value) continue;
                switch (filter.operator) {
                    case 'eq': query = query.eq(filter.field, filter.value); break;
                    case 'neq': query = query.neq(filter.field, filter.value); break;
                    case 'gt': query = query.gt(filter.field, filter.value); break;
                    case 'lt': query = query.lt(filter.field, filter.value); break;
                    case 'gte': query = query.gte(filter.field, filter.value); break;
                    case 'lte': query = query.lte(filter.field, filter.value); break;
                    case 'like': query = query.ilike(filter.field, `%${filter.value}%`); break;
                    case 'in': query = query.in(filter.field, filter.value.split(',').map(v => v.trim())); break;
                }
            }

            // Sort
            if (sortField) {
                query = query.order(sortField, { ascending: sortDir === 'asc' });
            }

            // Limit
            query = query.limit(limit);

            const { data, error } = await query;
            if (error) throw error;

            setResults(data || []);
            toast.success(`Found ${data?.length || 0} records`);
        } catch (err: any) {
            toast.error(err.message || 'Query failed');
        } finally {
            setLoading(false);
        }
    }, [companyId, selectedTable, selectedFields, filters, sortField, sortDir, fromDate, toDate, limit]);

    const exportCSV = () => {
        if (!results.length) return;
        const fields = selectedFields;
        const fieldLabels = fields.map(f => tableConfig?.fields.find(tf => tf.key === f)?.label || f);
        const rows = results.map(r => fields.map(f => {
            const val = r[f];
            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val ?? '';
        }));

        const csv = [fieldLabels.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${selectedTable}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const saveReport = () => {
        if (!reportName.trim()) {
            toast.error('Enter a report name');
            return;
        }
        const report: SavedReport = {
            name: reportName, table: selectedTable,
            fields: selectedFields, filters, sortField, sortDir,
        };
        const updated = [...savedReports, report];
        setSavedReports(updated);
        localStorage.setItem('tallylink_saved_reports', JSON.stringify(updated));
        setShowSaveDialog(false);
        setReportName('');
        toast.success('Report saved!');
    };

    const loadReport = (report: SavedReport) => {
        setSelectedTable(report.table);
        setSelectedFields(report.fields);
        setFilters(report.filters);
        setSortField(report.sortField);
        setSortDir(report.sortDir);
        toast.success(`Loaded: ${report.name}`);
    };

    const deleteReport = (idx: number) => {
        const updated = savedReports.filter((_, i) => i !== idx);
        setSavedReports(updated);
        localStorage.setItem('tallylink_saved_reports', JSON.stringify(updated));
    };

    const formatCurrency = (n: number) =>
        `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

    const formatCell = (value: any, type: string) => {
        if (value === null || value === undefined) return '-';
        if (type === 'currency') return formatCurrency(Number(value));
        if (type === 'date') return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (type === 'number') return Number(value).toLocaleString('en-IN');
        return String(value);
    };

    // Summary for number/currency fields
    const summaryFields = selectedFields.filter(f => {
        const field = tableConfig?.fields.find(tf => tf.key === f);
        return field && (field.type === 'currency' || field.type === 'number');
    });

    return (
        <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #1a1a2e)', margin: 0 }}>
                        📊 Custom Report Builder
                    </h1>
                    <p style={{ color: 'var(--text-secondary, #666)', margin: '4px 0 0' }}>
                        Create custom reports from your data
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {results.length > 0 && (
                        <button onClick={exportCSV}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: '#10b98115', color: '#10b981', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                            <Download size={16} /> Export CSV
                        </button>
                    )}
                    <button onClick={() => setShowSaveDialog(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: '#667eea15', color: '#667eea', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                        <Save size={16} /> Save Report
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
                {/* Left Panel - Config */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Data Source */}
                    <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Table2 size={16} /> Data Source
                        </h3>
                        {TABLES.map(t => (
                            <button
                                key={t.name}
                                onClick={() => {
                                    setSelectedTable(t.name);
                                    setSelectedFields(t.fields.slice(0, 4).map(f => f.key));
                                    setResults([]);
                                    setFilters([]);
                                }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '10px 14px', borderRadius: '10px', marginBottom: '6px',
                                    background: selectedTable === t.name ? '#667eea' : 'transparent',
                                    color: selectedTable === t.name ? '#fff' : 'var(--text-primary)',
                                    border: '1px solid ' + (selectedTable === t.name ? '#667eea' : 'var(--border-color, #e5e7eb)'),
                                    cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Fields */}
                    <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Columns size={16} /> Fields ({selectedFields.length})
                        </h3>
                        {tableConfig?.fields.map(f => (
                            <label
                                key={f.key}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                                    background: selectedFields.includes(f.key) ? '#667eea08' : 'transparent',
                                    marginBottom: '4px', fontSize: '13px',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedFields.includes(f.key)}
                                    onChange={() => toggleField(f.key)}
                                    style={{ accentColor: '#667eea' }}
                                />
                                <span style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>{f.type}</span>
                            </label>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Filter size={16} /> Filters
                        </h3>

                        {selectedTable === 'vouchers' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>From</label>
                                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>To</label>
                                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                                </div>
                            </div>
                        )}

                        {filters.map((f, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                                <select value={f.field} onChange={e => updateFilter(idx, { field: e.target.value })}
                                    style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '11px' }}>
                                    {tableConfig?.fields.map(tf => (
                                        <option key={tf.key} value={tf.key}>{tf.label}</option>
                                    ))}
                                </select>
                                <select value={f.operator} onChange={e => updateFilter(idx, { operator: e.target.value as any })}
                                    style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '11px' }}>
                                    <option value="eq">=</option>
                                    <option value="neq">≠</option>
                                    <option value="gt">&gt;</option>
                                    <option value="lt">&lt;</option>
                                    <option value="like">contains</option>
                                    <option value="in">in</option>
                                </select>
                                <input value={f.value} onChange={e => updateFilter(idx, { value: e.target.value })} placeholder="Value"
                                    style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '11px' }} />
                                <button onClick={() => removeFilter(idx)}
                                    style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        <button onClick={addFilter}
                            style={{ fontSize: '12px', color: '#667eea', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            + Add Filter
                        </button>
                    </div>

                    {/* Sort & Limit */}
                    <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings2 size={16} /> Sort & Limit
                        </h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <select value={sortField} onChange={e => setSortField(e.target.value)}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>
                                <option value="">No sorting</option>
                                {tableConfig?.fields.map(f => (
                                    <option key={f.key} value={f.key}>{f.label}</option>
                                ))}
                            </select>
                            <select value={sortDir} onChange={e => setSortDir(e.target.value as any)}
                                style={{ width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>
                                <option value="asc">↑ Asc</option>
                                <option value="desc">↓ Desc</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>Max Records</label>
                            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
                                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}>
                                {[50, 100, 250, 500, 1000, 5000].map(n => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Saved Reports */}
                    {savedReports.length > 0 && (
                        <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '20px', border: '1px solid var(--border-color, #e5e7eb)' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileSpreadsheet size={16} /> Saved Reports
                            </h3>
                            {savedReports.map((r, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <button onClick={() => loadReport(r)}
                                        style={{ flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {r.name}
                                    </button>
                                    <button onClick={() => deleteReport(i)}
                                        style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Run Button */}
                    <button
                        onClick={runReport}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '14px 24px', borderRadius: '14px',
                            background: loading ? '#999' : 'linear-gradient(135deg, #667eea, #764ba2)',
                            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: 700, fontSize: '15px',
                        }}
                    >
                        {loading ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={18} />}
                        {loading ? 'Running...' : 'Run Report'}
                    </button>
                </div>

                {/* Right Panel - Results */}
                <div>
                    {results.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                textAlign: 'center', padding: '80px 40px',
                                background: 'var(--card-bg, #fff)', borderRadius: '16px',
                                border: '1px solid var(--border-color, #e5e7eb)',
                            }}
                        >
                            <BarChart3 size={56} style={{ color: '#ccc', marginBottom: '16px' }} />
                            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Build Your Report</h3>
                            <p style={{ color: '#999', maxWidth: '400px', margin: '0 auto' }}>
                                Select a data source, choose fields, add filters, and click "Run Report" to see your custom data.
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                background: 'var(--card-bg, #fff)', borderRadius: '16px',
                                border: '1px solid var(--border-color, #e5e7eb)', overflow: 'hidden',
                            }}
                        >
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Results ({results.length} records)
                                </span>
                            </div>

                            <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: '11px' }}>#</th>
                                            {selectedFields.map(f => {
                                                const field = tableConfig?.fields.find(tf => tf.key === f);
                                                return (
                                                    <th key={f}
                                                        onClick={() => { setSortField(f); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                                                        style={{
                                                            padding: '10px 14px',
                                                            textAlign: field?.type === 'currency' || field?.type === 'number' ? 'right' : 'left',
                                                            fontWeight: 600, color: '#666', fontSize: '11px',
                                                            cursor: 'pointer', whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {field?.label || f}
                                                        {sortField === f && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px 14px', color: '#999', fontSize: '11px' }}>{i + 1}</td>
                                                {selectedFields.map(f => {
                                                    const field = tableConfig?.fields.find(tf => tf.key === f);
                                                    return (
                                                        <td key={f} style={{
                                                            padding: '10px 14px',
                                                            textAlign: field?.type === 'currency' || field?.type === 'number' ? 'right' : 'left',
                                                            color: field?.type === 'currency' ? (Number(row[f]) >= 0 ? '#1a1a2e' : '#ef4444') : 'var(--text-primary)',
                                                            fontWeight: field?.type === 'currency' ? 600 : 400,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {formatCell(row[f], field?.type || 'text')}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                    {/* Summary row */}
                                    {summaryFields.length > 0 && (
                                        <tfoot>
                                            <tr style={{ background: '#f0f4ff', fontWeight: 700 }}>
                                                <td style={{ padding: '12px 14px', color: '#667eea' }}>Σ</td>
                                                {selectedFields.map(f => {
                                                    const field = tableConfig?.fields.find(tf => tf.key === f);
                                                    if (field?.type === 'currency' || field?.type === 'number') {
                                                        const sum = results.reduce((s, r) => s + (Number(r[f]) || 0), 0);
                                                        return (
                                                            <td key={f} style={{ padding: '12px 14px', textAlign: 'right', color: '#667eea' }}>
                                                                {field.type === 'currency' ? formatCurrency(sum) : sum.toLocaleString('en-IN')}
                                                            </td>
                                                        );
                                                    }
                                                    return <td key={f} style={{ padding: '12px 14px' }}></td>;
                                                })}
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Save Report Dialog */}
            <AnimatePresence>
                {showSaveDialog && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                        onClick={() => setShowSaveDialog(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'var(--card-bg, #fff)', borderRadius: '16px', padding: '24px', width: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
                        >
                            <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>💾 Save Report</h3>
                            <input
                                value={reportName}
                                onChange={e => setReportName(e.target.value)}
                                placeholder="Report name (e.g. Monthly Sales)"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', fontSize: '14px', marginBottom: '16px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowSaveDialog(false)}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button onClick={saveReport}
                                    style={{ padding: '8px 20px', borderRadius: '8px', background: '#667eea', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                    Save
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


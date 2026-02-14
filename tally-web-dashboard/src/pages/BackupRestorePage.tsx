import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Database, Download, Upload, Clock, FileJson, FileSpreadsheet,
    Cloud, RefreshCcw, Loader2, CheckCircle, AlertTriangle,
    Trash2, HardDrive, Calendar, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Backup {
    id: string;
    created_at: string;
    type: 'full' | 'incremental';
    size_kb: number;
    status: 'completed' | 'failed';
    tables: string[];
}

export default function BackupRestorePage() {
    const { selectedCompany } = useAuth() as any;
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loading, setLoading] = useState(false);
    const [backing, setBacking] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set(['vouchers', 'ledgers', 'stock_items']));

    const TABLES = [
        { key: 'vouchers', label: 'Vouchers', icon: '📄' },
        { key: 'ledgers', label: 'Ledgers/Parties', icon: '👥' },
        { key: 'stock_items', label: 'Stock Items', icon: '📦' },
        { key: 'voucher_ledger_entries', label: 'Ledger Entries', icon: '📋' },
        { key: 'voucher_stock_entries', label: 'Stock Entries', icon: '📊' },
    ];

    const toggleTable = (key: string) => {
        const next = new Set(selectedTables);
        next.has(key) ? next.delete(key) : next.add(key);
        setSelectedTables(next);
    };

    const createBackup = async () => {
        if (selectedTables.size === 0) {
            toast.error('Select at least one table');
            return;
        }

        setBacking(true);
        try {
            const backupData: Record<string, any[]> = {};
            let totalSize = 0;

            for (const table of selectedTables) {
                const { data } = await supabase.from(table).select('*').eq('company_id', selectedCompany.id).limit(50000);
                backupData[table] = data || [];
                totalSize += JSON.stringify(data).length;
            }

            const backupJson = JSON.stringify({
                version: '1.0',
                company: selectedCompany.name,
                company_id: selectedCompany.id,
                created_at: new Date().toISOString(),
                tables: Object.keys(backupData),
                data: backupData
            }, null, 2);

            if (exportFormat === 'json') {
                downloadFile(backupJson, `backup_${selectedCompany.name}_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
            } else {
                // CSV export - one file per table
                for (const [table, rows] of Object.entries(backupData)) {
                    if (rows.length === 0) continue;
                    const headers = Object.keys(rows[0]);
                    const csv = [
                        headers.join(','),
                        ...rows.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))
                    ].join('\n');
                    downloadFile(csv, `${table}_${selectedCompany.name}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
                }
            }

            const backup: Backup = {
                id: Date.now().toString(),
                created_at: new Date().toISOString(),
                type: 'full',
                size_kb: Math.round(totalSize / 1024),
                status: 'completed',
                tables: [...selectedTables]
            };

            setBackups(prev => [backup, ...prev]);
            toast.success(`Backup created! ${Math.round(totalSize / 1024)}KB exported`);
        } catch (err: any) {
            toast.error('Backup failed: ' + (err.message || 'Unknown error'));
        } finally {
            setBacking(false);
        }
    };

    const downloadFile = (content: string, filename: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRestore = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;

            setRestoring(true);
            try {
                const text = await file.text();
                const backup = JSON.parse(text);

                if (!backup.data || !backup.company_id) {
                    toast.error('Invalid backup file format');
                    return;
                }

                if (backup.company_id !== selectedCompany.id) {
                    toast.error('Backup belongs to a different company');
                    return;
                }

                let totalRestored = 0;
                for (const [table, rows] of Object.entries(backup.data) as [string, any[]][]) {
                    if (rows.length === 0) continue;

                    // Upsert data
                    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
                    if (error) {
                        console.warn(`Restore warning for ${table}:`, error.message);
                    } else {
                        totalRestored += rows.length;
                    }
                }

                toast.success(`Restored ${totalRestored} records from backup!`);
            } catch (err: any) {
                toast.error('Restore failed: ' + (err.message || 'Invalid file'));
            } finally {
                setRestoring(false);
            }
        };
        input.click();
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="min-h-screen bg-[var(--background)] p-4 md:p-6 pb-24">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--on-surface)] flex items-center gap-2">
                    <Database className="w-6 h-6 text-cyan-400" />
                    Backup & Restore
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Export and import your business data</p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <button onClick={createBackup} disabled={backing}
                    className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 hover:border-cyan-500/30 transition-all text-left">
                    <Download className="w-8 h-8 text-cyan-400 mb-2" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Create Backup</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Export data to file</p>
                </button>
                <button onClick={handleRestore} disabled={restoring}
                    className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 hover:border-emerald-500/30 transition-all text-left">
                    <Upload className="w-8 h-8 text-emerald-400 mb-2" />
                    <h3 className="font-semibold text-[var(--on-surface)]">Restore Data</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Import from backup file</p>
                </button>
            </div>

            {/* Backup Settings */}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 mb-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3">Export Format</h3>
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setExportFormat('json')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${exportFormat === 'json' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border)]'
                            }`}>
                        <FileJson className="w-4 h-4" /> JSON (Full Backup)
                    </button>
                    <button onClick={() => setExportFormat('csv')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${exportFormat === 'csv' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-[var(--background)] text-[var(--text-muted)] border border-[var(--border)]'
                            }`}>
                        <FileSpreadsheet className="w-4 h-4" /> CSV (Per Table)
                    </button>
                </div>

                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3">Tables to Export</h3>
                <div className="space-y-2">
                    {TABLES.map(table => (
                        <label key={table.key} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--background)] cursor-pointer">
                            <input type="checkbox" checked={selectedTables.has(table.key)}
                                onChange={() => toggleTable(table.key)}
                                className="w-4 h-4 rounded accent-cyan-500"
                            />
                            <span className="text-sm">{table.icon}</span>
                            <span className="text-sm text-[var(--on-surface)]">{table.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Create Backup Button */}
            <button onClick={createBackup} disabled={backing || selectedTables.size === 0}
                className="w-full py-3 bg-cyan-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-cyan-600 disabled:opacity-50 transition-all mb-6">
                {backing ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating Backup...</> : <><Download className="w-5 h-5" /> Download Backup</>}
            </button>

            {/* Backup History */}
            <div className="mb-4">
                <h3 className="text-sm font-semibold text-[var(--on-surface)] mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Recent Backups
                </h3>
                {backups.length === 0 ? (
                    <div className="text-center py-10 bg-[var(--surface)] rounded-xl border border-[var(--border)]">
                        <HardDrive className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                        <p className="text-sm text-[var(--text-muted)]">No backups created yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {backups.map(backup => (
                            <div key={backup.id} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                            <span className="text-sm font-medium text-[var(--on-surface)]">Full Backup</span>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(backup.created_at)}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{backup.tables.length} tables • {backup.size_kb}KB</p>
                                    </div>
                                    <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">✅ Success</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--on-surface)]">Data Safety</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            All backups are downloaded to your device. No data is stored on external servers.
                            Your Supabase data remains synced and secure with RLS policies.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

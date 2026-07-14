import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Download, Upload, Trash2, RefreshCcw, Clock, HardDrive, Cloud, Mail,
  CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp, FileJson,
  FileText, Shield, Settings, Calendar, Archive, RotateCcw, Eye, Play, Pause,
  ToggleLeft, ToggleRight, Zap, Server, FolderOpen, Info, Import, FileSpreadsheet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow, subDays, subHours } from 'date-fns';

type BackupScope = 'all' | 'vouchers' | 'ledgers' | 'stock' | 'settings';
type BackupFormat = 'json' | 'zip';
type BackupFrequency = 'daily' | 'weekly' | 'monthly';
type BackupDestination = 'local' | 'cloud';
type RestoreMode = 'merge' | 'replace';
type BackupStatus = 'completed' | 'in-progress' | 'failed' | 'partial';

interface BackupEntry {
  id: string;
  date: Date;
  size: number;
  type: 'manual' | 'auto';
  scope: BackupScope;
  status: BackupStatus;
  format: BackupFormat;
  recordsCount: number;
  details?: string;
}

interface AutoBackupConfig {
  enabled: boolean;
  frequency: BackupFrequency;
  timeOfDay: string;
  retentionCount: number;
  destination: BackupDestination;
  emailNotification: boolean;
  lastRun?: Date;
  nextScheduled?: Date;
}

interface RestorePreview {
  table: string;
  currentRecords: number;
  backupRecords: number;
  action: 'add' | 'update' | 'delete' | 'unchanged';
}

const SCOPE_LABELS: Record<BackupScope, string> = {
  all: 'All Data',
  vouchers: 'Vouchers Only',
  ledgers: 'Ledgers Only',
  stock: 'Stock Items Only',
  settings: 'Settings Only',
};

const STATUS_CONFIG: Record<BackupStatus, { color: string; bg: string; icon: React.ReactNode }> = {
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30', icon: <CheckCircle2 size={14} /> },
  'in-progress': { color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/30', icon: <Loader2 size={14} className="animate-spin" /> },
  failed: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30', icon: <XCircle size={14} /> },
  partial: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', icon: <AlertTriangle size={14} /> },
};

const SCOPE_ICONS: Record<BackupScope, React.ReactNode> = {
  all: <Database size={18} />,
  vouchers: <FileText size={18} />,
  ledgers: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  stock: <Archive size={18} />,
  settings: <Settings size={18} />,
};

const INITIAL_BACKUPS: BackupEntry[] = [
  { id: 'bk-001', date: subHours(new Date(), 2), size: 24.5, type: 'auto', scope: 'all', status: 'completed', format: 'zip', recordsCount: 15420 },
  { id: 'bk-002', date: subDays(new Date(), 1), size: 22.1, type: 'manual', scope: 'vouchers', status: 'completed', format: 'json', recordsCount: 8320 },
  { id: 'bk-003', date: subDays(new Date(), 2), size: 18.7, type: 'auto', scope: 'all', status: 'completed', format: 'zip', recordsCount: 15100 },
  { id: 'bk-004', date: subDays(new Date(), 3), size: 12.3, type: 'manual', scope: 'ledgers', status: 'failed', format: 'json', recordsCount: 0, details: 'Storage quota exceeded' },
  { id: 'bk-005', date: subDays(new Date(), 4), size: 9.8, type: 'auto', scope: 'stock', status: 'partial', format: 'json', recordsCount: 3200, details: 'Skipped 12 corrupted records' },
  { id: 'bk-006', date: subDays(new Date(), 5), size: 21.0, type: 'auto', scope: 'all', status: 'completed', format: 'zip', recordsCount: 14890 },
  { id: 'bk-007', date: subDays(new Date(), 7), size: 5.2, type: 'manual', scope: 'settings', status: 'completed', format: 'json', recordsCount: 156 },
];

const RESTORE_PREVIEW_DATA: RestorePreview[] = [
  { table: 'Vouchers', currentRecords: 8420, backupRecords: 8320, action: 'update' },
  { table: 'Ledgers', currentRecords: 1250, backupRecords: 1245, action: 'add' },
  { table: 'Stock Items', currentRecords: 3400, backupRecords: 3200, action: 'update' },
  { table: 'Stock Groups', currentRecords: 180, backupRecords: 180, action: 'unchanged' },
  { table: 'Cost Centres', currentRecords: 45, backupRecords: 42, action: 'add' },
  { table: 'Company Settings', currentRecords: 1, backupRecords: 1, action: 'unchanged' },
  { table: 'Tax Rules', currentRecords: 28, backupRecords: 26, action: 'add' },
];

const VOUCHER_TYPES = ['Sales', 'Purchase', 'Receipt', 'Payment', 'Journal', 'Contra', 'Credit Note', 'Debit Note', 'Sales Order', 'Purchase Order'];

function formatSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function generateBackupId(): string {
  return `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function estimateSize(scope: BackupScope): number {
  const base: Record<BackupScope, number> = { all: 24.5, vouchers: 12.8, ledgers: 4.2, stock: 6.5, settings: 0.3 };
  return base[scope] + (Math.random() * 2 - 1);
}

// ── StatusCard ──
function StatusCard({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-4 sm:p-5 ${accent ? 'bg-cyan-400/5 border-cyan-400/20' : 'bg-zinc-900/50 border-zinc-800'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-cyan-400/10 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 truncate">{label}</p>
          <p className={`text-lg font-semibold truncate ${accent ? 'text-cyan-400' : 'text-zinc-100'}`}>{value}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Toggle ──
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group">
      {checked ? <ToggleRight size={28} className="text-cyan-400" /> : <ToggleLeft size={28} className="text-zinc-600 group-hover:text-zinc-500" />}
      {label && <span className={`text-sm font-medium ${checked ? 'text-zinc-100' : 'text-zinc-500'}`}>{label}</span>}
    </button>
  );
}

// ── ProgressBar ──
function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-zinc-500">{label}</span>
          <span className="text-xs font-medium text-cyan-400">{Math.round(value)}%</span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" />
      </div>
    </div>
  );
}

// ── SectionHeader ──
function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

// ── BackupDashboard ──
function BackupDashboardSection({ backups, autoConfig }: { backups: BackupEntry[]; autoConfig: AutoBackupConfig }) {
  const totalSize = backups.reduce((acc, b) => acc + b.size, 0);
  const usedPercent = Math.min((totalSize / 512) * 100, 100);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="space-y-6">
      <SectionHeader icon={<Database size={20} />} title="Backup Dashboard" description="Overview of your backup status and storage" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatusCard label="Last Backup" value={backups[0] ? formatDistanceToNow(backups[0].date, { addSuffix: true }) : 'Never'} icon={<Clock size={20} />} />
        <StatusCard label="Backup Size" value={formatSize(backups[0]?.size ?? 0)} icon={<HardDrive size={20} />} />
        <StatusCard label="Total Backups" value={backups.length.toString()} icon={<Archive size={20} />} />
        <StatusCard label="Auto Backup" value={autoConfig.enabled ? 'Enabled' : 'Disabled'} icon={autoConfig.enabled ? <CheckCircle2 size={20} /> : <Pause size={20} />} accent={autoConfig.enabled} />
        <StatusCard label="Next Scheduled" value={autoConfig.nextScheduled ? format(autoConfig.nextScheduled, 'dd MMM, hh:mm a') : 'Not scheduled'} icon={<Calendar size={20} />} />
        <StatusCard label="Storage Used" value={`${usedPercent.toFixed(1)}%`} icon={<Server size={20} />} accent={usedPercent > 80} />
      </div>
      <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-zinc-400">Storage Usage</span>
          <span className="text-sm text-zinc-500">{formatSize(totalSize)} / 512 MB</span>
        </div>
        <div className="h-3 w-full rounded-full bg-zinc-800 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${usedPercent}%` }} transition={{ duration: 1, ease: 'easeOut' }} className={`h-full rounded-full ${usedPercent > 80 ? 'bg-gradient-to-r from-red-500 to-red-400' : usedPercent > 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'}`} />
        </div>
      </div>
    </motion.div>
  );
}

// ── ManualBackup ──
function ManualBackupSection({ onBackupStart, isBackingUp, backupProgress }: { onBackupStart: (scope: BackupScope, format: BackupFormat) => void; isBackingUp: boolean; backupProgress: number }) {
  const [scope, setScope] = useState<BackupScope>('all');
  const [format, setFormatState] = useState<BackupFormat>('zip');
  const estimatedSize = useMemo(() => estimateSize(scope), [scope]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-6">
      <SectionHeader icon={<Download size={20} />} title="Manual Backup" description="Create an on-demand backup of your data" />
      <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5 sm:p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-3">Backup Scope</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(SCOPE_LABELS) as BackupScope[]).map((s) => (
              <button key={s} onClick={() => setScope(s)} disabled={isBackingUp} className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${scope === s ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                <span className={scope === s ? 'text-cyan-400' : 'text-zinc-500'}>{SCOPE_ICONS[s]}</span>
                <span className="text-sm font-medium">{SCOPE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-3">Backup Format</label>
          <div className="flex gap-3">
            <button onClick={() => setFormatState('zip')} disabled={isBackingUp} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${format === 'zip' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'} disabled:opacity-50`}>
              <Archive size={16} /> Compressed (ZIP)
            </button>
            <button onClick={() => setFormatState('json')} disabled={isBackingUp} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${format === 'json' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'} disabled:opacity-50`}>
              <FileJson size={16} /> Full (JSON)
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
          <Info size={16} className="text-zinc-500 shrink-0" />
          <span className="text-sm text-zinc-400">Estimated size: <span className="text-zinc-200 font-medium">{formatSize(estimatedSize)}</span></span>
        </div>
        {isBackingUp && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
            <ProgressBar value={backupProgress} label="Backup Progress" />
            <p className="text-xs text-zinc-500 text-center">
              {backupProgress < 30 ? 'Collecting data...' : backupProgress < 60 ? 'Processing records...' : backupProgress < 90 ? 'Compressing...' : 'Finalizing...'}
            </p>
          </motion.div>
        )}
        <button onClick={() => onBackupStart(scope, format)} disabled={isBackingUp} className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-3 px-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {isBackingUp ? (<><Loader2 size={18} className="animate-spin" /> Backing Up...</>) : (<><Play size={18} /> Backup Now</>)}
        </button>
      </div>
    </motion.div>
  );
}

// ── AutoBackupSettings ──
function AutoBackupSettingsSection({ config, onChange }: { config: AutoBackupConfig; onChange: (c: AutoBackupConfig) => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-6">
      <SectionHeader icon={<Zap size={20} />} title="Auto Backup Settings" description="Configure scheduled automatic backups" />
      <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Toggle checked={config.enabled} onChange={(v) => onChange({ ...config, enabled: v })} label="Auto Backup" />
          <span className={`text-xs px-2.5 py-1 rounded-full border ${config.enabled ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
            {config.enabled ? 'Active' : 'Inactive'}
          </span>
        </div>
        {config.enabled && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Frequency</label>
              <div className="grid grid-cols-3 gap-2">
                {(['daily', 'weekly', 'monthly'] as BackupFrequency[]).map((f) => (
                  <button key={f} onClick={() => onChange({ ...config, frequency: f })} className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-all ${config.frequency === f ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Time of Day</label>
              <input type="time" value={config.timeOfDay} onChange={(e) => onChange({ ...config, timeOfDay: e.target.value })} className="w-full sm:w-auto rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Retention Policy</label>
              <p className="text-xs text-zinc-500 mb-3">Automatically delete old backups beyond this limit</p>
              <div className="grid grid-cols-5 gap-2">
                {[7, 14, 30, 60, 90].map((n) => (
                  <button key={n} onClick={() => onChange({ ...config, retentionCount: n })} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${config.retentionCount === n ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-600 mt-2">Keep last {config.retentionCount} backups</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Backup Destination</label>
              <div className="flex gap-3">
                <button onClick={() => onChange({ ...config, destination: 'local' })} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${config.destination === 'local' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                  <HardDrive size={16} /> Local Storage
                </button>
                <button onClick={() => onChange({ ...config, destination: 'cloud' })} className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${config.destination === 'cloud' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                  <Cloud size={16} /> Cloud
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail size={18} className="text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-300">Email Notification</p>
                  <p className="text-xs text-zinc-500">Get notified when backup completes</p>
                </div>
              </div>
              <Toggle checked={config.emailNotification} onChange={(v) => onChange({ ...config, emailNotification: v })} label="" />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── BackupHistory ──
function BackupHistorySection({
  backups,
  onDownload,
  onRestore,
  onDelete,
  onViewDetails,
}: {
  backups: BackupEntry[];
  onDownload: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-6">
      <SectionHeader icon={<Clock size={20} />} title="Backup History" description="View and manage all your backups" />

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border bg-zinc-900/50 border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Date & Time</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Size</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Scope</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {backups.map((backup) => {
                const statusCfg = STATUS_CONFIG[backup.status];
                return (
                  <tr key={backup.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="text-zinc-200">{format(backup.date, 'dd MMM yyyy')}</div>
                      <div className="text-xs text-zinc-500">{format(backup.date, 'hh:mm a')}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">{formatSize(backup.size)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${backup.type === 'manual' ? 'bg-zinc-800 text-zinc-300' : 'bg-cyan-400/10 text-cyan-400'}`}>
                        {backup.type === 'manual' ? <Download size={12} /> : <Zap size={12} />}
                        {backup.type === 'manual' ? 'Manual' : 'Auto'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-400">{SCOPE_LABELS[backup.scope]}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.icon}
                        {backup.status.charAt(0).toUpperCase() + backup.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => onViewDetails(backup.id)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="View Details"><Eye size={15} /></button>
                        <button onClick={() => onDownload(backup.id)} disabled={backup.status !== 'completed'} className="p-1.5 rounded-lg text-zinc-500 hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Download"><Download size={15} /></button>
                        <button onClick={() => onRestore(backup.id)} disabled={backup.status !== 'completed'} className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Restore"><RotateCcw size={15} /></button>
                        <button onClick={() => onDelete(backup.id)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {backups.map((backup) => {
          const statusCfg = STATUS_CONFIG[backup.status];
          const isExpanded = expandedId === backup.id;
          return (
            <motion.div key={backup.id} layout className="rounded-xl border bg-zinc-900/50 border-zinc-800 overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : backup.id)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.icon} {backup.status}
                    </span>
                    <span className="text-xs text-zinc-600">{formatDistanceToNow(backup.date, { addSuffix: true })}</span>
                  </div>
                  <div className="text-sm text-zinc-200">{formatSize(backup.size)} &middot; {SCOPE_LABELS[backup.scope]}</div>
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-zinc-800">
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-zinc-500">Date</span><p className="text-zinc-300">{format(backup.date, 'dd MMM yyyy, hh:mm a')}</p></div>
                        <div><span className="text-zinc-500">Type</span><p className="text-zinc-300 capitalize">{backup.type}</p></div>
                        <div><span className="text-zinc-500">Format</span><p className="text-zinc-300 uppercase">{backup.format}</p></div>
                        <div><span className="text-zinc-500">Records</span><p className="text-zinc-300">{backup.recordsCount.toLocaleString()}</p></div>
                      </div>
                      {backup.details && <p className="text-xs text-yellow-400/80 bg-yellow-400/5 rounded-lg px-3 py-2">{backup.details}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => onDownload(backup.id)} disabled={backup.status !== 'completed'} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-cyan-400 hover:border-cyan-400/30 disabled:opacity-30"><Download size={13} /> Download</button>
                        <button onClick={() => onRestore(backup.id)} disabled={backup.status !== 'completed'} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-400/30 disabled:opacity-30"><RotateCcw size={13} /> Restore</button>
                        <button onClick={() => onDelete(backup.id)} className="flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 rounded-lg border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-400/30"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── RestoreOptions ──
function RestoreOptionsSection({
  backups,
  onRestore,
  selectedBackupId,
  onSelectBackup,
}: {
  backups: BackupEntry[];
  onRestore: (backupId: string, mode: RestoreMode, scope: BackupScope | 'all') => void;
  selectedBackupId: string | null;
  onSelectBackup: (id: string | null) => void;
}) {
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [scope, setScope] = useState<BackupScope | 'all'>('all');
  const [showPreview, setShowPreview] = useState(false);
  const completedBackups = backups.filter((b) => b.status === 'completed');
  const selectedBackup = completedBackups.find((b) => b.id === selectedBackupId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="space-y-6">
      <SectionHeader icon={<RotateCcw size={20} />} title="Restore Options" description="Restore your data from a previous backup" />
      <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5 sm:p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Select Backup to Restore</label>
          <select value={selectedBackupId ?? ''} onChange={(e) => onSelectBackup(e.target.value || null)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 appearance-none">
            <option value="">Choose a backup...</option>
            {completedBackups.map((b) => (
              <option key={b.id} value={b.id}>{format(b.date, 'dd MMM yyyy hh:mm a')} - {formatSize(b.size)} ({SCOPE_LABELS[b.scope]})</option>
            ))}
          </select>
        </div>

        {selectedBackup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">What to Restore</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button onClick={() => setScope('all')} className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${scope === 'all' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>All Data</button>
                {(['vouchers', 'ledgers', 'stock', 'settings'] as BackupScope[]).map((s) => (
                  <button key={s} onClick={() => setScope(s)} className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${scope === s ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                    {SCOPE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">Restore Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={() => setMode('merge')} className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${mode === 'merge' ? 'bg-cyan-400/10 border-cyan-400/30' : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'}`}>
                  <div className={`mt-0.5 ${mode === 'merge' ? 'text-cyan-400' : 'text-zinc-500'}`}><RefreshCcw size={18} /></div>
                  <div>
                    <p className={`text-sm font-medium ${mode === 'merge' ? 'text-cyan-400' : 'text-zinc-300'}`}>Merge</p>
                    <p className="text-xs text-zinc-500 mt-1">Add new records, update existing ones</p>
                  </div>
                </button>
                <button onClick={() => setMode('replace')} className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${mode === 'replace' ? 'bg-red-400/10 border-red-400/30' : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600'}`}>
                  <div className={`mt-0.5 ${mode === 'replace' ? 'text-red-400' : 'text-zinc-500'}`}><Trash2 size={18} /></div>
                  <div>
                    <p className={`text-sm font-medium ${mode === 'replace' ? 'text-red-400' : 'text-zinc-300'}`}>Replace</p>
                    <p className="text-xs text-zinc-500 mt-1">Wipe current data and restore from backup</p>
                  </div>
                </button>
              </div>
              {mode === 'replace' && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 mt-3 rounded-lg bg-red-400/5 border border-red-400/20 px-4 py-3">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-400/80">This will permanently delete all current data and replace it with the backup. This action cannot be undone.</p>
                </motion.div>
              )}
            </div>

            <div>
              <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors">
                <Eye size={16} /> {showPreview ? 'Hide' : 'Show'} Preview of Changes
                {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AnimatePresence>
                {showPreview && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 rounded-lg border border-zinc-700/50 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-zinc-800/50 border-b border-zinc-700/50">
                            <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Table</th>
                            <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Current</th>
                            <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Backup</th>
                            <th className="text-center px-4 py-2.5 text-zinc-500 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {RESTORE_PREVIEW_DATA.map((row) => (
                            <tr key={row.table} className="hover:bg-zinc-800/20">
                              <td className="px-4 py-2.5 text-zinc-300">{row.table}</td>
                              <td className="px-4 py-2.5 text-zinc-400 text-right">{row.currentRecords.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-zinc-400 text-right">{row.backupRecords.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${row.action === 'add' ? 'bg-emerald-400/10 text-emerald-400' : row.action === 'update' ? 'bg-cyan-400/10 text-cyan-400' : row.action === 'delete' ? 'bg-red-400/10 text-red-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                  {row.action === 'add' && `+${(row.backupRecords - row.currentRecords).toLocaleString()}`}
                                  {row.action === 'update' && `~${row.backupRecords.toLocaleString()}`}
                                  {row.action === 'unchanged' && 'No change'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      <Shield size={12} />
                      <span>Estimated <strong className="text-zinc-300">13,452</strong> records affected</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={() => { if (selectedBackupId) onRestore(selectedBackupId, mode, scope); }} className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3 px-6 transition-all">
              <RotateCcw size={18} /> Restore from Backup
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── ImportExport ──
function ImportExportSection() {
  const [importSource, setImportSource] = useState<'tally' | 'other'>('tally');
  const [importFormat, setImportFormat] = useState<'xml' | 'json'>('xml');
  const [selectedVoucherTypes, setSelectedVoucherTypes] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'excel' | 'pdf'>('json');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const toggleVoucherType = (type: string) => {
    setSelectedVoucherTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);
  };

  const handleImport = () => {
    setIsImporting(true);
    setTimeout(() => {
      setIsImporting(false);
      toast.success(`Data imported successfully from ${importSource === 'tally' ? 'Tally' : 'external source'}`);
    }, 2000);
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      toast.success(`Data exported as ${exportFormat.toUpperCase()}`);
    }, 1500);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-6">
      <SectionHeader icon={<FolderOpen size={20} />} title="Import / Export" description="Import data from other software or export your data" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import */}
        <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400"><Import size={18} /></div>
            <h3 className="text-sm font-semibold text-zinc-200">Import Data</h3>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Source</label>
            <div className="flex gap-2">
              <button onClick={() => setImportSource('tally')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${importSource === 'tally' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                Tally
              </button>
              <button onClick={() => setImportSource('other')} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${importSource === 'other' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                Other Software
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">File Format</label>
            <div className="flex gap-2">
              <button onClick={() => setImportFormat('xml')} className={`flex items-center gap-2 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${importFormat === 'xml' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                <FileText size={14} /> XML
              </button>
              <button onClick={() => setImportFormat('json')} className={`flex items-center gap-2 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${importFormat === 'json' ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                <FileJson size={14} /> JSON
              </button>
            </div>
          </div>
          <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors cursor-pointer">
            <Upload size={24} className="mx-auto text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-400">Drag & drop your file here or <span className="text-cyan-400">browse</span></p>
            <p className="text-xs text-zinc-600 mt-1">Supports .xml, .json up to 50MB</p>
          </div>
          <button onClick={handleImport} disabled={isImporting} className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold py-2.5 px-6 transition-all disabled:opacity-50">
            {isImporting ? (<><Loader2 size={16} className="animate-spin" /> Importing...</>) : (<><Upload size={16} /> Import Data</>)}
          </button>
        </div>

        {/* Export */}
        <div className="rounded-xl border bg-zinc-900/50 border-zinc-800 p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400"><Download size={18} /></div>
            <h3 className="text-sm font-semibold text-zinc-200">Export Data</h3>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'json', icon: <FileJson size={14} />, label: 'JSON' },
                { key: 'csv', icon: <FileText size={14} />, label: 'CSV' },
                { key: 'excel', icon: <FileSpreadsheet size={14} />, label: 'Excel' },
                { key: 'pdf', icon: <FileText size={14} />, label: 'PDF' },
              ] as const).map((f) => (
                <button key={f.key} onClick={() => setExportFormat(f.key)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${exportFormat === f.key ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'}`}>
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Voucher Types (Optional Filter)</label>
            <div className="flex flex-wrap gap-1.5">
              {VOUCHER_TYPES.map((type) => (
                <button key={type} onClick={() => toggleVoucherType(type)} className={`text-xs px-2.5 py-1 rounded-full border transition-all ${selectedVoucherTypes.includes(type) ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:border-zinc-600'}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleExport} disabled={isExporting} className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2.5 px-6 transition-all disabled:opacity-50">
            {isExporting ? (<><Loader2 size={16} className="animate-spin" /> Exporting...</>) : (<><Download size={16} /> Export Data</>)}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Main Page Component ──
// ══════════════════════════════════════════════════════════════════════════════

export default function DataBackupRestorePage() {
  const [backups, setBackups] = useState<BackupEntry[]>(INITIAL_BACKUPS);
  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>({
    enabled: true,
    frequency: 'daily',
    timeOfDay: '02:00',
    retentionCount: 30,
    destination: 'local',
    emailNotification: true,
    lastRun: subHours(new Date(), 2),
    nextScheduled: new Date(Date.now() + 86400000),
  });

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [selectedRestoreBackupId, setSelectedRestoreBackupId] = useState<string | null>(null);
  const [showDetailsId, setShowDetailsId] = useState<string | null>(null);

  // ── Backup Handler ──
  const handleBackupStart = useCallback((scope: BackupScope, format: BackupFormat) => {
    setIsBackingUp(true);
    setBackupProgress(0);

    const newBackup: BackupEntry = {
      id: generateBackupId(),
      date: new Date(),
      size: estimateSize(scope),
      type: 'manual',
      scope,
      status: 'in-progress',
      format,
      recordsCount: 0,
    };

    setBackups((prev) => [newBackup, ...prev]);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setIsBackingUp(false);

        setBackups((prev) =>
          prev.map((b) =>
            b.id === newBackup.id
              ? { ...b, status: 'completed', date: new Date(), recordsCount: Math.floor(Math.random() * 15000) + 1000 }
              : b
          )
        );

        toast.success('Backup completed successfully!');
      }
      setBackupProgress(progress);
    }, 300);
  }, []);

  // ── Download Handler ──
  const handleDownload = useCallback((id: string) => {
    const backup = backups.find((b) => b.id === id);
    if (!backup) return;

    const data = {
      backupId: backup.id,
      date: backup.date.toISOString(),
      scope: backup.scope,
      format: backup.format,
      recordsCount: backup.recordsCount,
      sampleData: { message: 'This is a mock backup file for demonstration purposes.' },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${backup.id}-${format(backup.date, 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Backup downloaded!');
  }, [backups]);

  // ── Restore Handler ──
  const handleRestore = useCallback((backupId: string, mode: RestoreMode, scope: BackupScope | 'all') => {
    const backup = backups.find((b) => b.id === backupId);
    if (!backup) return;

    toast.success(`Restore started (${mode} mode). Data will be restored from backup ${backup.id}.`);
    // In a real app, this would trigger the restore process
  }, [backups]);

  // ── Delete Handler ──
  const handleDelete = useCallback((id: string) => {
    setBackups((prev) => prev.filter((b) => b.id !== id));
    toast.success('Backup deleted');
  }, []);

  // ── View Details Handler ──
  const handleViewDetails = useCallback((id: string) => {
    const backup = backups.find((b) => b.id === id);
    if (!backup) return;
    setShowDetailsId(id);
    toast(`Backup ${backup.id}: ${SCOPE_LABELS[backup.scope]}, ${formatSize(backup.size)}, ${backup.recordsCount.toLocaleString()} records`, { icon: '📋' });
  }, [backups]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Page Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
              <Database size={22} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100">Data Backup & Restore</h1>
              <p className="text-sm text-zinc-500">Secure your accounting data with automated backups</p>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        <div className="space-y-12">
          <BackupDashboardSection backups={backups} autoConfig={autoConfig} />
          <ManualBackupSection onBackupStart={handleBackupStart} isBackingUp={isBackingUp} backupProgress={backupProgress} />
          <AutoBackupSettingsSection config={autoConfig} onChange={setAutoConfig} />
          <BackupHistorySection backups={backups} onDownload={handleDownload} onRestore={handleRestore} onDelete={handleDelete} onViewDetails={handleViewDetails} />
          <RestoreOptionsSection backups={backups} onRestore={handleRestore} selectedBackupId={selectedRestoreBackupId} onSelectBackup={setSelectedRestoreBackupId} />
          <ImportExportSection />
        </div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-12 pt-6 border-t border-zinc-800/50 text-center">
          <p className="text-xs text-zinc-600">Data Backup & Restore &middot; Tally Web Dashboard &middot; All data is stored locally in your browser</p>
        </motion.div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Pencil, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { deleteLocalNameMapping, getLocalNameMappings, getCanonicalMappingSource, upsertLocalNameMapping } from '@/features/nameMappings/store';
import type { NameMappingRecord, NameMappingType } from '@/features/nameMappings/types';

const FILTERS: { key: 'all' | NameMappingType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'party', label: 'Party' },
    { key: 'item', label: 'Item' },
    { key: 'bank_party', label: 'Bank Narration' },
];

function formatType(value: NameMappingType) {
    if (value === 'bank_party') return 'Bank to Party';
    if (value === 'item') return 'Item';
    return 'Party';
}

export default function MappingMasterPage() {
    const { selectedCompany, user } = useAuth() as any;
    const [filter, setFilter] = useState<'all' | NameMappingType>('all');
    const [records, setRecords] = useState<NameMappingRecord[]>([]);
    const [editingKey, setEditingKey] = useState<string>('');
    const [draft, setDraft] = useState<Partial<NameMappingRecord>>({});

    const reload = () => {
        if (!user?.id || !selectedCompany?.id) {
            setRecords([]);
            return;
        }

        setRecords(getLocalNameMappings(user.id, selectedCompany.id));
    };

    useEffect(() => {
        reload();
    }, [user?.id, selectedCompany?.id]);

    const visible = useMemo(() => {
        return records.filter((item) => filter === 'all' || item.mappingType === filter);
    }, [records, filter]);

    const startEdit = (record: NameMappingRecord) => {
        const key = `${record.mappingType}|${record.normalizedSource}`;
        setEditingKey(key);
        setDraft(record);
    };

    const cancelEdit = () => {
        setEditingKey('');
        setDraft({});
    };

    const saveEdit = () => {
        if (!user?.id || !selectedCompany?.id || !draft.mappingType) return;
        const sourceText = String(draft.sourceText || '').trim();
        const mappedDisplayName = String(draft.mappedDisplayName || '').trim();
        if (!sourceText || !mappedDisplayName) {
            toast.error('Source and mapped name are required');
            return;
        }

        upsertLocalNameMapping({
            userId: user.id,
            clientId: selectedCompany.id,
            mappingType: draft.mappingType,
            sourceText,
            normalizedSource: getCanonicalMappingSource(sourceText, draft.mappingType),
            mappedEntityType: draft.mappedEntityType || (draft.mappingType === 'item' ? 'stock_item' : 'ledger'),
            mappedEntityId: draft.mappedEntityId,
            mappedDisplayName,
            confidence: Number(draft.confidence || 100),
            status: (draft.status || 'approved') as any,
            reason: draft.reason || 'Edited in mapping master',
            createdAt: draft.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
        });

        toast.success('Mapping updated');
        cancelEdit();
        reload();
    };

    const deleteRow = (record: NameMappingRecord) => {
        if (!user?.id || !selectedCompany?.id) return;
        deleteLocalNameMapping(user.id, selectedCompany.id, record.mappingType, record.normalizedSource);
        toast.success('Mapping deleted');
        reload();
    };

    const approveRow = (record: NameMappingRecord) => {
        if (!user?.id || !selectedCompany?.id) return;
        upsertLocalNameMapping({
            ...record,
            userId: user.id,
            clientId: selectedCompany.id,
            status: 'approved',
            updatedAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
        });
        toast.success('Mapping approved');
        reload();
    };

    if (!selectedCompany) {
        return null;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-black text-[var(--on-surface)]">Mapping Master</h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Party, item, aur bank narration mappings ko yahan review, edit, delete, aur approve kar sakte ho.</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                    <button
                        key={item.key}
                        onClick={() => setFilter(item.key)}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold border ${filter === item.key ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--on-surface)]'}`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 gap-3 px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)] bg-[var(--surface-variant)]/40">
                    <div className="col-span-2">Type</div>
                    <div className="col-span-3">Source</div>
                    <div className="col-span-3">Mapped To</div>
                    <div className="col-span-1">Score</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-2 text-right">Actions</div>
                </div>

                {visible.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No mappings saved for this company yet.</div>
                )}

                {visible.map((record) => {
                    const rowKey = `${record.mappingType}|${record.normalizedSource}`;
                    const isEditing = editingKey === rowKey;
                    return (
                        <div key={rowKey} className="grid grid-cols-12 gap-3 px-4 py-3 border-t border-[var(--border)]/60 items-center text-sm">
                            <div className="col-span-2 font-semibold text-[var(--on-surface)]">{formatType(record.mappingType)}</div>
                            <div className="col-span-3">
                                {isEditing ? (
                                    <input
                                        value={String(draft.sourceText || '')}
                                        onChange={(event) => setDraft((prev) => ({ ...prev, sourceText: event.target.value }))}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2"
                                    />
                                ) : (
                                    <div className="text-[var(--on-surface)]">{record.sourceText}</div>
                                )}
                            </div>
                            <div className="col-span-3">
                                {isEditing ? (
                                    <input
                                        value={String(draft.mappedDisplayName || '')}
                                        onChange={(event) => setDraft((prev) => ({ ...prev, mappedDisplayName: event.target.value }))}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-variant)] px-3 py-2"
                                    />
                                ) : (
                                    <div className="text-[var(--on-surface)] font-medium">{record.mappedDisplayName}</div>
                                )}
                            </div>
                            <div className="col-span-1 text-[var(--text-muted)]">{Math.round(Number(record.confidence || 0))}%</div>
                            <div className="col-span-1">
                                {isEditing ? (
                                    <select
                                        value={String(draft.status || 'approved')}
                                        onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as any }))}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-variant)] px-2 py-2 text-xs"
                                    >
                                        <option value="approved">Approved</option>
                                        <option value="suggested">Suggested</option>
                                    </select>
                                ) : (
                                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {record.status}
                                    </span>
                                )}
                            </div>
                            <div className="col-span-2 flex items-center justify-end gap-2">
                                {isEditing ? (
                                    <>
                                        <button onClick={saveEdit} className="p-2 rounded-lg bg-[var(--primary)] text-white"><Save size={14} /></button>
                                        <button onClick={cancelEdit} className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)]"><X size={14} /></button>
                                    </>
                                ) : (
                                    <>
                                        {record.status === 'suggested' && (
                                            <button onClick={() => approveRow(record)} className="p-2 rounded-lg bg-emerald-600 text-white" title="Approve mapping">
                                                <CheckCircle2 size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => startEdit(record)} className="p-2 rounded-lg border border-[var(--border)] text-[var(--on-surface)]">
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => deleteRow(record)} className="p-2 rounded-lg border border-red-200 text-red-600">
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

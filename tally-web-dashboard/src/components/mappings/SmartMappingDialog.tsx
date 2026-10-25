import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, PlusCircle, X } from 'lucide-react';
import type { MappingCandidate, NameMappingType } from '@/features/nameMappings/types';

export type SmartMappingDraft = {
    id: string;
    mappingType: NameMappingType;
    sourceText: string;
    normalizedSource: string;
    itemIndexes?: number[];
    isParty?: boolean;
    matches: MappingCandidate[];
    selectedMode: 'map' | 'create';
    selectedName: string;
    selectedEntityId?: string;
    createName: string;
};

function labelForType(mappingType: NameMappingType) {
    if (mappingType === 'item') return 'Item Mapping';
    if (mappingType === 'bank_party') return 'Bank Party Mapping';
    return 'Party Mapping';
}

export default function SmartMappingDialog({
    isOpen,
    drafts,
    partyOptions,
    itemOptions,
    onChangeDraft,
    onClose,
    onConfirm,
    confirming,
}: {
    isOpen: boolean;
    drafts: SmartMappingDraft[];
    partyOptions: string[];
    itemOptions: string[];
    onChangeDraft: (id: string, patch: Partial<SmartMappingDraft>) => void;
    onClose: () => void;
    onConfirm: () => void;
    confirming?: boolean;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        className="relative w-full sm:max-w-4xl max-h-[92vh] overflow-hidden rounded-t-[28px] sm:rounded-[28px] bg-[var(--surface)] border border-[var(--border)] shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border)]">
                            <div>
                                <h2 className="text-lg font-black text-[var(--on-surface)]">Smart Name Mapping</h2>
                                <p className="text-sm text-[var(--text-muted)]">Unknown ya similar names ko existing master se map karo, ya naya create karke memory me save karo.</p>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--on-surface)]">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="max-h-[68vh] overflow-y-auto p-5 space-y-4">
                            {drafts.map((draft) => {
                                const options = draft.mappingType === 'item' ? itemOptions : partyOptions;
                                return (
                                    <div key={draft.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-variant)]/40 p-4 space-y-4">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div>
                                                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--primary)]">{labelForType(draft.mappingType)}</p>
                                                <p className="text-sm font-semibold text-[var(--on-surface)] mt-1">Detected: {draft.sourceText}</p>
                                            </div>
                                            {draft.matches[0] && (
                                                <div className="text-right text-xs text-[var(--text-muted)]">
                                                    <div>Best match: <span className="font-semibold text-[var(--on-surface)]">{draft.matches[0].displayName}</span></div>
                                                    <div>{draft.matches[0].confidence}% • {draft.matches[0].reason}</div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => onChangeDraft(draft.id, { selectedMode: 'map' })}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${draft.selectedMode === 'map' ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--on-surface)]'}`}
                                            >
                                                <CheckCircle2 size={14} className="inline mr-1" /> Map Existing
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onChangeDraft(draft.id, { selectedMode: 'create' })}
                                                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${draft.selectedMode === 'create' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-[var(--border)] text-[var(--on-surface)]'}`}
                                            >
                                                <PlusCircle size={14} className="inline mr-1" /> Create New
                                            </button>
                                        </div>

                                        {draft.selectedMode === 'map' ? (
                                            <div className="grid md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Suggested Matches</label>
                                                    <select
                                                        value={draft.selectedName}
                                                        onChange={(event) => onChangeDraft(draft.id, { selectedName: event.target.value })}
                                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--on-surface)]"
                                                    >
                                                        <option value="">Select mapping</option>
                                                        {draft.matches.map((candidate) => (
                                                            <option key={`${draft.id}-${candidate.displayName}`} value={candidate.displayName}>
                                                                {candidate.displayName} ({candidate.confidence}%)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">All Masters</label>
                                                    <input
                                                        list={`mapping-options-${draft.id}`}
                                                        value={draft.selectedName}
                                                        onChange={(event) => onChangeDraft(draft.id, { selectedName: event.target.value })}
                                                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--on-surface)]"
                                                        placeholder="Type or choose existing master"
                                                    />
                                                    <datalist id={`mapping-options-${draft.id}`}>
                                                        {options.map((name) => (
                                                            <option key={`${draft.id}-all-${name}`} value={name} />
                                                        ))}
                                                    </datalist>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">New Master Name</label>
                                                <input
                                                    value={draft.createName}
                                                    onChange={(event) => onChangeDraft(draft.id, { createName: event.target.value })}
                                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--on-surface)]"
                                                    placeholder="Enter new party/item name"
                                                />
                                                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Ye name future me same text ke liye memory me save ho jayega.</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-3 justify-end px-5 py-4 border-t border-[var(--border)] bg-[var(--surface)]">
                            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--on-surface)]">
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={confirming}
                                className="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-bold disabled:opacity-60"
                            >
                                {confirming ? 'Saving...' : 'Apply Mapping & Continue'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

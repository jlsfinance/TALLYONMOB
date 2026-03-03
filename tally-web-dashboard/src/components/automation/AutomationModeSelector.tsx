import type { AutomationMode } from '@/features/automation/mode';

export default function AutomationModeSelector({
    mode,
    onChange
}: {
    mode: AutomationMode;
    onChange: (mode: AutomationMode) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]">Mode</label>
            <select
                value={mode}
                onChange={(event) => onChange(event.target.value as AutomationMode)}
                className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--on-surface)]"
            >
                <option value="local">Local</option>
                <option value="hybrid">Hybrid (Local -&gt; Cloud fallback)</option>
            </select>
        </div>
    );
}


export type AutomationMode = 'local' | 'hybrid';

const STORAGE_KEY = 'automation_mode_v1';

export function getAutomationMode(): AutomationMode {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'local' || saved === 'hybrid') {
        return saved;
    }
    return 'hybrid';
}

export function setAutomationMode(mode: AutomationMode) {
    localStorage.setItem(STORAGE_KEY, mode);
}

export function isCloudAllowed(mode: AutomationMode) {
    return mode === 'hybrid';
}

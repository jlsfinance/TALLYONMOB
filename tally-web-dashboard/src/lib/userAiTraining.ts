const CURRENT_USER_ID_KEY = 'currentUserId';
const AI_TRAINING_PREFIX = 'ai_training_user_';
const MAX_TRAINING_CHARS = 4000;

function normalizeTrainingText(value: string): string {
    return String(value || '').trim().slice(0, MAX_TRAINING_CHARS);
}

function readFromStorage(storage: Storage | null, key: string): string {
    if (!storage) return '';

    try {
        return String(storage.getItem(key) || '').trim();
    } catch {
        return '';
    }
}

function writeToStorage(storage: Storage | null, key: string, value: string) {
    if (!storage) return;

    try {
        if (value) {
            storage.setItem(key, value);
        } else {
            storage.removeItem(key);
        }
    } catch {
    }
}

function safeRead(key: string): string {
    if (typeof window === 'undefined') return '';

    const sessionValue = readFromStorage(window.sessionStorage, key);
    if (sessionValue) {
        return sessionValue;
    }

    const legacyValue = readFromStorage(window.localStorage, key);
    if (legacyValue) {
        writeToStorage(window.sessionStorage, key, legacyValue);
        writeToStorage(window.localStorage, key, '');
    }

    return legacyValue;
}

function safeWrite(key: string, value: string) {
    if (typeof window === 'undefined') return;

    const normalized = normalizeTrainingText(value);
    writeToStorage(window.sessionStorage, key, normalized);
    writeToStorage(window.localStorage, key, '');
}

function resolveUserId(userId?: string | null): string {
    const direct = String(userId || '').trim();
    if (direct) return direct;
    return safeRead(CURRENT_USER_ID_KEY);
}

export { normalizeTrainingText };

export function getUserAiTraining(userId?: string | null): string {
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) return '';
    return safeRead(`${AI_TRAINING_PREFIX}${resolvedUserId}`);
}

export function saveUserAiTraining(userId: string, instructions: string) {
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) return;
    safeWrite(`${AI_TRAINING_PREFIX}${resolvedUserId}`, instructions);
}

export function clearUserAiTraining(userId?: string | null) {
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId || typeof window === 'undefined') return;
    writeToStorage(window.sessionStorage, `${AI_TRAINING_PREFIX}${resolvedUserId}`, '');
    writeToStorage(window.localStorage, `${AI_TRAINING_PREFIX}${resolvedUserId}`, '');
}

export function hasUserAiTraining(userId?: string | null): boolean {
    return Boolean(getUserAiTraining(userId));
}

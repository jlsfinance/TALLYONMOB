const CURRENT_USER_ID_KEY = 'currentUserId';
const GEMINI_KEY_PREFIX = 'gemini_api_key_user_';

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

    const normalized = String(value || '').trim();
    writeToStorage(window.sessionStorage, key, normalized);
    writeToStorage(window.localStorage, key, '');
}

function resolveUserId(userId?: string | null): string {
    const direct = String(userId || '').trim();
    if (direct) return direct;
    return safeRead(CURRENT_USER_ID_KEY);
}

export function getUserGeminiApiKey(userId?: string | null): string {
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) return '';
    return safeRead(`${GEMINI_KEY_PREFIX}${resolvedUserId}`);
}

export function saveUserGeminiApiKey(userId: string, apiKey: string) {
    const resolvedUserId = resolveUserId(userId);
    if (!resolvedUserId) return;
    safeWrite(`${GEMINI_KEY_PREFIX}${resolvedUserId}`, apiKey);
}

export function hasUserGeminiApiKey(userId?: string | null): boolean {
    return Boolean(getUserGeminiApiKey(userId));
}

export function maskGeminiApiKey(apiKey: string): string {
    const normalized = String(apiKey || '').trim();
    if (!normalized) return '';
    if (normalized.length <= 8) return '********';
    return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}
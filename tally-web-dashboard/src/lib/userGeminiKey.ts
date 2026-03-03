const CURRENT_USER_ID_KEY = 'currentUserId';
const GEMINI_KEY_PREFIX = 'gemini_api_key_user_';

function safeRead(key: string): string {
    if (typeof window === 'undefined') return '';
    return String(localStorage.getItem(key) || '').trim();
}

function safeWrite(key: string, value: string) {
    if (typeof window === 'undefined') return;
    const normalized = String(value || '').trim();
    if (normalized) {
        localStorage.setItem(key, normalized);
    } else {
        localStorage.removeItem(key);
    }
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

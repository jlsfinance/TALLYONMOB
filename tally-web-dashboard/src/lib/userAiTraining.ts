const CURRENT_USER_ID_KEY = 'currentUserId';
const AI_TRAINING_PREFIX = 'ai_training_user_';
const MAX_TRAINING_CHARS = 4000;

function safeRead(key: string): string {
    if (typeof window === 'undefined') return '';
    return String(localStorage.getItem(key) || '').trim();
}

function safeWrite(key: string, value: string) {
    if (typeof window === 'undefined') return;
    const normalized = normalizeTrainingText(value);
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

export function normalizeTrainingText(value: string): string {
    return String(value || '').trim().slice(0, MAX_TRAINING_CHARS);
}

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
    localStorage.removeItem(`${AI_TRAINING_PREFIX}${resolvedUserId}`);
}

export function hasUserAiTraining(userId?: string | null): boolean {
    return Boolean(getUserAiTraining(userId));
}
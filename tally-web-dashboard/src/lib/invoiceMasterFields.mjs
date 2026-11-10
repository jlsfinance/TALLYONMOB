export const masterNameKey = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
export function resolveHsn(...values) {
    for (const value of values) {
        const code = String(value ?? '').trim();
        if (/^\d{2}(?:\d{2}){0,3}$/.test(code)) return code;
    }
    return '';
}
export const summaryHsn = code => resolveHsn(code) || 'Not available';

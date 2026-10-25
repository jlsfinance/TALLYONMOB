export function normalizeNarration(value: string): string {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

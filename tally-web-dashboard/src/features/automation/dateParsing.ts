const MONTH_LOOKUP: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

function buildNormalizedDate(year: number, month: number, day: number): string {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return '';
    }

    if (year < 100) {
        year += 2000;
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) {
        return '';
    }

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMonthNamedDate(raw: string): string {
    const normalized = String(raw || '')
        .replace(/,/g, ' ')
        .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let match = normalized.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{2,4})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[2].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[3]), month, Number(match[1])) : '';
    }

    match = normalized.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})\s+(\d{2,4})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[1].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[3]), month, Number(match[2])) : '';
    }

    match = normalized.match(/^(\d{4})\s+([a-zA-Z]{3,9})\s+(\d{1,2})(?:\s+.*)?$/);
    if (match) {
        const month = MONTH_LOOKUP[match[2].toLowerCase()];
        return month ? buildNormalizedDate(Number(match[1]), month, Number(match[3])) : '';
    }

    return '';
}

export function normalizeDocumentDateInput(value: unknown, preferDayFirst = true): string {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const isoDateTime = raw.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[T\s].*)?$/);
    if (isoDateTime) {
        return buildNormalizedDate(Number(isoDateTime[1]), Number(isoDateTime[2]), Number(isoDateTime[3]));
    }

    const compact = raw.match(/^(\d{8})$/);
    if (compact) {
        const digits = compact[1];
        const leadingYear = Number(digits.slice(0, 4));

        if (leadingYear >= 1900 && leadingYear <= 2100) {
            return buildNormalizedDate(leadingYear, Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
        }

        return buildNormalizedDate(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
    }

    const numeric = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+.*)?$/);
    if (numeric) {
        const first = Number(numeric[1]);
        const second = Number(numeric[2]);
        const year = Number(numeric[3]);

        if (first > 12) {
            return buildNormalizedDate(year, second, first);
        }

        if (second > 12) {
            return buildNormalizedDate(year, first, second);
        }

        return preferDayFirst
            ? buildNormalizedDate(year, second, first)
            : buildNormalizedDate(year, first, second);
    }

    const monthNamed = parseMonthNamedDate(raw);
    if (monthNamed) {
        return monthNamed;
    }

    if (/[a-zA-Z]/.test(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return buildNormalizedDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
        }
    }

    return '';
}

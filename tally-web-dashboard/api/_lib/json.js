export function stripCodeFences(value) {
    if (typeof value !== "string") return "";
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function extractFirstJsonBlock(value) {
    if (typeof value !== "string") return "";
    const trimmed = stripCodeFences(value);
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
        return trimmed.slice(firstObject, lastObject + 1);
    }
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray >= 0 && lastArray > firstArray) {
        return trimmed.slice(firstArray, lastArray + 1);
    }
    return trimmed;
}

export function safeJsonParse(input) {
    if (input === null || input === undefined) {
        return { ok: false, data: null, error: "empty_input" };
    }

    if (typeof input === "object") {
        return { ok: true, data: input, error: null };
    }

    const candidates = [];
    const asString = String(input).trim();
    if (!asString) {
        return { ok: false, data: null, error: "empty_string" };
    }

    candidates.push(asString);
    const noFence = stripCodeFences(asString);
    if (noFence !== asString) {
        candidates.push(noFence);
    }

    const extracted = extractFirstJsonBlock(asString);
    if (extracted && !candidates.includes(extracted)) {
        candidates.push(extracted);
    }

    for (const candidate of candidates) {
        try {
            return { ok: true, data: JSON.parse(candidate), error: null };
        } catch (_) {
            // Try next candidate
        }
    }

    return { ok: false, data: null, error: "invalid_json" };
}

export function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function asArray(value) {
    return Array.isArray(value) ? value : [];
}

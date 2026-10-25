export function normalizeText(value) {
    return String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function createBigrams(text) {
    const value = ` ${normalizeText(text)} `;
    const grams = new Set();
    for (let i = 0; i < value.length - 1; i += 1) {
        grams.add(value.slice(i, i + 2));
    }
    return grams;
}

export function similarityScore(left, right) {
    const a = createBigrams(left);
    const b = createBigrams(right);

    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    for (const gram of a) {
        if (b.has(gram)) intersection += 1;
    }

    const dice = (2 * intersection) / (a.size + b.size);
    return Math.round(dice * 100);
}

export function bestFuzzyLedgerMatch(narration, ledgers) {
    let best = { ledgerName: "", confidence: 0, reason: "No fuzzy match" };

    for (const ledgerName of ledgers || []) {
        const score = similarityScore(narration, ledgerName);
        if (score > best.confidence) {
            best = {
                ledgerName,
                confidence: score,
                reason: "Fuzzy similarity match"
            };
        }
    }

    return best;
}

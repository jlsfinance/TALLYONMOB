import { normalizeNarration } from "./normalize";

function createBigrams(text: string): Set<string> {
    const value = ` ${normalizeNarration(text)} `;
    const result = new Set<string>();

    for (let i = 0; i < value.length - 1; i += 1) {
        result.add(value.slice(i, i + 2));
    }

    return result;
}

export function similarityScore(left: string, right: string): number {
    const a = createBigrams(left);
    const b = createBigrams(right);

    if (a.size === 0 || b.size === 0) return 0;

    let overlap = 0;
    a.forEach((gram) => {
        if (b.has(gram)) overlap += 1;
    });

    const dice = (2 * overlap) / (a.size + b.size);
    return Math.round(dice * 100);
}

export function bestFuzzyLedgerMatch(narration: string, ledgers: string[]) {
    let best = {
        ledgerName: "",
        confidence: 0,
        reason: "No fuzzy match"
    };

    ledgers.forEach((ledger) => {
        const score = similarityScore(narration, ledger);
        if (score > best.confidence) {
            best = {
                ledgerName: ledger,
                confidence: score,
                reason: "Fuzzy match score"
            };
        }
    });

    return best;
}

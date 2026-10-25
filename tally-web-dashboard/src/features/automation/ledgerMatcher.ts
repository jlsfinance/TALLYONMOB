import { matchLedgerWithGemini } from "@/lib/GeminiService";
import { bestFuzzyLedgerMatch } from "./fuzzy";
import { normalizeNarration } from "./normalize";
import type { BankTransactionRow, LedgerMappingRecord, LedgerSuggestion } from "./types";

const MAPPING_STOP_WORDS = new Set([
    "UPI", "NEFT", "RTGS", "IMPS", "BANK", "PAYMENT", "TRANSFER", "TRF", "REF", "UTR", "CHQ", "CHEQUE", "DEBIT", "CREDIT", "DR", "CR", "TXN", "TRANSACTION", "MOBILE", "INTERNET", "SALARY", "INCOME", "EXPENSE", "ACH", "ECS"
]);

function scoreExactMatch(narration: string, ledgers: string[]): string | null {
    const normalizedNarration = normalizeNarration(narration);
    const paddedNarration = ` ${normalizedNarration} `;

    for (const ledger of ledgers) {
        const normalizedLedger = normalizeNarration(ledger);
        if (!normalizedLedger) continue;

        if (normalizedNarration === normalizedLedger) {
            return ledger;
        }

        if (paddedNarration.includes(` ${normalizedLedger} `)) {
            return ledger;
        }
    }

    return null;
}

function tokenize(value: string): string[] {
    return normalizeNarration(value)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
}

function overlapRatio(left: string, right: string): number {
    const leftTokens = tokenize(left);
    const rightTokens = tokenize(right);

    if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

    const leftSet = new Set(leftTokens);
    const rightSet = new Set(rightTokens);

    let overlap = 0;
    leftSet.forEach((token) => {
        if (rightSet.has(token)) overlap += 1;
    });

    return overlap / Math.max(leftSet.size, rightSet.size);
}

export function deriveMappingKeyword(narration: string): string {
    const tokens = tokenize(narration);

    const useful = tokens.filter((token) => {
        if (token.length < 3) return false;
        if (/^\d+$/.test(token)) return false;
        return !MAPPING_STOP_WORDS.has(token);
    });

    const selected = (useful.length > 0 ? useful : tokens.filter((token) => !/^\d+$/.test(token))).slice(0, 6);
    return selected.join(" ").trim();
}

function findSavedMapping(
    normalizedNarration: string,
    mappings: LedgerMappingRecord[]
): LedgerMappingRecord | null {
    const narration = normalizeNarration(normalizedNarration);
    const narrationKeyword = deriveMappingKeyword(narration);

    let best: { mapping: LedgerMappingRecord | null; score: number } = { mapping: null, score: -1 };

    mappings.forEach((mapping) => {
        const keyword = normalizeNarration(mapping.normalizedKeyword || "");
        if (!keyword) return;

        let score = -1;

        if (narration.includes(keyword)) {
            score = 1000 + keyword.length;
        } else if (narrationKeyword && (keyword.includes(narrationKeyword) || narrationKeyword.includes(keyword))) {
            score = 600 + Math.min(keyword.length, narrationKeyword.length);
        } else {
            const ratio = overlapRatio(narration, keyword);
            if (ratio >= 0.6) {
                score = Math.round(ratio * 100);
            }
        }

        if (score > best.score) {
            best = { mapping, score };
        }
    });

    return best.mapping;
}

export function manualLedgerSuggestion(ledgerName: string): LedgerSuggestion {
    return {
        ledgerName,
        confidence: 100,
        reason: "Manual selection",
        stage: "manual"
    };
}

export async function suggestLedgerHybrid({
    row,
    ledgers,
    mappings,
    enableGemini = true
}: {
    row: BankTransactionRow;
    ledgers: string[];
    mappings: LedgerMappingRecord[];
    enableGemini?: boolean;
}): Promise<LedgerSuggestion> {
    const exactLedger = scoreExactMatch(row.narration, ledgers);
    if (exactLedger) {
        return {
            ledgerName: exactLedger,
            confidence: 98,
            reason: "Exact narration-ledger match",
            stage: "exact"
        };
    }

    const mapping = findSavedMapping(row.normalizedNarration, mappings);
    if (mapping) {
        return {
            ledgerName: mapping.ledgerName,
            confidence: 95,
            reason: "Matched from saved ledger mapping",
            stage: "saved_mapping"
        };
    }

    const fuzzy = bestFuzzyLedgerMatch(row.narration, ledgers);
    if (fuzzy.confidence >= 80) {
        return {
            ledgerName: fuzzy.ledgerName,
            confidence: fuzzy.confidence,
            reason: fuzzy.reason,
            stage: "fuzzy"
        };
    }

    if (enableGemini) {
        try {
            const ai = await matchLedgerWithGemini(row.narration, ledgers);
            if (ai?.ledger_name) {
                return {
                    ledgerName: ai.ledger_name,
                    confidence: Number(ai.confidence || 0),
                    reason: ai.reason || "Gemini structured suggestion",
                    stage: "gemini"
                };
            }
        } catch (_) {
            // Fallback to manual state below.
        }
    }

    return {
        ledgerName: fuzzy.ledgerName,
        confidence: fuzzy.confidence,
        reason: "Needs manual review",
        stage: "unmatched"
    };
}

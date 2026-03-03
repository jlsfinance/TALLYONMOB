import { matchLedgerWithGemini } from "@/lib/GeminiService";
import { bestFuzzyLedgerMatch } from "./fuzzy";
import { normalizeNarration } from "./normalize";
import type { BankTransactionRow, LedgerMappingRecord, LedgerSuggestion } from "./types";

function scoreExactMatch(narration: string, ledgers: string[]): string | null {
    const normalizedNarration = normalizeNarration(narration);

    for (const ledger of ledgers) {
        const normalizedLedger = normalizeNarration(ledger);
        if (!normalizedLedger) continue;

        if (normalizedNarration === normalizedLedger) {
            return ledger;
        }

        if (normalizedNarration.includes(` ${normalizedLedger} `) || normalizedNarration.startsWith(`${normalizedLedger} `)) {
            return ledger;
        }
    }

    return null;
}

function findSavedMapping(
    normalizedNarration: string,
    mappings: LedgerMappingRecord[]
): LedgerMappingRecord | null {
    const candidates = mappings
        .filter((mapping) =>
            normalizedNarration.includes(normalizeNarration(mapping.normalizedKeyword || ""))
        )
        .sort((a, b) => (b.normalizedKeyword?.length || 0) - (a.normalizedKeyword?.length || 0));

    return candidates[0] || null;
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

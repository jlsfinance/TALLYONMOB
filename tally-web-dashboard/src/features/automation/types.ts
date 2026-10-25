export type MatchStage =
    | "exact"
    | "saved_mapping"
    | "fuzzy"
    | "gemini"
    | "manual"
    | "unmatched";

export interface BankTransactionRow {
    id: string;
    date: string;
    narration: string;
    normalizedNarration: string;
    debit: number;
    credit: number;
}

export interface LedgerMappingRecord {
    $id?: string;
    userId: string;
    clientId: string;
    normalizedKeyword: string;
    ledgerName: string;
    createdAt: string;
}

export interface LedgerSuggestion {
    ledgerName: string;
    confidence: number;
    reason: string;
    stage: MatchStage;
}

export interface BankPreviewRow extends BankTransactionRow {
    suggestion: LedgerSuggestion;
}

export interface InvoiceDraft {
    gstin: string;
    invoiceNumber: string;
    date: string;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    hsn: string;
    invoiceType: "B2B" | "B2C";
}

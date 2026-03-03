import * as XLSX from "xlsx";
import { normalizeNarration } from "./normalize";
import type { BankTransactionRow } from "./types";

function normalizeHeader(value: string): string {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

function parseAmount(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "")
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "")
        .trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateValue(value: unknown): string {
    if (typeof value === "number") {
        const parts = XLSX.SSF.parse_date_code(value);
        if (!parts) return "";
        const y = String(parts.y).padStart(4, "0");
        const m = String(parts.m).padStart(2, "0");
        const d = String(parts.d).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    const raw = String(value || "").trim();
    if (!raw) return "";

    const ddMmYyyy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (ddMmYyyy) {
        const d = Number(ddMmYyyy[1]);
        const m = Number(ddMmYyyy[2]);
        let y = Number(ddMmYyyy[3]);
        if (y < 100) y += 2000;
        if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
    }

    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
    }

    return raw;
}

function pickValue(row: Record<string, unknown>, aliases: string[]): unknown {
    const normalizedRow = new Map<string, unknown>();
    Object.entries(row).forEach(([key, value]) => {
        normalizedRow.set(normalizeHeader(key), value);
    });

    for (const alias of aliases) {
        const found = normalizedRow.get(normalizeHeader(alias));
        if (found !== undefined && found !== null && String(found).trim() !== "") {
            return found;
        }
    }

    return "";
}

function toObjectRows(input: unknown): Record<string, unknown>[] {
    if (Array.isArray(input)) {
        return input.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
    }

    if (input && typeof input === "object") {
        const asRecord = input as Record<string, unknown>;
        const candidateKeys = ["transactions", "rows", "data", "entries", "statementRows"];
        for (const key of candidateKeys) {
            if (Array.isArray(asRecord[key])) {
                return (asRecord[key] as unknown[]).filter((item) => item && typeof item === "object") as Record<string, unknown>[];
            }
        }
    }

    return [];
}

export function normalizeBankStatementRows(rawRows: Record<string, unknown>[]): BankTransactionRow[] {
    return rawRows
        .map((row, index) => {
            const narration = String(
                pickValue(row, ["narration", "description", "particulars", "remarks", "details", "transaction details"]) || ""
            ).trim();

            let debit = parseAmount(
                pickValue(row, ["debit", "withdrawal", "withdrawals", "dr", "debit amount"])
            );
            let credit = parseAmount(
                pickValue(row, ["credit", "deposit", "deposits", "cr", "credit amount"])
            );

            const amount = parseAmount(pickValue(row, ["amount", "transaction amount", "txn amount", "value"]));
            const txnType = String(
                pickValue(row, ["type", "transaction type", "drcr", "dr/cr", "direction", "entry type"])
            )
                .toLowerCase()
                .trim();

            if (debit === 0 && credit === 0 && amount !== 0) {
                if (txnType.includes("dr") || txnType.includes("debit") || txnType.includes("withdraw")) {
                    debit = Math.abs(amount);
                } else if (txnType.includes("cr") || txnType.includes("credit") || txnType.includes("deposit")) {
                    credit = Math.abs(amount);
                } else if (amount < 0) {
                    debit = Math.abs(amount);
                } else {
                    credit = Math.abs(amount);
                }
            }

            return {
                id: `row-${index + 1}`,
                date: formatDateValue(
                    pickValue(row, ["date", "txn date", "transaction date", "value date"])
                ),
                narration,
                normalizedNarration: normalizeNarration(narration),
                debit: Math.abs(debit),
                credit: Math.abs(credit)
            } as BankTransactionRow;
        })
        .filter((row) => row.narration && (row.debit !== 0 || row.credit !== 0));
}

export function parseBankStatementRowsFromUnknown(input: unknown): BankTransactionRow[] {
    return normalizeBankStatementRows(toObjectRows(input));
}

export function parseBankStatementWorkbook(buffer: ArrayBuffer): BankTransactionRow[] {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return normalizeBankStatementRows(rawRows);
}

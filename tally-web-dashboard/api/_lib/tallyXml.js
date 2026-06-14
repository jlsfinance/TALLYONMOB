import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
});

const VOUCHER_TYPES = ["Sales", "Purchase", "Payment", "Receipt"];
const DEBTOR_GROUPS = ["sundry debtors", "trade receivables"];
const CREDITOR_GROUPS = ["sundry creditors", "trade payables"];
const CASH_BANK_GROUPS = ["cash-in-hand", "cash in hand", "bank accounts", "bank od", "bank occ"];

export function buildTallyEnvelope({ type = "COLLECTION", id, body = "" }) {
    return [
        "<ENVELOPE>",
        "<HEADER>",
        "<VERSION>1</VERSION>",
        "<TALLYREQUEST>Export</TALLYREQUEST>",
        `<TYPE>${escapeXml(type)}</TYPE>`,
        `<ID>${escapeXml(id)}</ID>`,
        "</HEADER>",
        "<BODY>",
        body,
        "</BODY>",
        "</ENVELOPE>",
    ].join("");
}

export function buildCollectionRequest({ collectionName, objectType, fromDate, toDate, companyName, nativeMethods = [] }) {
    const methodTags = nativeMethods.map((method) => `<NATIVEMETHOD>${escapeXml(method)}</NATIVEMETHOD>`).join("");
    const dateFormula = fromDate && toDate
        ? `<FILTER>WithinSelectedPeriod</FILTER><FILTERS>WithinSelectedPeriod</FILTERS>`
        : "";
    const formula = fromDate && toDate
        ? `<FORMULA NAME="WithinSelectedPeriod">$Date &gt;= $$Date:"${formatTallyDate(fromDate)}" AND $Date &lt;= $$Date:"${formatTallyDate(toDate)}"</FORMULA>`
        : "";

    return buildTallyEnvelope({
        type: "COLLECTION",
        id: collectionName,
        body: [
            "<DESC>",
            "<STATICVARIABLES>",
            "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
            companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : "",
            fromDate ? `<SVFROMDATE>${formatTallyDate(fromDate)}</SVFROMDATE>` : "",
            toDate ? `<SVTODATE>${formatTallyDate(toDate)}</SVTODATE>` : "",
            "</STATICVARIABLES>",
            "<TDL><TDLMESSAGE>",
            `<COLLECTION NAME="${escapeXml(collectionName)}" ISMODIFY="Yes">`,
            `<TYPE>${escapeXml(objectType)}</TYPE>`,
            dateFormula,
            methodTags,
            "</COLLECTION>",
            formula,
            "</TDLMESSAGE></TDL>",
            "</DESC>",
        ].join(""),
    });
}

export function buildReportRequest({ reportName, fromDate, toDate, companyName }) {
    return buildTallyEnvelope({
        type: "DATA",
        id: reportName,
        body: [
            "<DESC><STATICVARIABLES>",
            "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>",
            companyName ? `<SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>` : "",
            fromDate ? `<SVFROMDATE>${formatTallyDate(fromDate)}</SVFROMDATE>` : "",
            toDate ? `<SVTODATE>${formatTallyDate(toDate)}</SVTODATE>` : "",
            "</STATICVARIABLES></DESC>",
        ].join(""),
    });
}

export function parseTallyXml(xml) {
    try {
        return parser.parse(String(xml || ""));
    } catch (error) {
        const err = new Error("Tally returned invalid XML");
        err.cause = error;
        throw err;
    }
}

export function normalizeTallyPayload({ ledgersXml, vouchersXml, reportXmlByName = {}, generatedAt = new Date().toISOString() }) {
    const ledgerRoot = parseTallyXml(ledgersXml);
    const voucherRoot = parseTallyXml(vouchersXml);
    const ledgers = findAllByKey(ledgerRoot, "LEDGER").map(normalizeLedger).filter((ledger) => ledger.name);
    const vouchers = findAllByKey(voucherRoot, "VOUCHER")
        .map(normalizeVoucher)
        .filter((voucher) => voucher.id || voucher.voucher_number || voucher.party_name);

    const dashboard = buildDashboard(ledgers, vouchers);
    const reports = buildReports(ledgers, vouchers, reportXmlByName);

    return {
        generatedAt,
        ledgers,
        vouchers,
        invoices: vouchers.filter((voucher) => ["Sales", "Purchase"].includes(voucher.voucher_type)),
        dashboard,
        reports,
    };
}

function normalizeLedger(raw) {
    const name = pickText(raw.NAME) || pickText(raw["@_NAME"]);
    const parent = pickText(raw.PARENT);
    const opening = parseTallyAmount(raw.OPENINGBALANCE ?? raw.OPENINGBALANCELIST);
    const closing = parseTallyAmount(raw.CLOSINGBALANCE ?? raw.CLOSINGBALANCELIST ?? raw.BALANCE);

    return {
        id: pickText(raw.GUID) || pickText(raw.MASTERID) || name,
        name,
        parent,
        ledger_type: classifyLedger(parent, name),
        opening_balance: opening,
        current_balance: closing || opening,
        phone: pickText(raw.LEDGERMOBILE) || pickText(raw.LEDGERPHONE) || pickText(raw.PHONENUMBER),
        email: pickText(raw.EMAIL),
        gstin: pickText(raw.PARTYGSTIN) || pickText(raw.GSTIN),
        raw,
    };
}

function normalizeVoucher(raw) {
    const voucherType = pickText(raw.VOUCHERTYPENAME) || pickText(raw["@_VCHTYPE"]) || "Voucher";
    const ledgerEntries = arrayOf(raw["ALLLEDGERENTRIES.LIST"] || raw["LEDGERENTRIES.LIST"]).map((entry) => ({
        ledger_name: pickText(entry.LEDGERNAME),
        amount: parseTallyAmount(entry.AMOUNT),
        is_deemed_positive: parseBool(entry.ISDEEMEDPOSITIVE),
        is_party_ledger: parseBool(entry.ISPARTYLEDGER),
    })).filter((entry) => entry.ledger_name || entry.amount !== 0);

    const items = arrayOf(raw["ALLINVENTORYENTRIES.LIST"] || raw["INVENTORYENTRIES.LIST"]).map((entry) => ({
        name: pickText(entry.STOCKITEMNAME),
        description: pickText(entry.DESCRIPTION),
        billed_qty: pickText(entry.BILLEDQTY) || pickText(entry.ACTUALQTY),
        actual_qty: pickText(entry.ACTUALQTY),
        rate: parseTallyAmount(entry.RATE),
        amount: Math.abs(parseTallyAmount(entry.AMOUNT)),
        hsn: pickText(entry.GSTHSNNAME) || pickText(entry.HSNCODE),
        gst_rate: parseTallyAmount(entry.GSTRATE) || readNestedRate(entry),
    })).filter((item) => item.name || item.amount);

    const amountCandidates = [
        ...ledgerEntries.map((entry) => Math.abs(entry.amount)),
        ...items.map((item) => Math.abs(item.amount)),
        Math.abs(parseTallyAmount(raw.AMOUNT)),
    ].filter((amount) => Number.isFinite(amount) && amount > 0);

    const voucherDate = parseTallyDate(pickText(raw.DATE) || pickText(raw.EFFECTIVEDATE));
    const gstBreakdown = buildGstBreakdown(ledgerEntries, items);
    const total = amountCandidates.length ? Math.max(...amountCandidates) : 0;

    return {
        id: pickText(raw.GUID) || pickText(raw.MASTERID) || pickText(raw.VOUCHERNUMBER),
        voucher_number: pickText(raw.VOUCHERNUMBER) || pickText(raw.REFERENCE),
        voucher_type: normalizeVoucherType(voucherType),
        voucher_date: voucherDate,
        party_name: pickText(raw.PARTYLEDGERNAME) || firstPartyLedger(ledgerEntries),
        narration: pickText(raw.NARRATION),
        total_amount: total,
        grand_total: total,
        ledger_entries: ledgerEntries,
        items,
        gst: gstBreakdown,
        raw,
    };
}

function buildDashboard(ledgers, vouchers) {
    const totalSales = sum(vouchers.filter((v) => v.voucher_type === "Sales").map((v) => v.grand_total));
    const totalPurchase = sum(vouchers.filter((v) => v.voucher_type === "Purchase").map((v) => v.grand_total));
    const cashBankBalance = sum(ledgers.filter((ledger) => groupIncludes(ledger.parent, CASH_BANK_GROUPS)).map((ledger) => ledger.current_balance));
    const receivables = sum(ledgers.filter((ledger) => groupIncludes(ledger.parent, DEBTOR_GROUPS)).map((ledger) => Math.max(ledger.current_balance, 0)));
    const payables = sum(ledgers.filter((ledger) => groupIncludes(ledger.parent, CREDITOR_GROUPS)).map((ledger) => Math.abs(Math.min(ledger.current_balance, 0) || ledger.current_balance)));

    return {
        totalSales,
        totalPurchase,
        cashBankBalance,
        receivables,
        payables,
        recentTransactions: [...vouchers]
            .sort((a, b) => new Date(b.voucher_date || 0).getTime() - new Date(a.voucher_date || 0).getTime())
            .slice(0, 12),
    };
}

function buildReports(ledgers, vouchers, reportXmlByName) {
    const trialBalance = ledgers.map((ledger) => ({
        ledger_name: ledger.name,
        group: ledger.parent,
        debit: ledger.current_balance >= 0 ? ledger.current_balance : 0,
        credit: ledger.current_balance < 0 ? Math.abs(ledger.current_balance) : 0,
    })).filter((row) => row.debit || row.credit);

    const totalDebit = sum(trialBalance.map((row) => row.debit));
    const totalCredit = sum(trialBalance.map((row) => row.credit));

    const sales = sum(vouchers.filter((v) => v.voucher_type === "Sales").map((v) => v.grand_total));
    const purchases = sum(vouchers.filter((v) => v.voucher_type === "Purchase").map((v) => v.grand_total));
    const directIncome = sumLedgersByGroup(ledgers, ["direct incomes"]);
    const directExpense = sumLedgersByGroup(ledgers, ["direct expenses"]);
    const indirectIncome = sumLedgersByGroup(ledgers, ["indirect incomes"]);
    const indirectExpense = sumLedgersByGroup(ledgers, ["indirect expenses"]);
    const grossProfit = sales + directIncome - purchases - directExpense;
    const netProfit = grossProfit + indirectIncome - indirectExpense;

    const assets = groupReportRows(ledgers, ["fixed assets", "current assets", "bank accounts", "cash-in-hand", "cash in hand", "stock-in-hand"]);
    const liabilities = groupReportRows(ledgers, ["capital account", "secured loans", "unsecured loans", "current liabilities", "sundry creditors"]);

    return {
        trialBalance: {
            rows: trialBalance,
            totalDebit,
            totalCredit,
            difference: Math.abs(totalDebit - totalCredit),
            rawXmlAvailable: Boolean(reportXmlByName["Trial Balance"]),
        },
        profitLoss: {
            sales,
            purchases,
            directIncome,
            directExpense,
            indirectIncome,
            indirectExpense,
            grossProfit,
            netProfit,
            rawXmlAvailable: Boolean(reportXmlByName["Profit and Loss"]),
        },
        balanceSheet: {
            assets,
            liabilities,
            totalAssets: sum(assets.map((row) => row.amount)),
            totalLiabilities: sum(liabilities.map((row) => row.amount)),
            rawXmlAvailable: Boolean(reportXmlByName["Balance Sheet"]),
        },
    };
}

function buildGstBreakdown(ledgerEntries, items) {
    const ledgerTax = { cgst: 0, sgst: 0, igst: 0, cess: 0 };
    ledgerEntries.forEach((entry) => {
        const name = String(entry.ledger_name || "").toLowerCase();
        if (name.includes("cgst")) ledgerTax.cgst += Math.abs(entry.amount);
        else if (name.includes("sgst")) ledgerTax.sgst += Math.abs(entry.amount);
        else if (name.includes("igst")) ledgerTax.igst += Math.abs(entry.amount);
        else if (name.includes("cess")) ledgerTax.cess += Math.abs(entry.amount);
    });

    return {
        ...ledgerTax,
        taxableValue: sum(items.map((item) => item.amount)),
        totalTax: ledgerTax.cgst + ledgerTax.sgst + ledgerTax.igst + ledgerTax.cess,
        rates: [...new Set(items.map((item) => item.gst_rate).filter(Boolean))],
    };
}

function readNestedRate(entry) {
    const gstDetails = arrayOf(entry["GSTDETAILS.LIST"] || entry["RATEDETAILS.LIST"]);
    const first = gstDetails.find(Boolean) || {};
    return parseTallyAmount(first.GSTRATE || first.TAXRATE || first.RATE);
}

function firstPartyLedger(entries) {
    return entries.find((entry) => entry.is_party_ledger)?.ledger_name || entries[0]?.ledger_name || "";
}

function normalizeVoucherType(type) {
    const value = String(type || "").trim();
    const match = VOUCHER_TYPES.find((candidate) => value.toLowerCase().includes(candidate.toLowerCase()));
    return match || value || "Voucher";
}

function classifyLedger(parent, name) {
    const text = `${parent || ""} ${name || ""}`.toLowerCase();
    if (groupIncludes(text, DEBTOR_GROUPS)) return "Receivable";
    if (groupIncludes(text, CREDITOR_GROUPS)) return "Payable";
    if (groupIncludes(text, CASH_BANK_GROUPS)) return "Cash/Bank";
    if (text.includes("sales")) return "Sales";
    if (text.includes("purchase")) return "Purchase";
    return parent || "Ledger";
}

function groupReportRows(ledgers, patterns) {
    return ledgers
        .filter((ledger) => groupIncludes(ledger.parent, patterns))
        .map((ledger) => ({ ledger_name: ledger.name, group: ledger.parent, amount: Math.abs(ledger.current_balance) }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount);
}

function sumLedgersByGroup(ledgers, patterns) {
    return sum(ledgers.filter((ledger) => groupIncludes(ledger.parent, patterns)).map((ledger) => Math.abs(ledger.current_balance)));
}

function groupIncludes(value, patterns) {
    const text = String(value || "").toLowerCase();
    return patterns.some((pattern) => text.includes(pattern));
}

function findAllByKey(value, key) {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap((item) => findAllByKey(item, key));
    const direct = Object.prototype.hasOwnProperty.call(value, key) ? arrayOf(value[key]) : [];
    return [...direct, ...Object.values(value).flatMap((item) => findAllByKey(item, key))];
}

function pickText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    if (Array.isArray(value)) return pickText(value[0]);
    if (typeof value === "object") return pickText(value["#text"] ?? value["@_NAME"] ?? Object.values(value)[0]);
    return "";
}

function parseBool(value) {
    return ["yes", "true", "1"].includes(pickText(value).toLowerCase());
}

export function parseTallyAmount(value) {
    const raw = pickText(value);
    if (!raw) return 0;
    const lower = raw.toLowerCase();
    const negative = lower.includes("cr") || raw.trim().startsWith("-");
    const clean = raw.replace(/,/g, "").replace(/[^\d.-]/g, "");
    const parsed = Number(clean);
    if (!Number.isFinite(parsed)) return 0;
    return negative ? -Math.abs(parsed) : parsed;
}

export function parseTallyDate(value) {
    const raw = pickText(value);
    if (/^\d{8}$/.test(raw)) {
        return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
    return raw;
}

function formatTallyDate(value) {
    return String(value || "").replace(/-/g, "");
}

function arrayOf(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function sum(values) {
    return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function escapeXml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

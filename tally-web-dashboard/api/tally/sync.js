import {
    buildCollectionRequest,
    buildReportRequest,
    normalizeTallyPayload,
} from "../_lib/tallyXml.js";

const DEFAULT_TALLY_URL = "http://127.0.0.1:9000";

const ledgerMethods = [
    "Name",
    "Parent",
    "GUID",
    "MasterID",
    "OpeningBalance",
    "ClosingBalance",
    "Balance",
    "LedgerMobile",
    "LedgerPhone",
    "Email",
    "PartyGSTIN",
    "GSTIN",
];

const voucherMethods = [
    "GUID",
    "MasterID",
    "Date",
    "EffectiveDate",
    "VoucherNumber",
    "VoucherTypeName",
    "PartyLedgerName",
    "Reference",
    "Narration",
    "Amount",
    "AllLedgerEntries",
    "LedgerName",
    "IsPartyLedger",
    "IsDeemedPositive",
    "AllInventoryEntries",
    "StockItemName",
    "ActualQty",
    "BilledQty",
    "Rate",
    "GSTHSNName",
    "HSNCode",
    "GSTDetails",
    "RateDetails",
];

export default async function handler(req, res) {
    if (!["GET", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const startedAt = Date.now();
    const params = req.method === "POST" ? (req.body || {}) : req.query;
    const fromDate = normalizeDate(params.fromDate) || normalizeDate(params.from) || defaultFromDate();
    const toDate = normalizeDate(params.toDate) || normalizeDate(params.to) || today();
    const companyName = String(params.companyName || params.company || "").trim();
    const tallyUrl = getTallyUrl(params.tallyUrl);

    try {
        const [ledgersXml, vouchersXml, trialBalanceXml, profitLossXml, balanceSheetXml] = await Promise.all([
            postTallyXml(tallyUrl, buildCollectionRequest({
                collectionName: "TallyLink Ledgers",
                objectType: "Ledger",
                companyName,
                nativeMethods: ledgerMethods,
            })),
            postTallyXml(tallyUrl, buildCollectionRequest({
                collectionName: "TallyLink Vouchers",
                objectType: "Voucher",
                companyName,
                fromDate,
                toDate,
                nativeMethods: voucherMethods,
            })),
            postTallyXml(tallyUrl, buildReportRequest({ reportName: "Trial Balance", fromDate, toDate, companyName })).catch(() => ""),
            postTallyXml(tallyUrl, buildReportRequest({ reportName: "Profit and Loss", fromDate, toDate, companyName })).catch(() => ""),
            postTallyXml(tallyUrl, buildReportRequest({ reportName: "Balance Sheet", fromDate, toDate, companyName })).catch(() => ""),
        ]);

        const data = normalizeTallyPayload({
            ledgersXml,
            vouchersXml,
            reportXmlByName: {
                "Trial Balance": trialBalanceXml,
                "Profit and Loss": profitLossXml,
                "Balance Sheet": balanceSheetXml,
            },
            generatedAt: new Date().toISOString(),
        });

        return res.status(200).json({
            ok: true,
            source: "tally-xml",
            tallyUrl: redactLocalUrl(tallyUrl),
            fromDate,
            toDate,
            durationMs: Date.now() - startedAt,
            ...data,
        });
    } catch (error) {
        const message = getUserFriendlyTallyError(error, tallyUrl);
        return res.status(200).json({
            ok: false,
            source: "tally-xml",
            status: "offline",
            tallyUrl: redactLocalUrl(tallyUrl),
            fromDate,
            toDate,
            error: message,
            hint: "Open TallyPrime/Tally ERP, enable HTTP XML access on port 9000, or set TALLY_XML_URL/TALLY_MIDDLEWARE_URL to a reachable middleware service.",
        });
    }
}

function getUserFriendlyTallyError(error, tallyUrl) {
    const raw = String(error?.message || "");
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|network/i.test(raw)) {
        return `Tally is not reachable at ${redactLocalUrl(tallyUrl)}. Start Tally and enable XML/HTTP access on port 9000.`;
    }
    if (/timed out|abort/i.test(raw)) {
        return `Tally did not respond at ${redactLocalUrl(tallyUrl)} within the timeout. Check Tally XML/HTTP access.`;
    }
    return raw || "Unable to connect to Tally";
}

async function postTallyXml(tallyUrl, xml) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.TALLY_XML_TIMEOUT_MS || 12000));

    try {
        const response = await fetch(tallyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "text/xml;charset=UTF-8",
                "Accept": "text/xml, application/xml, text/plain",
            },
            body: xml,
            signal: controller.signal,
        });

        const text = await response.text();
        if (!response.ok) {
            throw new Error(`Tally HTTP ${response.status}: ${text.slice(0, 180)}`);
        }

        if (/STATUS>\s*0\s*<\/STATUS/i.test(text) && /LINEERROR|DESC not found|Error/i.test(text)) {
            throw new Error(stripXml(text).slice(0, 240) || "Tally rejected the XML request");
        }

        return text;
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error("Tally request timed out");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function getTallyUrl(requestedUrl) {
    const raw = String(
        requestedUrl
        || process.env.TALLY_XML_URL
        || process.env.TALLY_BASE_URL
        || process.env.TALLY_MIDDLEWARE_URL
        || DEFAULT_TALLY_URL
    ).trim();
    return raw.replace(/\/$/, "");
}

function normalizeDate(value) {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function defaultFromDate() {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-04-01`;
}

function stripXml(value) {
    return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function redactLocalUrl(value) {
    return String(value || "").replace(/\/\/([^/@]+@)?/g, "//");
}

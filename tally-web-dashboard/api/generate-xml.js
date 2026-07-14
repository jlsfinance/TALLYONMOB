function xmlEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function formatDate(dateValue) {
    const date = new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
}

function amountValue(amount, isDebit) {
    const n = Number(amount || 0);
    if (!Number.isFinite(n)) return "0";
    const signed = isDebit ? -Math.abs(n) : Math.abs(n);
    return signed.toFixed(2);
}

function ledgerMasterXml(ledgers) {
    return (ledgers || [])
        .map((ledger) => {
            const name = xmlEscape(ledger.name || ledger.ledgerName || "");
            const parent = xmlEscape(ledger.parent || "Sundry Debtors");
            return [
                "<TALLYMESSAGE xmlns:UDF=\"TallyUDF\">",
                `<LEDGER NAME=\"${name}\" ACTION=\"Create\">`,
                `<NAME>${name}</NAME>`,
                `<PARENT>${parent}</PARENT>`,
                "<ISBILLWISEON>Yes</ISBILLWISEON>",
                "<AFFECTSSTOCK>No</AFFECTSSTOCK>",
                "</LEDGER>",
                "</TALLYMESSAGE>"
            ].join("");
        })
        .join("\n");
}

function voucherXml(vouchers) {
    return (vouchers || [])
        .map((voucher) => {
            const date = formatDate(voucher.date);
            const voucherType = xmlEscape(voucher.voucherType || "Journal");
            const narration = xmlEscape(voucher.narration || "");
            const entries = Array.isArray(voucher.entries) ? voucher.entries : [];

            const ledgerEntriesXml = entries
                .map((entry) => {
                    const ledgerName = xmlEscape(entry.ledgerName || entry.ledger_name || "");
                    return [
                        "<ALLLEDGERENTRIES.LIST>",
                        `<LEDGERNAME>${ledgerName}</LEDGERNAME>`,
                        `<ISDEEMEDPOSITIVE>${entry.isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
                        `<AMOUNT>${amountValue(entry.amount, entry.isDebit)}</AMOUNT>`,
                        "</ALLLEDGERENTRIES.LIST>"
                    ].join("");
                })
                .join("");

            return [
                "<TALLYMESSAGE xmlns:UDF=\"TallyUDF\">",
                `<VOUCHER VCHTYPE=\"${voucherType}\" ACTION=\"Create\">`,
                `<DATE>${date}</DATE>`,
                `<NARRATION>${narration}</NARRATION>`,
                `<VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>`,
                ledgerEntriesXml,
                "</VOUCHER>",
                "</TALLYMESSAGE>"
            ].join("");
        })
        .join("\n");
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const clientId = String(req.body?.clientId || "").trim();
    const ledgers = Array.isArray(req.body?.ledgers) ? req.body.ledgers : [];
    const vouchers = Array.isArray(req.body?.vouchers) ? req.body.vouchers : [];

    if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
    }

    const xml = [
        "<ENVELOPE>",
        "<HEADER>",
        "<TALLYREQUEST>Import Data</TALLYREQUEST>",
        "</HEADER>",
        "<BODY>",
        "<IMPORTDATA>",
        "<REQUESTDESC>",
        "<REPORTNAME>Vouchers</REPORTNAME>",
        "</REQUESTDESC>",
        "<REQUESTDATA>",
        ledgerMasterXml(ledgers),
        voucherXml(vouchers),
        "</REQUESTDATA>",
        "</IMPORTDATA>",
        "</BODY>",
        "</ENVELOPE>"
    ].join("\n");

    return res.status(200).json({
        clientId,
        generatedAt: new Date().toISOString(),
        xml
    });
}

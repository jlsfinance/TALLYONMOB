import { asArray, toNumber } from "./_lib/json.js";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

function normalizeInvoice(raw) {
    const gstin = String(raw.gstin || "").trim().toUpperCase();
    const invoiceNumber = String(raw.invoiceNumber || raw.invoice_number || "").trim();
    const date = String(raw.date || raw.invoiceDate || raw.invoice_date || "").trim();
    const taxableValue = toNumber(raw.taxableValue ?? raw.taxable_value, 0);
    const cgst = toNumber(raw.cgst, 0);
    const sgst = toNumber(raw.sgst, 0);
    const igst = toNumber(raw.igst, 0);
    const hsn = String(raw.hsn || raw.hsnCode || raw.hsn_code || "").trim();
    const invoiceType = gstin ? "B2B" : "B2C";

    return {
        gstin,
        invoiceNumber,
        date,
        taxableValue,
        cgst,
        sgst,
        igst,
        hsn,
        invoiceType,
        source: raw
    };
}

function buildHsnSummary(invoices) {
    const grouped = new Map();

    for (const inv of invoices) {
        const key = inv.hsn || "UNKNOWN";
        const current = grouped.get(key) || {
            hsn: key,
            txval: 0,
            camt: 0,
            samt: 0,
            iamt: 0,
            totalTax: 0,
            count: 0
        };

        current.txval += inv.taxableValue;
        current.camt += inv.cgst;
        current.samt += inv.sgst;
        current.iamt += inv.igst;
        current.totalTax += inv.cgst + inv.sgst + inv.igst;
        current.count += 1;

        grouped.set(key, current);
    }

    return Array.from(grouped.values()).map((item) => ({
        ...item,
        txval: Number(item.txval.toFixed(2)),
        camt: Number(item.camt.toFixed(2)),
        samt: Number(item.samt.toFixed(2)),
        iamt: Number(item.iamt.toFixed(2)),
        totalTax: Number(item.totalTax.toFixed(2))
    }));
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const clientId = String(req.body?.clientId || "").trim();
    const invoices = asArray(req.body?.invoices).map(normalizeInvoice);

    if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
    }

    if (invoices.length === 0) {
        return res.status(400).json({ error: "invoices array is required" });
    }

    const errors = [];
    const warnings = [];
    const duplicateTracker = new Set();

    for (const inv of invoices) {
        if (!inv.invoiceNumber) {
            errors.push("Invoice number is missing");
        }

        if (!inv.date) {
            errors.push(`Invoice ${inv.invoiceNumber || "(unknown)"} is missing date`);
        }

        if (inv.gstin && !GSTIN_REGEX.test(inv.gstin)) {
            errors.push(`Invalid GSTIN format for invoice ${inv.invoiceNumber}: ${inv.gstin}`);
        }

        const duplicateKey = `${inv.invoiceNumber}|${inv.date}`;
        if (duplicateTracker.has(duplicateKey)) {
            errors.push(`Duplicate invoice detected: ${inv.invoiceNumber} on ${inv.date}`);
        }
        duplicateTracker.add(duplicateKey);

        if (inv.igst > 0 && (inv.cgst > 0 || inv.sgst > 0)) {
            errors.push(`Tax inconsistency in invoice ${inv.invoiceNumber}: IGST cannot coexist with CGST/SGST`);
        }

        if (inv.igst === 0 && Math.abs(inv.cgst - inv.sgst) > 1) {
            warnings.push(`Invoice ${inv.invoiceNumber}: CGST and SGST values are not balanced`);
        }
    }

    const b2b = invoices.filter((inv) => inv.invoiceType === "B2B");
    const b2c = invoices.filter((inv) => inv.invoiceType === "B2C");

    const taxTotals = invoices.reduce(
        (acc, inv) => {
            acc.taxableValue += inv.taxableValue;
            acc.cgst += inv.cgst;
            acc.sgst += inv.sgst;
            acc.igst += inv.igst;
            return acc;
        },
        { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
    );

    const response = {
        generatedAt: new Date().toISOString(),
        clientId,
        summary: {
            invoiceCount: invoices.length,
            b2bCount: b2b.length,
            b2cCount: b2c.length,
            hsnCount: new Set(invoices.map((inv) => inv.hsn || "UNKNOWN")).size
        },
        b2b,
        b2c,
        hsn_summary: buildHsnSummary(invoices),
        tax_totals: {
            taxableValue: Number(taxTotals.taxableValue.toFixed(2)),
            cgst: Number(taxTotals.cgst.toFixed(2)),
            sgst: Number(taxTotals.sgst.toFixed(2)),
            igst: Number(taxTotals.igst.toFixed(2)),
            totalTax: Number((taxTotals.cgst + taxTotals.sgst + taxTotals.igst).toFixed(2))
        },
        validation: {
            isValid: errors.length === 0,
            errors,
            warnings
        }
    };

    return res.status(200).json(response);
}

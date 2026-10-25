import pdfParse from "pdf-parse";
import { callGemini, resolveGeminiApiKeyFromRequest } from "../_lib/geminiService.js";
import { toNumber } from "../_lib/json.js";

const GSTIN_REGEX = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/i;

function capture(text, regex, groupIndex = 1) {
    const match = text.match(regex);
    if (!match) return "";
    return String(match[groupIndex] || "").trim();
}

function captureAmount(text, regex) {
    const raw = capture(text, regex, 2) || capture(text, regex, 1);
    const cleaned = raw.replace(/,/g, "");
    return toNumber(cleaned, 0);
}

function extractInvoiceFields(text) {
    const gstin = capture(text, /(GSTIN|GST\s*IN|GST\s*No\.?|GST\s*Number)\s*[:#-]?\s*([0-9A-Z]{15})/i, 2)
        || capture(text, GSTIN_REGEX, 0);

    const invoiceNumber = capture(text, /(invoice\s*(no\.?|number))\s*[:#-]?\s*([A-Z0-9\/-]+)/i, 3)
        || capture(text, /(bill\s*(no\.?|number))\s*[:#-]?\s*([A-Z0-9\/-]+)/i, 3);

    const date = capture(text, /(invoice\s*date|date)\s*[:#-]?\s*([0-3]?\d[\/-][01]?\d[\/-]\d{2,4})/i, 2);

    const taxableValue = captureAmount(text, /(taxable\s*(value|amount)|assessable\s*value)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const cgst = captureAmount(text, /(CGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const sgst = captureAmount(text, /(SGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const igst = captureAmount(text, /(IGST)\s*[:#-]?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const hsn = capture(text, /(HSN(?:\s*CODE)?)\s*[:#-]?\s*([A-Z0-9]+)/i, 2);

    return {
        gstin: String(gstin || "").toUpperCase(),
        invoiceNumber,
        date,
        taxableValue,
        cgst,
        sgst,
        igst,
        hsn,
        invoiceType: gstin ? "B2B" : "B2C"
    };
}

function normalizeInvoiceFields(raw) {
    const gstin = String(raw?.gstin || "").trim().toUpperCase();

    return {
        gstin,
        invoiceNumber: String(raw?.invoiceNumber || raw?.invoice_number || "").trim(),
        date: String(raw?.date || "").trim(),
        taxableValue: toNumber(raw?.taxableValue ?? raw?.taxable_value, 0),
        cgst: toNumber(raw?.cgst, 0),
        sgst: toNumber(raw?.sgst, 0),
        igst: toNumber(raw?.igst, 0),
        hsn: String(raw?.hsn || "").trim(),
        invoiceType: gstin ? "B2B" : "B2C"
    };
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const base64Pdf = String(req.body?.base64Pdf || "").trim();
    const base64File = String(req.body?.base64File || "").trim();
    const mimeType = String(req.body?.mimeType || "").trim();
    const apiKey = resolveGeminiApiKeyFromRequest(req);

    if (!base64Pdf && !base64File) {
        return res.status(400).json({ error: "base64Pdf or base64File is required" });
    }

    try {
        if (base64Pdf) {
            const buffer = Buffer.from(base64Pdf, "base64");
            const parsed = await pdfParse(buffer);
            const text = String(parsed.text || "").replace(/\s+/g, " ").trim();
            const fields = extractInvoiceFields(text);

            return res.status(200).json({
                extracted: fields,
                rawTextPreview: text.slice(0, 4000)
            });
        }

        const resolvedMimeType = mimeType || "application/octet-stream";
        const prompt = [
            "Extract invoice fields from the attached file and return strict JSON only.",
            "Schema:",
            "{\"gstin\":\"\",\"invoiceNumber\":\"\",\"date\":\"\",\"taxableValue\":0,\"cgst\":0,\"sgst\":0,\"igst\":0,\"hsn\":\"\",\"invoiceType\":\"B2B\"}",
            "If a field is missing, keep empty string or 0.",
            "No markdown."
        ].join(" ");

        const result = await callGemini({
            systemPrompt: "You are an invoice extraction engine.",
            userPrompt: prompt,
            expectJson: true,
            temperature: 0,
            attachments: [
                {
                    mimeType: resolvedMimeType,
                    dataBase64: base64File
                }
            ],
            apiKey
        });

        if (!result.ok || !result.json) {
            return res.status(500).json({
                error: result.error || "Failed to extract invoice from file",
                rawTextPreview: String(result.text || "").slice(0, 4000)
            });
        }

        const fields = normalizeInvoiceFields(result.json);

        return res.status(200).json({
            extracted: fields,
            rawTextPreview: String(result.text || "").slice(0, 4000)
        });
    } catch (error) {
        return res.status(500).json({
            error: "Failed to parse invoice file",
            detail: error instanceof Error ? error.message : "unknown_error"
        });
    }
}

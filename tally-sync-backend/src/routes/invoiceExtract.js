const express = require('express');

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function stripCodeFences(value) {
    return String(value || '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function safeJsonParse(value) {
    const raw = stripCodeFences(value);

    const candidates = [raw];
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
        candidates.push(raw.slice(objStart, objEnd + 1));
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (_) {
            // Try next.
        }
    }

    return null;
}

function normalizeInvoiceFields(raw) {
    const gstin = String(raw?.gstin || '').trim().toUpperCase();

    return {
        gstin,
        invoiceNumber: String(raw?.invoiceNumber || raw?.invoice_number || '').trim(),
        date: String(raw?.date || '').trim(),
        taxableValue: toNumber(raw?.taxableValue ?? raw?.taxable_value, 0),
        cgst: toNumber(raw?.cgst, 0),
        sgst: toNumber(raw?.sgst, 0),
        igst: toNumber(raw?.igst, 0),
        hsn: String(raw?.hsn || '').trim(),
        invoiceType: gstin ? 'B2B' : 'B2C'
    };
}

function resolveGeminiApiKey(req) {
    const bodyKey = String(req.body?.geminiApiKey || '').trim();
    const headerKey = String(req.headers?.['x-gemini-api-key'] || '').trim();
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    return bodyKey || headerKey || envKey;
}

function buildGeminiUrl(apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

router.post('/extract', async (req, res) => {
    const base64File = String(req.body?.base64File || req.body?.base64Pdf || '').trim();
    const mimeType = String(req.body?.mimeType || (req.body?.base64Pdf ? 'application/pdf' : '')).trim();

    if (!base64File) {
        return res.status(400).json({ error: 'base64File is required' });
    }

    if (!mimeType) {
        return res.status(400).json({ error: 'mimeType is required' });
    }

    const apiKey = resolveGeminiApiKey(req);
    if (!apiKey) {
        return res.status(400).json({
            error: 'Gemini API key missing. Add your key in Settings or configure GEMINI_API_KEY on backend.'
        });
    }

    try {
        const prompt = [
            'Extract invoice fields from the attached file and return strict JSON only.',
            'Schema:',
            '{"gstin":"","invoiceNumber":"","date":"","taxableValue":0,"cgst":0,"sgst":0,"igst":0,"hsn":"","invoiceType":"B2B"}',
            'Use empty string or 0 if field is missing.',
            'No markdown.'
        ].join(' ');

        const response = await fetch(buildGeminiUrl(apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64File
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 2048
                }
            })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            return res.status(response.status).json({
                error: payload?.error?.message || `Gemini API error: ${response.status}`
            });
        }

        const text = String(
            payload?.candidates?.[0]?.content?.parts
                ?.map((part) => part?.text || '')
                .join('\n') || ''
        ).trim();

        const parsed = safeJsonParse(text);
        if (!parsed) {
            return res.status(500).json({
                error: 'Failed to parse Gemini JSON response',
                rawTextPreview: text.slice(0, 4000)
            });
        }

        return res.status(200).json({
            extracted: normalizeInvoiceFields(parsed),
            rawTextPreview: text.slice(0, 4000)
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Failed to extract invoice from file',
            detail: error instanceof Error ? error.message : 'unknown_error'
        });
    }
});

module.exports = router;

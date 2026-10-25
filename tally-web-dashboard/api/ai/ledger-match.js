import { callGemini, resolveGeminiApiKeyFromRequest } from "../_lib/geminiService.js";
import { bestFuzzyLedgerMatch } from "../_lib/fuzzy.js";
import { toNumber } from "../_lib/json.js";

function clampConfidence(value) {
    const n = toNumber(value, 0);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const narration = String(req.body?.narration || "").trim();
    const ledgerList = Array.isArray(req.body?.ledgerList)
        ? req.body.ledgerList.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    const apiKey = resolveGeminiApiKeyFromRequest(req);

    if (!narration) {
        return res.status(400).json({ error: "narration is required" });
    }

    if (ledgerList.length === 0) {
        return res.status(400).json({ error: "ledgerList must contain at least one ledger" });
    }

    const fuzzyFallback = bestFuzzyLedgerMatch(narration, ledgerList);

    const systemPrompt = "You are an accounting automation engine. Return only valid JSON.";
    const userPrompt = [
        "Match the following bank narration to the best ledger from this ledger list.",
        "",
        "Return only JSON in this format:",
        "",
        "{",
        "  \"ledger_name\": \"\",",
        "  \"confidence\": 0-100,",
        "  \"reason\": \"\"",
        "}",
        "",
        `Bank Narration:\n${narration}`,
        "",
        `Ledger List:\n${JSON.stringify(ledgerList)}`,
        "",
        "Rules:",
        "- No explanation outside JSON",
        "- If unsure, confidence below 60"
    ].join("\n");

    const aiResult = await callGemini({
        systemPrompt,
        userPrompt,
        temperature: 0,
        expectJson: true,
        apiKey
    });

    if (!aiResult.ok || !aiResult.json || typeof aiResult.json !== "object") {
        return res.status(200).json({
            ledger_name: fuzzyFallback.ledgerName,
            confidence: fuzzyFallback.confidence,
            reason: "Gemini JSON parse failed; fuzzy fallback used",
            source: "fuzzy_fallback"
        });
    }

    const ledgerName = String(aiResult.json.ledger_name || "").trim();
    const confidence = clampConfidence(aiResult.json.confidence);
    const reason = String(aiResult.json.reason || "Gemini structured suggestion").trim();

    if (!ledgerName || !ledgerList.includes(ledgerName)) {
        return res.status(200).json({
            ledger_name: fuzzyFallback.ledgerName,
            confidence: fuzzyFallback.confidence,
            reason: "Gemini returned invalid ledger; fuzzy fallback used",
            source: "fuzzy_fallback"
        });
    }

    return res.status(200).json({
        ledger_name: ledgerName,
        confidence,
        reason,
        source: "gemini"
    });
}

import { callGemini, resolveGeminiApiKeyFromRequest } from "../_lib/geminiService.js";

function normalizeAttachments(input) {
    if (!Array.isArray(input)) return [];

    return input
        .map((item) => ({
            mimeType: String(item?.mimeType || "").trim(),
            dataBase64: String(item?.dataBase64 || "").trim()
        }))
        .filter((item) => item.mimeType && item.dataBase64);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const systemPrompt = String(req.body?.systemPrompt || "");
    const userPrompt = String(req.body?.userPrompt || "");
    const temperature = Number.isFinite(Number(req.body?.temperature))
        ? Number(req.body.temperature)
        : 0;
    const expectJson = Boolean(req.body?.expectJson);
    const attachments = normalizeAttachments(req.body?.attachments);
    const apiKey = resolveGeminiApiKeyFromRequest(req);

    if (!userPrompt.trim()) {
        return res.status(400).json({ error: "userPrompt is required" });
    }

    const result = await callGemini({
        systemPrompt,
        userPrompt,
        temperature,
        expectJson,
        attachments,
        apiKey
    });

    if (!result.ok) {
        return res.status(500).json({
            error: result.error || "Gemini call failed",
            usedFallback: result.usedFallback,
            rawText: result.text || ""
        });
    }

    return res.status(200).json({
        text: result.text,
        json: result.json,
        temperature: result.temperature,
        expectJson
    });
}

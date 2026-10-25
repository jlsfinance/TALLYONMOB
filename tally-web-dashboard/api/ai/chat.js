import { callGemini, resolveGeminiApiKeyFromRequest } from "../_lib/geminiService.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const query = String(req.body?.query || "").trim();
    const dataContext = req.body?.dataContext ?? {};
    const apiKey = resolveGeminiApiKeyFromRequest(req);

    if (!query) {
        return res.status(400).json({ error: "query is required" });
    }

    const systemPrompt = [
        "Act as an expert Accounting Assistant for an Indian business using Tally.",
        "Respond concisely and use markdown formatting where useful.",
        "If requested number is unavailable, clearly mention data is not found in current context."
    ].join(" ");

    const userPrompt = [
        `USER QUESTION: \"${query}\"`,
        "",
        "DATA CONTEXT:",
        JSON.stringify(dataContext, null, 2),
        "",
        "RULES:",
        "1. Quote exact numbers when present.",
        "2. Format currency in INR (example: Rs 1,50,000).",
        "3. Use markdown tables for lists when relevant.",
        "4. Keep tone professional and short."
    ].join("\n");

    const result = await callGemini({
        systemPrompt,
        userPrompt,
        temperature: 0,
        expectJson: false,
        apiKey
    });

    if (!result.ok) {
        return res.status(500).json({
            error: "Gemini chat request failed",
            detail: result.error || "unknown_error"
        });
    }

    return res.status(200).json({
        answer: result.text,
        meta: {
            modelTemperature: result.temperature,
            source: "gemini"
        }
    });
}

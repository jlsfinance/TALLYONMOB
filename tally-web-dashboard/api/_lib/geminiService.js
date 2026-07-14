import { GoogleGenerativeAI } from "@google/generative-ai";
import { safeJsonParse } from "./json.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const modelCache = new Map();

function normalizeApiKey(value) {
    return String(value || "").trim();
}

export function resolveGeminiApiKeyFromRequest(req) {
    const bodyKey = normalizeApiKey(req?.body?.geminiApiKey);
    const headerKey = normalizeApiKey(req?.headers?.["x-gemini-api-key"]);
    return bodyKey || headerKey;
}

function resolveGeminiApiKey(explicitApiKey) {
    const requestKey = normalizeApiKey(explicitApiKey);
    if (requestKey) {
        return requestKey;
    }

    const envKey = normalizeApiKey(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    if (envKey) {
        return envKey;
    }

    throw new Error("Gemini API key is missing. Add it in Settings or set GEMINI_API_KEY.");
}

function getModel(apiKey) {
    const resolvedApiKey = resolveGeminiApiKey(apiKey);

    if (modelCache.has(resolvedApiKey)) {
        return modelCache.get(resolvedApiKey);
    }

    const genAI = new GoogleGenerativeAI(resolvedApiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    modelCache.set(resolvedApiKey, model);
    return model;
}

function buildInlineParts(attachments) {
    if (!Array.isArray(attachments)) return [];

    return attachments
        .filter((item) => item?.mimeType && item?.dataBase64)
        .map((item) => ({
            inlineData: {
                mimeType: String(item.mimeType).trim(),
                data: String(item.dataBase64).trim()
            }
        }));
}

export async function callGemini({
    systemPrompt,
    userPrompt,
    temperature = 0,
    expectJson = false,
    attachments = [],
    apiKey
}) {
    const finalTemperature = expectJson ? 0 : temperature;

    try {
        const model = getModel(apiKey);
        const prompt = [
            systemPrompt ? `SYSTEM:\n${systemPrompt}` : "",
            `USER:\n${userPrompt}`
        ]
            .filter(Boolean)
            .join("\n\n");

        const parts = [{ text: prompt }, ...buildInlineParts(attachments)];

        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                temperature: finalTemperature,
                topP: 0.95,
                topK: 32,
                maxOutputTokens: expectJson ? 2048 : 4096
            }
        });

        const rawText = (await result.response).text()?.trim() || "";

        if (!expectJson) {
            return {
                ok: true,
                text: rawText,
                json: null,
                usedFallback: false,
                error: null,
                temperature: finalTemperature
            };
        }

        const parsed = safeJsonParse(rawText);
        if (!parsed.ok) {
            return {
                ok: false,
                text: rawText,
                json: null,
                usedFallback: true,
                error: "json_parse_failed",
                temperature: finalTemperature
            };
        }

        return {
            ok: true,
            text: rawText,
            json: parsed.data,
            usedFallback: false,
            error: null,
            temperature: finalTemperature
        };
    } catch (error) {
        return {
            ok: false,
            text: "",
            json: null,
            usedFallback: true,
            error: error instanceof Error ? error.message : "gemini_call_failed",
            temperature: finalTemperature
        };
    }
}

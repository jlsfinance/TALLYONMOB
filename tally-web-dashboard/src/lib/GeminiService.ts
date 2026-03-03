import { getUserGeminiApiKey } from '@/lib/userGeminiKey';
import { getUserAiTraining } from '@/lib/userAiTraining';

export interface GeminiInlineAttachment {
    mimeType: string;
    dataBase64: string;
}

export interface GeminiCallInput {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    expectJson?: boolean;
    attachments?: GeminiInlineAttachment[];
    apiKey?: string;
}

export interface GeminiCallOutput<TJson = unknown> {
    text: string;
    json: TJson | null;
    temperature: number;
}

export interface AnalyzeDataOptions {
    apiKey?: string;
    userId?: string | null;
}

/**
 * Calls Gemini API directly from the client (no backend needed).
 * Uses the user's stored Gemini API key from localStorage.
 */
export async function callGemini({
    systemPrompt,
    userPrompt,
    temperature = 0,
    expectJson = false,
    attachments = [],
    apiKey
}: GeminiCallInput): Promise<GeminiCallOutput> {
    const resolvedApiKey = String(apiKey || getUserGeminiApiKey() || '').trim();

    if (!resolvedApiKey) {
        throw new Error('Gemini API key not set. Go to Settings and add your Google AI Studio API key.');
    }

    const MODEL = 'gemini-3-flash-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${resolvedApiKey}`;

    const parts: any[] = [];

    for (const attachment of attachments) {
        parts.push({
            inline_data: {
                mime_type: attachment.mimeType,
                data: attachment.dataBase64
            }
        });
    }

    parts.push({ text: userPrompt });

    const requestBody: any = {
        contents: [{ parts }],
        generationConfig: {
            temperature,
            ...(expectJson ? { responseMimeType: 'application/json' } : {})
        }
    };

    if (systemPrompt) {
        requestBody.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const errorMsg = payload?.error?.message || `Gemini API error: ${response.status}`;
        throw new Error(errorMsg);
    }

    const candidateParts = payload?.candidates?.[0]?.content?.parts || [];
    const rawText = candidateParts
        .map((p: any) => String(p?.text || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();

    let jsonResult: any = null;
    if (expectJson) {
        try {
            const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            jsonResult = JSON.parse(cleaned);
        } catch {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { jsonResult = JSON.parse(jsonMatch[0]); } catch { }
            }
        }
    }

    return {
        text: rawText,
        json: jsonResult,
        temperature
    };
}

export async function analyzeData(
    query: string,
    dataContext: unknown,
    options: AnalyzeDataOptions = {}
): Promise<string> {
    const resolvedApiKey = String(options.apiKey || getUserGeminiApiKey(options.userId) || '').trim();
    const personalTraining = getUserAiTraining(options.userId);

    const personalTrainingBlock = personalTraining
        ? [
            'User specific training instructions:',
            personalTraining,
            'Follow these user instructions for language, style, and business assumptions unless they conflict with available company data.'
        ].join('\n')
        : '';

    const result = await callGemini({
        systemPrompt: [
            'You are TallyLink AI, an expert Indian accounting and business analyst.',
            'You analyze Tally data like Sales, Purchases, Ledgers, Outstanding, Stock, GST, and Cash Flow.',
            'Rules:',
            '- Reply in the same language as the user (Hindi/English/Hinglish).',
            '- Use Indian number formatting for currency values when available.',
            '- Be specific with numbers, names, and dates from data.',
            '- Give direct answer first, then short supporting points.',
            '- If data is missing, clearly say data is not available.',
            '- Never invent amounts, parties, transactions, or dates.',
            '- Keep response concise and actionable.',
            personalTrainingBlock
        ].filter(Boolean).join(' '),
        userPrompt: `Company data context:\n${JSON.stringify(dataContext, null, 2)}\n\nUser question: ${query}`,
        temperature: 0.2,
        apiKey: resolvedApiKey
    });

    return result.text || 'No response generated.';
}

export interface LedgerMatchOutput {
    ledger_name: string;
    confidence: number;
    reason: string;
    source: 'gemini' | 'fuzzy_fallback';
}

export async function matchLedgerWithGemini(
    narration: string,
    ledgerList: string[]
): Promise<LedgerMatchOutput> {
    const result = await callGemini({
        expectJson: true,
        temperature: 0,
        systemPrompt: [
            'You match bank transaction narrations to the most appropriate ledger from a provided list.',
            'Return JSON only: {"ledger_name":"...","confidence":0-100,"reason":"..."}'
        ].join(' '),
        userPrompt: [
            `Narration: "${narration}"`,
            `Available Ledgers: ${JSON.stringify(ledgerList.slice(0, 100))}`,
            'Pick the best matching ledger. Return JSON only.'
        ].join('\n')
    });

    if (result.json) {
        return {
            ...(result.json as any),
            source: 'gemini'
        };
    }

    return {
        ledger_name: '',
        confidence: 0,
        reason: 'Could not parse Gemini response',
        source: 'fuzzy_fallback'
    };
}
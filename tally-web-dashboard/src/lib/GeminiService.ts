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
    model?: string;
    fallbackModels?: string[];
    maxRetries?: number;
    timeoutMs?: number;
}

export interface GeminiCallOutput<TJson = unknown> {
    text: string;
    json: TJson | null;
    temperature: number;
    model: string;
}

export interface AnalyzeDataOptions {
    apiKey?: string;
    userId?: string | null;
}

export interface FinancialInsightLead {
    name: string;
    note: string;
    action: string;
    amount?: number;
}

export interface FinancialInsightSummary {
    overview: string;
    cashflowNote: string;
    customerReminders: Array<{
        customer: string;
        amount?: number;
        reason: string;
        template: string;
    }>;
    topLedgerObservations: FinancialInsightLead[];
}

type GeminiHttpError = Error & {
    status?: number;
    model?: string;
};

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createGeminiError(message: string, status?: number, model?: string): GeminiHttpError {
    const error = new Error(message) as GeminiHttpError;
    if (typeof status === 'number') {
        error.status = status;
    }
    if (model) {
        error.model = model;
    }
    return error;
}

function isRetryableGeminiError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const typedError = error as GeminiHttpError & { name?: string };
    if (typedError.name === 'AbortError') {
        return true;
    }

    return RETRYABLE_STATUS_CODES.has(Number(typedError.status));
}

function parseGeminiJson(rawText: string): unknown | null {
    try {
        const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        return JSON.parse(cleaned);
    } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return null;
        }

        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            return null;
        }
    }
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
    apiKey,
    model,
    fallbackModels = [],
    maxRetries = DEFAULT_MAX_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS
}: GeminiCallInput): Promise<GeminiCallOutput> {
    const resolvedApiKey = String(apiKey || getUserGeminiApiKey() || '').trim();

    if (!resolvedApiKey) {
        throw new Error('Gemini API key not set. Go to Settings and add your Google AI Studio API key.');
    }

    const resolvedModels = Array.from(new Set([
        String(model || '').trim() || DEFAULT_MODEL,
        ...fallbackModels.map((entry) => String(entry || '').trim()).filter(Boolean)
    ]));

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

    let lastError: GeminiHttpError = createGeminiError('Gemini request failed.');

    for (const currentModel of resolvedModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${resolvedApiKey}`;

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            const controller = new AbortController();
            const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                window.clearTimeout(timeoutHandle);
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    const errorMessage = payload?.error?.message || `Gemini API error: ${response.status}`;
                    const httpError = createGeminiError(errorMessage, response.status, currentModel);

                    if (!RETRYABLE_STATUS_CODES.has(response.status) && response.status !== 404) {
                        throw httpError;
                    }

                    if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
                        await sleep(Math.min(4000, 800 * (2 ** attempt)));
                        continue;
                    }

                    lastError = httpError;
                    break;
                }

                const candidateParts = payload?.candidates?.[0]?.content?.parts || [];
                const rawText = candidateParts
                    .map((part: any) => String(part?.text || '').trim())
                    .filter(Boolean)
                    .join('\n')
                    .trim();

                return {
                    text: rawText,
                    json: expectJson ? parseGeminiJson(rawText) : null,
                    temperature,
                    model: currentModel
                };
            } catch (error: any) {
                window.clearTimeout(timeoutHandle);

                const normalizedError = error?.name === 'AbortError'
                    ? createGeminiError(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s.`, 408, currentModel)
                    : ((error instanceof Error ? error : createGeminiError('Gemini request failed.', undefined, currentModel)) as GeminiHttpError);

                if (!normalizedError.model) {
                    normalizedError.model = currentModel;
                }

                if (attempt < maxRetries && isRetryableGeminiError(normalizedError)) {
                    await sleep(Math.min(4000, 800 * (2 ** attempt)));
                    continue;
                }

                if (!isRetryableGeminiError(normalizedError) && normalizedError.status !== 404) {
                    throw normalizedError;
                }

                lastError = normalizedError;
                break;
            }
        }
    }

    if (lastError.status === 503) {
        throw createGeminiError('Gemini is temporarily unavailable. Retry in a few seconds.', 503, lastError.model);
    }

    if (lastError.status === 429) {
        throw createGeminiError('Gemini rate limit hit. Wait a bit and retry.', 429, lastError.model);
    }

    throw lastError;
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

export async function generateFinancialInsights(
    dataContext: unknown,
    options: AnalyzeDataOptions = {}
): Promise<FinancialInsightSummary | null> {
    const resolvedApiKey = String(options.apiKey || getUserGeminiApiKey(options.userId) || '').trim();
    if (!resolvedApiKey) {
        return null;
    }

    const personalTraining = getUserAiTraining(options.userId);

    const result = await callGemini({
        expectJson: true,
        temperature: 0.15,
        apiKey: resolvedApiKey,
        systemPrompt: [
            'You are TallyLink AI, and you work in the background only.',
            'You turn accounting data into concise business insights, reminder drafts, and cashflow observations.',
            'Rules:',
            '- Return JSON only.',
            '- Do not mention that you are an AI or that the response is generated.',
            '- Be direct, practical, and concise.',
            '- Never invent amounts, customers, or dates.',
            '- Focus on customer reminders, cash flow, and top ledger observations.',
            personalTraining
                ? [
                    'User specific training instructions:',
                    personalTraining,
                ].join('\n')
                : ''
        ].filter(Boolean).join(' '),
        userPrompt: [
            'Create the following JSON shape:',
            '{"overview":"string","cashflowNote":"string","customerReminders":[{"customer":"string","amount":1234,"reason":"string","template":"string"}],"topLedgerObservations":[{"name":"string","note":"string","action":"string","amount":1234}]}',
            'Use the provided Tally data only. Keep templates ready to send on email or WhatsApp.',
            `Tally data context:\n${JSON.stringify(dataContext, null, 2)}`
        ].join('\n')
    });

    const json = result.json as Partial<FinancialInsightSummary> | null;
    if (!json) {
        return null;
    }

    return {
        overview: String(json.overview || '').trim() || 'No insight generated.',
        cashflowNote: String(json.cashflowNote || '').trim() || 'Cash flow appears stable.',
        customerReminders: Array.isArray(json.customerReminders)
            ? json.customerReminders.map((item: any) => ({
                customer: String(item?.customer || 'Customer'),
                amount: typeof item?.amount === 'number' ? item.amount : Number(item?.amount || 0) || undefined,
                reason: String(item?.reason || '').trim() || 'Reminder suggested by payment pattern.',
                template: String(item?.template || '').trim() || 'Hi, this is a gentle reminder regarding your pending invoice.'
            }))
            : [],
        topLedgerObservations: Array.isArray(json.topLedgerObservations)
            ? json.topLedgerObservations.map((item: any) => ({
                name: String(item?.name || 'Ledger'),
                note: String(item?.note || '').trim() || 'Monitor this ledger closely.',
                action: String(item?.action || '').trim() || 'Review balances and follow up.',
                amount: typeof item?.amount === 'number' ? item.amount : Number(item?.amount || 0) || undefined,
            }))
            : [],
    };
}

/**
 * Voice Parser Service - Uses Gemini 3 Flash Preview for parsing voice commands
 * Parses natural language (Hindi/English) into structured invoice item data
 */

import { AIService } from './aiService';

export interface ParsedItem {
    productName: string;
    quantity: number;
    rate: number;
    unit?: string;
}

export interface VoiceParseResult {
    success: boolean;
    items: ParsedItem[];
    rawText: string;
    error?: string;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

export const VoiceParserService = {
    /**
     * Parse voice text into structured item data using Gemini
     */
    parseVoiceCommand: async (voiceText: string): Promise<VoiceParseResult> => {
        const apiKey = AIService.getApiKey();

        if (!apiKey) {
            return {
                success: false,
                items: [],
                rawText: voiceText,
                error: 'Gemini API key not configured. Please add it in Settings.'
            };
        }

        const prompt = `You are an invoice item parser. Parse the following voice command (which may be in Hindi, English, or Hinglish) into structured item data for a billing app.

Voice Command: "${voiceText}"

Extract items with their quantity and rate. Common patterns:
- "5 cement bags at 350 each" → cement bags, qty: 5, rate: 350
- "10 kilo sugar 45 rupees" → sugar, qty: 10, rate: 45
- "दो बोरी सीमेंट 400 रुपये" → सीमेंट/cement, qty: 2 (दो), rate: 400
- "teen hundred wala chai patti" → chai patti, qty: 1, rate: 300

Number words to parse: एक/ek=1, दो/do=2, तीन/teen=3, चार/char=4, पांच/panch=5, 
छह/chhe=6, सात/saat=7, आठ/aath=8, नौ/nau=9, दस/das=10, 
सौ/sau=100, हज़ार/hazar=1000

Respond ONLY with a JSON object in this exact format:
{
    "items": [
        {"productName": "Product Name", "quantity": 5, "rate": 350, "unit": "pcs"}
    ]
}

If you cannot parse the command, return:
{
    "items": [],
    "error": "Could not understand the command"
}`;

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 500,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResult) {
                throw new Error('No response from Gemini');
            }

            // Parse the JSON response
            let parsed;
            try {
                // Clean up the response - remove markdown code blocks if present
                let cleanText = textResult.trim();
                if (cleanText.startsWith('```json')) {
                    cleanText = cleanText.replace(/```json\n?/, '').replace(/\n?```$/, '');
                } else if (cleanText.startsWith('```')) {
                    cleanText = cleanText.replace(/```\n?/, '').replace(/\n?```$/, '');
                }
                parsed = JSON.parse(cleanText);
            } catch (parseError) {
                console.error('JSON parse error:', textResult);
                throw new Error('Failed to parse Gemini response');
            }

            if (parsed.error) {
                return {
                    success: false,
                    items: [],
                    rawText: voiceText,
                    error: parsed.error
                };
            }

            return {
                success: true,
                items: parsed.items || [],
                rawText: voiceText
            };

        } catch (error: any) {
            console.error('Voice parse error:', error);
            return {
                success: false,
                items: [],
                rawText: voiceText,
                error: error.message || 'Failed to parse voice command'
            };
        }
    },

    /**
     * Simple fallback parser without AI
     * Handles basic patterns like "5 cement 350"
     */
    simpleParse: (text: string): ParsedItem[] => {
        const items: ParsedItem[] = [];

        // Pattern: number + product + number (rate)
        // e.g., "5 cement 350" or "10 sugar 45"
        const pattern = /(\d+)\s+([a-zA-Z\u0900-\u097F\s]+?)\s+(\d+)/gi;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            items.push({
                productName: match[2].trim(),
                quantity: parseInt(match[1]),
                rate: parseInt(match[3])
            });
        }

        return items;
    }
};

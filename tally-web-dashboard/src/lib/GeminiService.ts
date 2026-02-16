
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Preferences } from '@capacitor/preferences';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

export const GeminiService = {
    getApiKey: async (): Promise<string | null> => {
        const { value } = await Preferences.get({ key: API_KEY_STORAGE_KEY });
        return value;
    },

    setApiKey: async (key: string): Promise<void> => {
        await Preferences.set({ key: API_KEY_STORAGE_KEY, value: key });
    },

    validateKey: async (key: string): Promise<boolean> => {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
            const result = await model.generateContent("Hello");
            const response = await result.response;
            return !!response.text();
        } catch (e) {
            console.error("Invalid API Key verification", e);
            return false;
        }
    },

    analyzeData: async (query: string, dataContext: any, apiKey: string): Promise<string> => {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

            // Improved Prompt Engineering for Accounting Data
            const prompt = `
        Act as an expert Accounting Assistant for an Indian business using Tally.
        Analyze the following JSON data context and answer the user's question concisely.

        USER QUESTION: "${query}"

        DATA CONTEXT:
        ${JSON.stringify(dataContext, null, 2)}

        RULES:
        1. If specific numbers are available, quote them exactly.
        2. Format currency in Indian Rupees (e.g., ₹1,50,000).
        3. If "outstanding" is asked, look for 'closing_balance' in ledgers (Positive = Dr/Receivable, Negative = Cr/Payable usually, but check context).
        4. If the user asks for a specific name (e.g., "Rahul") and multiple matches exist (e.g., "Rahul Singh", "Rahul Traders"), LIST all matches with their balances and ask "Which one do you mean?". DO NOT sum them up unless explicitly asked.
        5. If asked for "full detail" or "bill items", look for voucher details. If item-level details (rate, quantity) are missing in the context, clearly state: "I have the bill totals, but item-level details (rate/qty) are not in my current view. Please open the specific bill to see items."
        6. If asked for "full year" or "total", sum up the 'total_amount' or 'grand_total' from the relevant vouchers in the text context.
        7. If data is insufficient, state "Data not found in current context" politely.
        8. USE MARKDOWN FOR FORMATTING:
           - Use Tables for lists of bills or items. (Columns: Date, Particulars, Amount)
           - Use Bold (**text**) for totals and key figures.
           - Use Bullet points for summaries.
           - Keep the tone professional.
      `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("Gemini Generation Error:", error);
            throw new Error("Failed to generate response from AI.");
        }
    }
};

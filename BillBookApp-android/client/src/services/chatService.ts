/**
 * Chat Service — Gemini Chat API with streaming
 * Handles conversation with Gemini AI about app data
 */
import { AIService } from './aiService';

const GEMINI_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

export interface AppDataContext {
  invoices?: any[];
  customers?: any[];
  products?: any[];
  sales?: any[];
  expenses?: any[];
}

class ChatServiceClass {
  private messages: ChatMessage[] = [];
  private systemPrompt = `You are "JLS AI Assistant" — a helpful business assistant for JLS Finance Ltd.
You help users understand their business data in Hindi/English (Hinglish).
Keep responses short, helpful, and in simple Hinglish.
Always base your answers on the actual data provided to you.
If you don't have enough data, say so honestly.
NEVER make up numbers or facts.

The app is a billing/inventory management app with invoices, customers, products, sales, and expenses.`;

  async sendMessage(
    userMessage: string,
    appData?: AppDataContext
  ): Promise<string> {
    const apiKey = AIService.getApiKey();
    if (!apiKey) throw new Error('Gemini API key not configured');

    this.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });

    const dataContext = appData ? this.buildDataContext(appData) : '';
    const conversationHistory = this.messages
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${this.systemPrompt}

${dataContext}

Conversation so far:
${conversationHistory}

User: ${userMessage}
Assistant:`;

    try {
      const response = await fetch(
        `${GEMINI_CHAT_URL}?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
              topP: 0.8,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error: ${response.status} — ${errText}`);
      }

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Koi jawab nahi mila.';

      this.messages.push({ role: 'ai', content: aiText, timestamp: Date.now() });
      return aiText;
    } catch (error: any) {
      const errMsg = error.message || 'AI se baat karne mein error aaya';
      this.messages.push({ role: 'ai', content: `❌ Error: ${errMsg}`, timestamp: Date.now() });
      throw error;
    }
  }

  async sendMessageStream(
    userMessage: string,
    onChunk: (text: string) => void,
    appData?: AppDataContext
  ): Promise<string> {
    const apiKey = AIService.getApiKey();
    if (!apiKey) throw new Error('Gemini API key not configured');

    this.messages.push({ role: 'user', content: userMessage, timestamp: Date.now() });

    const dataContext = appData ? this.buildDataContext(appData) : '';
    const conversationHistory = this.messages
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${this.systemPrompt}

${dataContext}

Conversation so far:
${conversationHistory}

User: ${userMessage}
Assistant:`;

    try {
      const response = await fetch(
        `${GEMINI_CHAT_URL}?key=${apiKey}&alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
              topP: 0.8,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      let fullText = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              fullText += text;
              onChunk(text);
            }
          } catch { /* skip parse errors */ }
        }
      }

      this.messages.push({ role: 'ai', content: fullText, timestamp: Date.now() });
      return fullText;
    } catch (error: any) {
      const errMsg = error.message || 'Stream error';
      onChunk(`\n\n❌ Error: ${errMsg}`);
      throw error;
    }
  }

  private buildDataContext(data: AppDataContext): string {
    const parts: string[] = ['## Current App Data Summary:\n'];

    if (data.invoices?.length) {
      const total = data.invoices.reduce((s: number, i: any) => s + Number(i.total || i.grand_total || 0), 0);
      parts.push(`- Invoices: ${data.invoices.length} total, ₹${total.toLocaleString('en-IN')}`);
    }
    if (data.customers?.length) {
      parts.push(`- Customers: ${data.customers.length} registered`);
    }
    if (data.products?.length) {
      parts.push(`- Products: ${data.products.length} items`);
    }
    if (data.sales?.length) {
      const total = data.sales.reduce((s: number, sale: any) => s + Number(sale.total || sale.amount || 0), 0);
      parts.push(`- Sales: ${data.sales.length} transactions, ₹${total.toLocaleString('en-IN')}`);
    }
    if (data.expenses?.length) {
      const total = data.expenses.reduce((s: number, exp: any) => s + Number(exp.amount || 0), 0);
      parts.push(`- Expenses: ${data.expenses.length} entries, ₹${total.toLocaleString('en-IN')}`);
    }

    return parts.join('\n') || '\n(No app data available yet)';
  }

  getHistory(): ChatMessage[] {
    return this.messages;
  }

  clearHistory(): void {
    this.messages = [];
  }
}

export const ChatService = new ChatServiceClass();

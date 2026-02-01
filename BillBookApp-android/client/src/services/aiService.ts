/**
 * AI Service - Gemini API Integration for Smart Data Extraction
 * Extracts product/customer data from Excel files using Google Gemini
 */

import { Product, Customer } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// Storage key for API key
const GEMINI_API_KEY_STORAGE = 'gemini_api_key';

export const AIService = {
    // Get stored API key
    getApiKey: (): string | null => {
        return localStorage.getItem(GEMINI_API_KEY_STORAGE);
    },

    // Save API key
    setApiKey: (key: string): void => {
        localStorage.setItem(GEMINI_API_KEY_STORAGE, key);
        console.log("AI: Gemini API Key Saved Successfully");
    },

    // Remove API key
    removeApiKey: (): void => {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    },

    // Check if API key is configured
    isConfigured: (): boolean => {
        const key = AIService.getApiKey();
        return !!(key && key.length > 10);
    },

    /**
     * Extract products and customers from Excel file content
     * @param fileContent - Base64 encoded file content or text content
     * @param fileName - Name of the file for context
     */
    extractFromExcel: async (
        fileContent: string,
        _fileName: string
    ): Promise<{ products: Product[]; customers: Customer[]; rawResponse?: string }> => {
        const apiKey = AIService.getApiKey();

        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please add it in Settings.');
        }

        // Helper function to process a single chunk of text
        const processChunk = async (chunkContent: string): Promise<{ products: Product[], customers: Customer[] }> => {
            const prompt = `You are a data extraction AI. Analyze this document content and extract business data.

Extract ONLY what you find. Return ONLY valid JSON (no markdown, no explanation, no code blocks).

JSON Format:
{"products":[{"name":"string","price":number,"stock":number,"category":"string"}],"customers":[{"name":"string","phone":"string","email":"string","address":"string"}]}

Rules:
- Extract product names, prices, quantities from lists, tables, invoices
- Extract customer/company names, phone numbers, emails, addresses
- **Map Headers**: "Rate" -> Price, "Closing Stock" -> Stock, "Qty" -> Stock
- **Clean Numbers**:
  - Price "5/-" -> 5
  - Stock "-19 tin" -> -19 (remove "tin", "pkt", "pc", etc)
  - Handle negative numbers for stock
- If no products found, use empty array []
- If no customers found, use empty array []
- Be smart about finding data in any format (tables, lists, invoice items)

Document Content:
${chunkContent}`;

            let textContent = '';
            try {
                const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 8192,
                            responseMimeType: "application/json"
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    if (response.status === 400 && errorData.error?.message?.includes('API key')) {
                        throw new Error('Invalid API key. Please check your Gemini API key in Settings.');
                    }
                    throw new Error(errorData.error?.message || 'API request failed');
                }

                const data = await response.json();
                textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Extract and parse JSON
                let jsonStr = textContent;
                const patterns = [
                    /```json\s*([\s\S]*?)\s*```/,
                    /```\s*([\s\S]*?)\s*```/,
                    /\{[\s\S]*"products"[\s\S]*\}/,
                    /\{[\s\S]*"customers"[\s\S]*\}/,
                    /\{[\s\S]*\}/
                ];

                for (const pattern of patterns) {
                    const match = textContent.match(pattern);
                    if (match) {
                        jsonStr = match[1] || match[0];
                        break;
                    }
                }

                jsonStr = jsonStr.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

                let parsed;
                try {
                    parsed = JSON.parse(jsonStr);
                } catch (e) {
                    // Try regex extraction as fallback
                    const productsMatch = jsonStr.match(/"products"\s*:\s*\[([\s\S]*?)\]/);
                    const customersMatch = jsonStr.match(/"customers"\s*:\s*\[([\s\S]*?)\]/);

                    if (productsMatch || customersMatch) {
                        parsed = {
                            products: productsMatch ? JSON.parse(`[${productsMatch[1]}]`) : [],
                            customers: customersMatch ? JSON.parse(`[${customersMatch[1]}]`) : []
                        };
                    } else {
                        throw new SyntaxError('Invalid JSON');
                    }
                }

                return {
                    products: (parsed.products || []).map((p: any) => ({
                        id: p.id && String(p.id).trim().length > 0 ? String(p.id).trim() : Math.random().toString(36).substr(2, 9),
                        name: String(p.name || ''),
                        price: Number(p.price) || 0,
                        stock: Number(p.stock) || 1,
                        category: String(p.category || 'General'),
                        hsn: String(p.hsn || ''),
                        gstRate: Number(p.gstRate) || 0
                    })).filter((p: Product) => p.name),
                    customers: (parsed.customers || []).map((c: any) => ({
                        id: Math.random().toString(36).substr(2, 9),
                        name: String(c.name || ''),
                        company: String(c.company || ''),
                        email: String(c.email || ''),
                        phone: String(c.phone || ''),
                        address: String(c.address || ''),
                        state: String(c.state || ''),
                        gstin: String(c.gstin || ''),
                        balance: 0,
                        notifications: []
                    })).filter((c: Customer) => c.name)
                };

            } catch (error: any) {
                if (error instanceof SyntaxError) {
                    const snippet = textContent.substring(0, 100).replace(/\n/g, ' ');
                    throw new Error(`AI response was not valid JSON. Received: "${snippet}..."`);
                }
                throw error;
            }
        };

        // Chunking Strategy
        const CHUNK_SIZE = 12000; // ~12k characters per chunk (safe processing limit)
        const chunks: string[] = [];

        if (fileContent.length <= CHUNK_SIZE) {
            chunks.push(fileContent);
        } else {
            const lines = fileContent.split('\n');
            let currentChunk = '';

            for (const line of lines) {
                // Handle extremely long lines (e.g. from PDFs where text is joined by spaces)
                if (line.length > CHUNK_SIZE) {
                    if (currentChunk) {
                        chunks.push(currentChunk);
                        currentChunk = '';
                    }

                    // Force split the long line
                    let remaining = line;
                    while (remaining.length > 0) {
                        // Try to split at a space if possible
                        let splitIndex = CHUNK_SIZE;
                        if (remaining.length > CHUNK_SIZE) {
                            const lastSpace = remaining.lastIndexOf(' ', CHUNK_SIZE);
                            if (lastSpace > CHUNK_SIZE * 0.8) { // Only if space is near the end
                                splitIndex = lastSpace;
                            }
                        }

                        chunks.push(remaining.substring(0, splitIndex));
                        remaining = remaining.substring(splitIndex);
                    }
                    continue;
                }

                if ((currentChunk.length + line.length) > CHUNK_SIZE) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
                currentChunk += line + '\n';
            }
            if (currentChunk) chunks.push(currentChunk);
        }

        const allProducts: Product[] = [];
        const allCustomers: Customer[] = [];

        // Process all chunks
        for (let i = 0; i < chunks.length; i++) {
            try {
                console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
                const result = await processChunk(chunks[i]);
                allProducts.push(...result.products);
                allCustomers.push(...result.customers);
            } catch (err) {
                console.error(`Error processing chunk ${i + 1}`, err);
                // Continue with other chunks if one fails, but log it
            }
        }

        // Post-process: Enforce Sequential Numeric IDs (1, 2, 3...)
        allProducts.forEach((p, index) => {
            p.id = (index + 1).toString();
        });

        if (chunks.length > 1 && allProducts.length === 0 && allCustomers.length === 0) {
            throw new Error("Failed to extract data from any part of the file.");
        }

        return { products: allProducts, customers: allCustomers };
    },

    /**
     * Convert Excel file to text format for Gemini
     */
    excelToText: async (file: File): Promise<string> => {
        const XLSX = await import('xlsx');

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });

                    let textContent = '';

                    // Convert all sheets to text
                    workbook.SheetNames.forEach(sheetName => {
                        const sheet = workbook.Sheets[sheetName];
                        const csv = XLSX.utils.sheet_to_csv(sheet);
                        textContent += `\n=== Sheet: ${sheetName} ===\n${csv}\n`;
                    });

                    resolve(textContent);
                } catch (error) {
                    reject(new Error('Failed to read Excel file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Convert PDF file to text for Gemini AI processing
     */
    pdfToText: async (file: File): Promise<string> => {
        try {
            const pdfjsLib = await import('pdfjs-dist');

            // Set worker source from CDN
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const typedArray = new Uint8Array(e.target?.result as ArrayBuffer);

                        const loadingTask = pdfjsLib.getDocument({
                            data: typedArray,
                        });

                        const pdf = await loadingTask.promise;
                        let fullText = '';

                        // Extract text from each page
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items
                                .map((item: any) => item.str)
                                .join('\n'); // Use newline to preserve structure
                            fullText += `\n=== Page ${i} ===\n${pageText}\n`;
                        }

                        resolve(fullText || 'No text content found in PDF');
                    } catch (error: any) {
                        console.error('PDF parse error:', error);
                        reject(new Error(`Failed to parse PDF: ${error.message || 'Unknown error'}`));
                    }
                };
                reader.onerror = () => reject(new Error('Failed to read PDF file'));
                reader.readAsArrayBuffer(file);
            });
        } catch (error: any) {
            console.error('PDF library error:', error);
            throw new Error(`PDF library failed: ${error.message || 'Check browser console'}`);
        }
    },

    /**
     * Chat with AI using business context
     * @param userMessage - User's question
     * @param businessContext - Real business data for context
     */
    chat: async (userMessage: string, businessContext: {
        products: { name: string; price: number; stock: number }[];
        customers: { name: string; balance: number; phone?: string; openingBalance?: number }[];
        invoices: { customerName: string; total: number; status: string; date: string }[];
        payments?: { customerName: string; amount: number; date: string; mode?: string }[];
        todaySales: number;
        totalReceivables: number;
        totalInventoryValue: number;
        financialYearStart?: string;
        totalSalesThisYear?: number;
        totalCollectionsThisYear?: number;
    }, chatHistory: { sender: 'user' | 'ai'; text: string }[] = []): Promise<string> => {
        const apiKey = AIService.getApiKey();

        if (!apiKey) {
            // Fallback to basic responses without AI
            return AIService.getBasicResponse(userMessage, businessContext);
        }

        const systemPrompt = `You are JLS Assistant, a smart business assistant for a billing and inventory app.

CRITICAL RULES:
1. ONLY use the EXACT data provided below. DO NOT make up or fabricate any information.
2. If data is empty (0 products, 0 invoices), say "No data found" - DO NOT invent fake data.
3. If asked about something not in the data, say "I don't have that information."
4. Use the EXACT numbers, names, and dates from the provided data.
5. Today's date is: ${new Date().toLocaleDateString('en-IN')}
6. Financial Year: ${businessContext.financialYearStart || 'April 2024'} to March 2025

FORMAT GUIDELINES:
- Use emojis for visual appeal
- Format numbers with Indian Rupee (₹) symbol, use commas (e.g., ₹1,00,000)
- Understand Hindi keywords: kitna, becha, bikri, maal, baaki, udhar, grahak, hisab, ledger, khata
- Be concise but informative
- For ledger requests, show opening balance + sales - payments = closing balance
- Use context from previous messages if the user asks a follow-up question (e.g., "how about last month?" refers to the previous topic).

ACTUAL BUSINESS DATA (USE ONLY THIS):
- Total Products: ${businessContext.products.length}
- Total Customers: ${businessContext.customers.length}
- Total Invoices: ${businessContext.invoices.length}
- Today's Sales: ₹${businessContext.todaySales.toLocaleString('en-IN')}
- Total Receivables (Pending): ₹${businessContext.totalReceivables.toLocaleString('en-IN')}
- Inventory Value: ₹${businessContext.totalInventoryValue.toLocaleString('en-IN')}
${businessContext.totalSalesThisYear ? `- Total Sales This FY: ₹${businessContext.totalSalesThisYear.toLocaleString('en-IN')}` : ''}
${businessContext.totalCollectionsThisYear ? `- Total Collections This FY: ₹${businessContext.totalCollectionsThisYear.toLocaleString('en-IN')}` : ''}

Products (EXACT DATA): ${businessContext.products.length > 0 ? JSON.stringify(businessContext.products.slice(0, 20)) : 'No products'}

Customers with Opening Balance (EXACT DATA): ${businessContext.customers.length > 0 ? JSON.stringify(businessContext.customers.slice(0, 20)) : 'No customers'}

Invoices (EXACT DATA): ${businessContext.invoices.length > 0 ? JSON.stringify(businessContext.invoices.slice(0, 30)) : 'No invoices'}

Payments Received (EXACT DATA): ${businessContext.payments && businessContext.payments.length > 0 ? JSON.stringify(businessContext.payments.slice(0, 30)) : 'No payments recorded'}`;

        // Format history for Gemini API
        // Limit history to last 10 messages to avoid token limits
        const recentHistory = chatHistory.slice(-10).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: 'Understood! I am JLS Assistant, ready to help with your business queries using the context provided.' }] },
                        ...recentHistory,
                        { role: 'user', parts: [{ text: userMessage }] }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (!response.ok) {
                console.warn('Gemini API error, using fallback');
                return AIService.getBasicResponse(userMessage, businessContext);
            }

            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return reply || AIService.getBasicResponse(userMessage, businessContext);

        } catch (error) {
            console.error('AI Chat error:', error);
            return AIService.getBasicResponse(userMessage, businessContext);
        }
    },

    /**
     * Basic response fallback when Gemini is not available
     * Provides elaborate, itemized responses
     */
    getBasicResponse: (userMessage: string, context: any): string => {
        const lower = userMessage.toLowerCase();

        // Sales / Revenue Query
        if (lower.includes('sale') || lower.includes('revenue') || lower.includes('bech') || lower.includes('bikri')) {
            const todayInvoices = context.invoices.filter((i: any) => i.date === new Date().toISOString().split('T')[0]);
            let response = `📊 **Today's Sales Report**\n\n💰 Total: ₹${context.todaySales.toLocaleString('en-IN')}\n📝 Invoices: ${todayInvoices.length}\n\n`;
            if (todayInvoices.length > 0) {
                response += `**Invoice Details:**\n`;
                todayInvoices.slice(0, 10).forEach((inv: any, i: number) => {
                    response += `${i + 1}. ${inv.customerName} - ₹${inv.total.toLocaleString('en-IN')} (${inv.status})\n`;
                });
                if (todayInvoices.length > 10) response += `...+${todayInvoices.length - 10} more`;
            }
            return response;
        }

        // Stock / Inventory Query
        if (lower.includes('stock') || lower.includes('inventory') || lower.includes('maal') || lower.includes('godown')) {
            let response = `📦 **Inventory Report**\n\n💰 Total Value: ₹${context.totalInventoryValue.toLocaleString('en-IN')}\n📦 Total Items: ${context.products.length}\n\n`;
            response += `**Item-wise Breakdown:**\n`;
            context.products.slice(0, 15).forEach((p: any, i: number) => {
                const itemValue = p.price * p.stock;
                response += `${i + 1}. ${p.name}\n   Qty: ${p.stock} × ₹${p.price.toLocaleString('en-IN')} = ₹${itemValue.toLocaleString('en-IN')}\n`;
            });
            if (context.products.length > 15) response += `\n...+${context.products.length - 15} more items`;
            return response;
        }

        // Pending / Receivables Query
        if (lower.includes('pending') || lower.includes('receivable') || lower.includes('baaki') || lower.includes('udhar') || lower.includes('lena')) {
            const pendingCustomers = context.customers.filter((c: any) => c.balance > 0).sort((a: any, b: any) => b.balance - a.balance);
            let response = `💰 **Pending Receivables Report**\n\n📊 Total Baaki: ₹${context.totalReceivables.toLocaleString('en-IN')}\n👥 From: ${pendingCustomers.length} customers\n\n`;
            if (pendingCustomers.length > 0) {
                response += `**Customer-wise Details:**\n`;
                pendingCustomers.slice(0, 15).forEach((c: any, i: number) => {
                    response += `${i + 1}. ${c.name} - ₹${c.balance.toLocaleString('en-IN')}\n`;
                });
                if (pendingCustomers.length > 15) response += `...+${pendingCustomers.length - 15} more`;
            }
            return response;
        }

        // Customer Query
        if (lower.includes('customer') || lower.includes('grahak') || lower.includes('party')) {
            let response = `👥 **Customer Report**\n\n📊 Total Customers: ${context.customers.length}\n\n`;
            response += `**Customer List:**\n`;
            context.customers.slice(0, 15).forEach((c: any, i: number) => {
                const balanceStr = c.balance > 0 ? ` (Pending: ₹${c.balance.toLocaleString('en-IN')})` : '';
                response += `${i + 1}. ${c.name}${c.phone ? ' - ' + c.phone : ''}${balanceStr}\n`;
            });
            if (context.customers.length > 15) response += `...+${context.customers.length - 15} more`;
            return response;
        }

        // Product Query
        if (lower.includes('product') || lower.includes('item') || lower.includes('saman')) {
            let response = `📦 **Product List**\n\n📊 Total Products: ${context.products.length}\n\n`;
            context.products.slice(0, 15).forEach((p: any, i: number) => {
                response += `${i + 1}. ${p.name}\n   Price: ₹${p.price.toLocaleString('en-IN')} | Stock: ${p.stock}\n`;
            });
            if (context.products.length > 15) response += `...+${context.products.length - 15} more`;
            return response;
        }

        // Ledger / Khata Query - Full Financial Year
        if (lower.includes('ledger') || lower.includes('khata') || lower.includes('year') || lower.includes('financial')) {
            const now = new Date();
            const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
            const fyStartStr = fyStart.toISOString().split('T')[0];

            // Calculate totals for financial year
            const fyInvoices = context.invoices.filter((i: any) => i.date >= fyStartStr);
            const totalFySales = fyInvoices.reduce((sum: number, i: any) => sum + i.total, 0);
            const paidFySales = fyInvoices.filter((i: any) => i.status === 'PAID').reduce((sum: number, i: any) => sum + i.total, 0);

            // Calculate opening balance (sum of customer opening balances)
            const totalOpeningBalance = context.customers.reduce((sum: number, c: any) => sum + (c.openingBalance || 0), 0);

            let response = `📋 **Full Financial Year Ledger**\n`;
            response += `📅 FY: April ${fyStart.getFullYear()} - March ${fyStart.getFullYear() + 1}\n\n`;

            response += `💰 **Opening Balance**: ₹${totalOpeningBalance.toLocaleString('en-IN')}\n`;
            response += `📊 **Total Credit Sales (FY)**: ₹${totalFySales.toLocaleString('en-IN')}\n`;
            response += `✅ **Total Collections (FY)**: ₹${paidFySales.toLocaleString('en-IN')}\n`;
            response += `💵 **Closing Balance**: ₹${context.totalReceivables.toLocaleString('en-IN')}\n\n`;

            response += `**Customer-wise Ledger:**\n`;
            const pendingCustomers = context.customers.filter((c: any) => c.balance > 0 || (c.openingBalance && c.openingBalance > 0)).sort((a: any, b: any) => b.balance - a.balance);
            pendingCustomers.slice(0, 15).forEach((c: any, i: number) => {
                const openBal = c.openingBalance || 0;
                response += `${i + 1}. ${c.name}\n`;
                response += `   Opening: ₹${openBal.toLocaleString('en-IN')} → Current: ₹${c.balance.toLocaleString('en-IN')}\n`;
            });
            if (pendingCustomers.length > 15) response += `...+${pendingCustomers.length - 15} more`;

            return response;
        }

        // Report / Summary Query
        if (lower.includes('report') || lower.includes('summary') || lower.includes('hisab')) {
            return `📋 **Business Summary Report**

💰 **Sales Today**
   Amount: ₹${context.todaySales.toLocaleString('en-IN')}
   Invoices: ${context.invoices.filter((i: any) => i.date === new Date().toISOString().split('T')[0]).length}

📦 **Inventory**
   Value: ₹${context.totalInventoryValue.toLocaleString('en-IN')}
   Products: ${context.products.length}

💸 **Receivables (Baaki)**
   Total: ₹${context.totalReceivables.toLocaleString('en-IN')}
   Pending from: ${context.customers.filter((c: any) => c.balance > 0).length} customers

👥 **Customers**
   Total: ${context.customers.length}`;
        }

        // Greeting
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('namaste')) {
            return `Hello! 👋 I'm JLS Assistant.\n\nI can help you with:\n• 📊 Sales Report - "Aaj kitna becha?"\n• 📦 Stock Report - "Kitna maal hai?"\n• 💰 Pending - "Kitna baaki hai?"\n• 👥 Customers - "Customer list dikhao"\n• 📋 Full Report - "Business summary do"`;
        }

        return `I can help with:\n\n📊 **Sales** - "Show today's sales"\n📦 **Stock** - "Kitna stock hai?"\n💰 **Pending** - "Baaki kitna hai?"\n👥 **Customers** - "Customer list"\n📋 **Report** - "Business summary"\n\nAsk me anything about your business!`;
        // existing extractFromExcel ...
    },

    translateContent: async (text: string, targetLang: 'Hindi' | 'Hinglish' | 'English' = 'Hinglish'): Promise<string> => {
        const apiKey = AIService.getApiKey();
        if (!apiKey || targetLang === 'English') return text;

        // Simple hash for caching
        const hash = text.length + text.substring(0, 20);
        const cacheKey = `msg_trans_${targetLang}_${hash}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;

        const prompt = `Translate the following business message to natural ${targetLang}. 
        Keep all numbers, currency symbols, star/bold formatting (*text*) and newlines exactly as is. 
        Do not change any values. Only translate the conversational parts. 
        Return ONLY the translated text.

        Message:
        ${text}`;

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2, // Low temp for accuracy
                        maxOutputTokens: 800,
                    }
                })
            });

            if (!response.ok) return text;
            const data = await response.json();
            const translated = data.candidates?.[0]?.content?.parts?.[0]?.text || text;
            
            if (translated !== text) {
                try {
                    localStorage.setItem(cacheKey, translated);
                } catch (e) {
                    // Ignore storage errors
                }
            }
            
            return translated;
        } catch (error) {
            console.error("Translation Failed:", error);
            return text;
        }
    },

    translateInvoiceData: async (invoice: any, targetLang: 'Hindi' | 'Hinglish' | 'English'): Promise<any> => {
        const apiKey = AIService.getApiKey();
        if (!apiKey || (targetLang as string) === 'English') return invoice;

        // Caching logic to speed up repeated conversions
        const cacheKey = `trans_${targetLang}_${invoice.id}_${invoice.total}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                console.log("AI: Using cached translation");
                return JSON.parse(cached);
            } catch (e) {
                localStorage.removeItem(cacheKey);
            }
        }

        console.log(`AI: Translating invoice to ${targetLang}...`);

        const systemPrompt = `You are a professional business translator. Translate the following invoice data into ${targetLang}.
        
        Guidelines:
        1. Use professional business terminology (e.g., for Hindi use "पक्का बिल" or "कर बीजक" for Tax Invoice).
        2. For Hinglish, keep technical terms in English but use Hindi for connectors and common words.
        3. Translate item descriptions accurately.
        4. Translate "amountInWords" into a natural sounding currency string in ${targetLang} (e.g., "Five Hundred Rupees Only" -> "पाँच सौ रुपये मात्र").
        5. Translate all labels provided in the 'labels' object.
        6. CRITICAL: Keep all numbers, dates, currency symbols (₹), and IDs exactly as they are.
        7. Return ONLY a valid JSON object matching the input structure. No explanations.`;

        const dataToTranslate = {
            items: invoice.items.map((i: any) => ({ description: i.description })),
            customerName: invoice.customerName,
            labels: {
                billedTo: "Bill To:",
                invoice: invoice.gstEnabled ? "TAX INVOICE" : "INVOICE",
                invoiceDetails: "INVOICE DETAILS",
                date: "Date:",
                invoiceNo: "Invoice #:",
                mode: "Mode:",
                desc: "DESCRIPTION",
                qty: "QTY",
                rate: "RATE",
                amount: "AMOUNT",
                subtotal: "Subtotal:",
                total: "Total:",
                amtWords: "Amount in Words:",
                scanToPay: "Scan to Pay:",
                thankYou: "Thank you for your business!"
            },
            amountInWords: invoice.totalInWords || ""
        };

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${systemPrompt}\n\nData: ${JSON.stringify(dataToTranslate)}` }] }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("AI Translation Request Failed", response.status, errorData);
                
                // If API key is invalid, clear it so user can re-enter
                if (response.status === 400 && errorData.error?.message?.includes('API key')) {
                    AIService.removeApiKey();
                    throw new Error("Invalid Gemini API Key. Please re-enter it in Settings.");
                }
                
                const errorMessage = errorData.error?.message || `Network Error (${response.status})`;
                if (response.status === 401 || response.status === 403 || errorMessage.toLowerCase().includes('api key')) {
                    AIService.removeApiKey();
                    throw new Error("Invalid Gemini API Key. Please re-enter it in Settings.");
                }
                throw new Error(`${errorMessage}. Please check your internet connection.`);
            }
            const data = await response.json();
            const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const translated = JSON.parse(textContent);

            console.log("AI: Translation received", translated);

            // Map back to invoice structure
            const newInvoice = JSON.parse(JSON.stringify(invoice));

            // Translate items
            if (translated.items && Array.isArray(translated.items)) {
                translated.items.forEach((ti: any, idx: number) => {
                    if (newInvoice.items[idx] && ti.description) {
                        newInvoice.items[idx].description = ti.description;
                    }
                });
            }

            if (translated.customerName) {
                newInvoice.customerName = translated.customerName;
            }
            if (translated.customerAddress) {
                newInvoice.customerAddress = translated.customerAddress;
            }

            const result = {
                ...newInvoice,
                totalInWords: translated.amountInWords || newInvoice.totalInWords,
                translatedLabels: translated.labels
            };

            // Cache the result
            try {
                localStorage.setItem(cacheKey, JSON.stringify(result));
            } catch (e) {
                // If storage full, clear old translations
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('trans_')) {
                        localStorage.removeItem(key);
                    }
                }
            }

            return result;
        } catch (error) {
            console.error("Invoice Translation Failed:", error);
            return invoice;
        }
    }
};

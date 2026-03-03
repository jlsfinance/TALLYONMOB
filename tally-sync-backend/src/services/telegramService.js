const axios = require('axios');
const { supabase } = require('../config/supabase');
const mailService = require('./mailService');

class TelegramService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.apiUrl = `https://api.telegram.org/bot${this.token}`;
        // In-memory store for user's selected company
        this.userCompanySelection = new Map();
    }

    // Get user's selected company ID
    getSelectedCompany(chatId) {
        return this.userCompanySelection.get(chatId) || null;
    }

    getMainMenu() {
        return {
            keyboard: [
                [{ text: "📊 Summary" }, { text: "📡 Status" }],
                [{ text: "📖 Ledgers" }, { text: "📑 Vouchers" }],
                [{ text: "💰 P&L" }, { text: "🔎 Outstanding" }],
                [{ text: "🏢 Change Company" }, { text: "🛠 Help" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        };
    }

    // Set user's selected company
    setSelectedCompany(chatId, companyId, companyName) {
        this.userCompanySelection.set(chatId, { id: companyId, name: companyName });
    }

    async handleStartCommand(chatId) {
        try {
            const { data: user } = await supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('telegram_chat_id', chatId)
                .single();

            if (user) {
                const selected = this.getSelectedCompany(chatId);
                const userName = this.escapeHtml(user.full_name || user.email);
                let welcomeMsg = `Abey tu toh pehle se login hai <b>${userName}</b>! 😂\n\nPhir kyun pareshan kar raha hai? Kaam bol kya dikhaun?`;

                if (selected) {
                    welcomeMsg += `\n\n🏢 Active Company: <b>${this.escapeHtml(selected.name)}</b>`;
                }

                const keyboard = this.getMainMenu();
                return await this.sendMessage(chatId, welcomeMsg, keyboard);
            }

            // New User flow
            await this.sendMessage(chatId, "Welcome to *TallyLink*! 🚀\n\nTo see your Tally data, I need to verify your account first.\n\nType `/auth your_email@example.com` to start.");
        } catch (error) {
            await this.sendMessage(chatId, "Welcome to *TallyLink*! 🚀\n\nType `/auth your_email@example.com` to get started.");
        }
    }

    async handleMessage(message) {
        const chatId = message.chat.id.toString();
        const text = message.text ? message.text.trim() : '';
        const command = text.startsWith('/') ? text.split(' ')[0].toLowerCase() : text.toLowerCase();
        const args = text.startsWith('/') ? text.split(' ').slice(1) : [];

        if (!this.token) {
            console.error('TELEGRAM_BOT_TOKEN not set in environment variables');
            return;
        }

        // 0. Auto-detect Email or OTP (User friendly)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const otpRegex = /^\d{6}$/;

        if (emailRegex.test(text)) {
            return await this.handleAuthCommand(chatId, text);
        }
        if (otpRegex.test(text)) {
            return await this.handleVerifyCommand(chatId, text);
        }

        // 1. Handle Commands
        switch (command) {
            case '/start':
                await this.handleStartCommand(chatId);
                break;

            case '/auth':
                await this.handleAuthCommand(chatId, args[0]);
                break;

            case '/verify':
                await this.handleVerifyCommand(chatId, args[0]);
                break;

            case '/status':
            case '📡 status':
                await this.handleStatusCommand(chatId);
                break;

            case '/summary':
            case '📊 summary':
                await this.handleSummaryCommand(chatId);
                break;

            case '/ledgers':
            case '📖 ledgers':
                await this.handleLedgersCommand(chatId);
                break;

            case '/vouchers':
            case '📑 vouchers':
                await this.handleVouchersCommand(chatId, args[0]); // Optional type filter
                break;

            case '/select':
            case '🏢 change company':
                await this.handleSelectCompany(chatId);
                break;

            case '💰 p&l':
                await this.handleAIQuery(chatId, 'profit loss dikhao');
                break;

            case '🔎 outstanding':
                await this.handleAIQuery(chatId, 'outstanding receivable report');
                break;

            case '/help':
            case '🛠 help':
                await this.sendMessage(chatId, "🛠 <b>TallyLink Bot Help</b>\n\n" +
                    "<b>📋 Commands:</b>\n" +
                    "• /select - Choose a company 🏢\n" +
                    "• /status - Check sync status 📡\n" +
                    "• /summary - Business summary 📊\n" +
                    "• /ledgers - Top 10 ledgers 📖\n" +
                    "• /vouchers - Recent entries 📑\n\n" +
                    "<b>🔍 Smart Search (just type!):</b>\n" +
                    "• <i>Ramesh ka balance</i> → Party balance\n" +
                    "• <i>aaj ki sale</i> → Today's sales\n" +
                    "• <i>profit dikhao</i> → P&amp;L quick view\n" +
                    "• <i>outstanding report</i> → Receivable list\n" +
                    "• <i>top customers</i> → Top 10 by revenue\n" +
                    "• <i>stock Cement</i> → Item stock check\n" +
                    "• <i>pichle mahine purchase</i> → Last month's purchases\n\n" +
                    "💡 <i>Hindi ya English mein kuch bhi puchho!</i>");
                break;

            default:
                // 🧠 Advanced AI Logic: Context-Aware query
                await this.handleAIQuery(chatId, text);
        }
    }

    async handleSelectCompany(chatId) {
        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, "⚠️ Please `/auth` first.");

            const { data: companies } = await supabase
                .from('companies')
                .select('id, name')
                .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);

            if (!companies || !companies.length) {
                return this.sendMessage(chatId, "📉 No companies found in your account.");
            }

            const inlineKeyboard = {
                inline_keyboard: companies.map(c => ([{
                    text: c.name,
                    callback_data: `select_company:${c.id}`
                }]))
            };

            await this.sendMessage(chatId, "🏢 <b>Select a Company to focus on:</b>", inlineKeyboard);
        } catch (error) {
            console.error('Select Company Error:', error);
            await this.sendMessage(chatId, "⚠️ Failed to fetch companies.");
        }
    }

    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id.toString();
        const data = callbackQuery.data;

        if (data.startsWith('select_company:')) {
            const companyId = data.split(':')[1];
            try {
                const { data: company } = await supabase
                    .from('companies')
                    .select('name')
                    .eq('id', companyId)
                    .single();

                if (company) {
                    this.setSelectedCompany(chatId, companyId, company.name);
                    await this.answerCallbackQuery(callbackQuery.id, `Selected: ${company.name}`);
                    await this.sendMessage(chatId, `✅ Now viewing data for: <b>${this.escapeHtml(company.name)}</b>`, this.getMainMenu());
                }
            } catch (error) {
                console.error('Callback Error:', error);
                await this.answerCallbackQuery(callbackQuery.id, "❌ Selection failed.");
            }
        }
    }

    async answerCallbackQuery(callbackQueryId, text) {
        try {
            await axios.post(`${this.apiUrl}/answerCallbackQuery`, {
                callback_query_id: callbackQueryId,
                text: text
            });
        } catch (error) {
            console.error('Error answering callback query:', error.message);
        }
    }

    async handleLedgersCommand(chatId) {
        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, "⚠️ Please `/auth` first.");

            let companyIds = [];
            let headerText = "📖 <b>Top 10 Ledgers &amp; Balances:</b>\n";

            const selected = this.getSelectedCompany(chatId);
            if (selected) {
                companyIds = [selected.id];
                headerText = `📖 <b>Top 10 Ledgers for ${this.escapeHtml(selected.name)}:</b>\n`;
            } else {
                const { data: companies } = await supabase.from('companies').select('id').or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
                if (!companies || !companies.length) return this.sendMessage(chatId, "📉 No companies found.");
                companyIds = companies.map(c => c.id);
            }

            const { data: ledgers } = await supabase
                .from('ledgers')
                .select('name, closing_balance')
                .in('company_id', companyIds)
                .order('closing_balance', { ascending: false })
                .limit(10);

            let response = headerText + "\n";
            if (!ledgers || !ledgers.length) response += "<i>No ledger data available</i>";

            ledgers?.forEach(l => {
                const balance = Number(l.closing_balance);
                const type = balance >= 0 ? 'Dr' : 'Cr';
                response += `• <b>${this.escapeHtml(l.name)}</b>: ₹${Math.abs(balance).toLocaleString('en-IN')} ${type}\n`;
            });

            if (!selected && companyIds.length > 1) {
                response += "\n💡 <i>Tip: Use /select to pick one company for specific data.</i>";
            }

            await this.sendMessage(chatId, response);
        } catch (error) {
            await this.sendMessage(chatId, "⚠️ Error fetching ledgers.");
        }
    }

    async handleVouchersCommand(chatId, type) {
        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, "⚠️ Please `/auth` first.");

            let companyIds = [];
            let headerText = `📑 <b>Recent ${type || ''} Vouchers:</b>\n`;

            const selected = this.getSelectedCompany(chatId);
            if (selected) {
                companyIds = [selected.id];
                headerText = `📑 <b>Recent ${type || ''} Vouchers for ${this.escapeHtml(selected.name)}:</b>\n`;
            } else {
                const { data: companies } = await supabase.from('companies').select('id').or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
                if (!companies || !companies.length) return this.sendMessage(chatId, "📉 No companies found.");
                companyIds = companies.map(c => c.id);
            }

            let query = supabase
                .from('vouchers')
                .select('vch_date, voucher_type, amount, party_ledger_name')
                .in('company_id', companyIds)
                .order('vch_date', { ascending: false })
                .limit(5);

            if (type) query = query.ilike('voucher_type', type);

            const { data: vouchers } = await query;

            let response = headerText + "\n";
            if (!vouchers || !vouchers.length) response += "<i>No vouchers found</i>";

            vouchers?.forEach(v => {
                response += `📅 ${new Date(v.vch_date).toLocaleDateString()} | <b>${this.escapeHtml(v.party_ledger_name)}</b>\n`;
                response += `💰 ₹${Number(v.amount).toLocaleString('en-IN')} (${v.voucher_type})\n\n`;
            });

            await this.sendMessage(chatId, response);
        } catch (error) {
            await this.sendMessage(chatId, "⚠️ Error fetching vouchers.");
        }
    }

    /**
     * handleAIQuery - Smart Financial AI with Hindi + English NLP
     * Understands natural language queries and fetches relevant Tally data
     */
    async handleAIQuery(chatId, text) {
        const lowerText = text.toLowerCase().trim();

        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, this.getSmartResponse(lowerText));

            let companyIds = [];
            const selected = this.getSelectedCompany(chatId);
            if (selected) {
                companyIds = [selected.id];
            } else {
                const { data: companies } = await supabase.from('companies').select('id').or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
                if (!companies || !companies.length) return this.sendMessage(chatId, "📉 No companies found.");
                companyIds = companies.map(c => c.id);
            }

            if (!companyIds.length) return this.sendMessage(chatId, "📉 No companies found.");

            const companyLabel = selected ? this.escapeHtml(selected.name) : 'All Companies';
            const header = `🤖 <b>Smart Search</b> | <i>${companyLabel}</i>\n\n`;

            // ====== INTENT DETECTION ======

            // --- INTENT 1: Party/Ledger Balance ---
            const balancePatterns = /(?:balance|bakaya|baki|hisaab|hisab|ledger|khata|account|udhar|jama)\s*(?:of|ka|ki|ke|for|dikha|batao|bata)?\s*(.*)/i;
            const reverseBalancePatterns = /(.*?)\s*(?:ka|ki|ke)\s*(?:balance|bakaya|baki|hisaab|hisab|khata|udhar)/i;
            const balanceMatch = lowerText.match(balancePatterns) || lowerText.match(reverseBalancePatterns);

            if (balanceMatch || lowerText.includes('balance') || lowerText.includes('bakaya') || lowerText.includes('hisaab') || lowerText.includes('hisab')) {
                let searchName = (balanceMatch ? balanceMatch[1] : '').trim();
                // Clean common noise words
                searchName = searchName.replace(/\b(show|me|the|mera|mere|meri|total|ka|ki|ke|hai|kya|kitna|kitni|please|bhai|sir|ji|do|de|batao|bata|dikha|dikhao)\b/gi, '').trim();

                if (searchName.length > 1) {
                    const { data: ledgers } = await supabase
                        .from('ledgers')
                        .select('name, current_balance, parent, phone, email, gstin')
                        .in('company_id', companyIds)
                        .ilike('name', `%${searchName}%`)
                        .limit(8);

                    if (ledgers && ledgers.length === 1) {
                        const l = ledgers[0];
                        const bal = Number(l.current_balance || 0);
                        let msg = `${header}📒 <b>${this.escapeHtml(l.name)}</b>\n\n`;
                        msg += `💰 Balance: <b>₹${Math.abs(bal).toLocaleString('en-IN')} ${bal >= 0 ? 'Dr' : 'Cr'}</b>\n`;
                        if (l.parent) msg += `📁 Group: ${this.escapeHtml(l.parent)}\n`;
                        if (l.gstin) msg += `🔖 GSTIN: <code>${this.escapeHtml(l.gstin)}</code>\n`;
                        if (l.phone) msg += `📞 Phone: ${this.escapeHtml(l.phone)}\n`;
                        if (l.email) msg += `📧 Email: ${this.escapeHtml(l.email)}\n`;
                        return this.sendMessage(chatId, msg);
                    } else if (ledgers && ledgers.length > 1) {
                        let msg = `${header}🔍 <b>${ledgers.length} matching accounts found:</b>\n\n`;
                        ledgers.forEach((l, i) => {
                            const bal = Number(l.current_balance || 0);
                            msg += `${i + 1}. <b>${this.escapeHtml(l.name)}</b> — ₹${Math.abs(bal).toLocaleString('en-IN')} ${bal >= 0 ? 'Dr' : 'Cr'}\n`;
                        });
                        msg += `\n<i>💡 Zyada specific naam bhejein for full details</i>`;
                        return this.sendMessage(chatId, msg);
                    } else {
                        return this.sendMessage(chatId, `${header}❌ "<b>${this.escapeHtml(searchName)}</b>" naam se koi account nahi mila.\n\n<i>Try: "Ramesh ka balance" ya "Cash balance"</i>`);
                    }
                }
            }

            // --- INTENT 2: Sales / Revenue Query ---
            if (/\b(sales|sale|revenue|kamai|bikri|becha|biki|turnover|sell)\b/i.test(lowerText)) {
                const { start, end, label } = this.extractDateRange(lowerText);
                const { data: vouchers } = await supabase
                    .from('vouchers')
                    .select('grand_total, total_amount')
                    .in('company_id', companyIds)
                    .ilike('voucher_type', '%Sales%')
                    .gte('voucher_date', start)
                    .lte('voucher_date', end);

                const total = (vouchers || []).reduce((s, v) => s + Math.abs(Number(v.grand_total || v.total_amount || 0)), 0);
                const count = (vouchers || []).length;
                let msg = `${header}📈 <b>Sales Summary (${label})</b>\n\n`;
                msg += `💰 Total Sales: <b>₹${total.toLocaleString('en-IN')}</b>\n`;
                msg += `📑 Invoices: <b>${count}</b>\n`;
                if (count > 0) msg += `📊 Avg Invoice: <b>₹${Math.round(total / count).toLocaleString('en-IN')}</b>`;
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 3: Purchase Query ---
            if (/\b(purchase|khareed|khareedari|kharid|buying|buy)\b/i.test(lowerText)) {
                const { start, end, label } = this.extractDateRange(lowerText);
                const { data: vouchers } = await supabase
                    .from('vouchers')
                    .select('grand_total, total_amount')
                    .in('company_id', companyIds)
                    .ilike('voucher_type', '%Purchase%')
                    .gte('voucher_date', start)
                    .lte('voucher_date', end);

                const total = (vouchers || []).reduce((s, v) => s + Math.abs(Number(v.grand_total || v.total_amount || 0)), 0);
                let msg = `${header}🛒 <b>Purchase Summary (${label})</b>\n\n`;
                msg += `💸 Total Purchases: <b>₹${total.toLocaleString('en-IN')}</b>\n`;
                msg += `📑 Bills: <b>${(vouchers || []).length}</b>`;
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 4: Profit / Loss ---
            if (/\b(profit|loss|munafa|nuksan|fayda|margin|nafa|p&l|p\s*and\s*l|kamai)\b/i.test(lowerText)) {
                const { data: ledgers } = await supabase
                    .from('ledgers')
                    .select('name, current_balance, parent')
                    .in('company_id', companyIds);

                let salesTotal = 0, purchaseTotal = 0, directExp = 0, indirectExp = 0, directInc = 0, indirectInc = 0;
                (ledgers || []).forEach(l => {
                    const bal = Math.abs(Number(l.current_balance || 0));
                    const group = (l.parent || '').toLowerCase();
                    if (group.includes('sales accounts')) salesTotal += bal;
                    else if (group.includes('purchase accounts')) purchaseTotal += bal;
                    else if (group.includes('direct expenses')) directExp += bal;
                    else if (group.includes('indirect expenses')) indirectExp += bal;
                    else if (group.includes('direct incomes')) directInc += bal;
                    else if (group.includes('indirect incomes')) indirectInc += bal;
                });

                const grossProfit = (salesTotal + directInc) - (purchaseTotal + directExp);
                const netProfit = grossProfit + indirectInc - indirectExp;

                let msg = `${header}📊 <b>Profit &amp; Loss Quick View</b>\n\n`;
                msg += `💰 Sales: <b>₹${salesTotal.toLocaleString('en-IN')}</b>\n`;
                msg += `🛒 Purchases: <b>₹${purchaseTotal.toLocaleString('en-IN')}</b>\n`;
                msg += `📦 Direct Expenses: ₹${directExp.toLocaleString('en-IN')}\n`;
                msg += `🏢 Indirect Expenses: ₹${indirectExp.toLocaleString('en-IN')}\n\n`;
                msg += `${grossProfit >= 0 ? '📈' : '📉'} Gross Profit: <b>₹${Math.abs(grossProfit).toLocaleString('en-IN')} ${grossProfit >= 0 ? '' : '(Loss)'}</b>\n`;
                msg += `${netProfit >= 0 ? '✅' : '❌'} <b>Net ${netProfit >= 0 ? 'Profit' : 'Loss'}: ₹${Math.abs(netProfit).toLocaleString('en-IN')}</b>`;
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 5: Outstanding / Receivable ---
            if (/\b(outstanding|receivable|vasool|lena|dena|baaki|pending|udhar|debtors|creditors)\b/i.test(lowerText)) {
                const isPayable = /\b(dena|pay|creditor|payable)\b/i.test(lowerText);
                const { data: ledgers } = await supabase
                    .from('ledgers')
                    .select('name, current_balance, parent')
                    .in('company_id', companyIds)
                    .ilike('parent', isPayable ? '%Sundry Creditors%' : '%Sundry Debtors%')
                    .order('current_balance', { ascending: isPayable });

                const filtered = (ledgers || []).filter(l => Math.abs(Number(l.current_balance || 0)) > 0);
                const total = filtered.reduce((s, l) => s + Math.abs(Number(l.current_balance || 0)), 0);

                let msg = `${header}${isPayable ? '💸' : '💰'} <b>${isPayable ? 'Payable (Dena)' : 'Receivable (Lena)'} Report</b>\n\n`;
                msg += `📊 Total: <b>₹${total.toLocaleString('en-IN')}</b>\n`;
                msg += `👥 Parties: <b>${filtered.length}</b>\n\n`;

                filtered.slice(0, 10).forEach((l, i) => {
                    msg += `${i + 1}. ${this.escapeHtml(l.name)} — <b>₹${Math.abs(Number(l.current_balance)).toLocaleString('en-IN')}</b>\n`;
                });

                if (filtered.length > 10) msg += `\n... and ${filtered.length - 10} more`;
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 6: Top Customers ---
            if (/\b(top|best|sabse|zyada|biggest)\b.*\b(customer|party|grahak|client)\b/i.test(lowerText)) {
                const { data: vouchers } = await supabase
                    .from('vouchers')
                    .select('party_name, grand_total, total_amount')
                    .in('company_id', companyIds)
                    .ilike('voucher_type', '%Sales%');

                const customerMap = {};
                (vouchers || []).forEach(v => {
                    const name = v.party_name || 'Cash';
                    customerMap[name] = (customerMap[name] || 0) + Math.abs(Number(v.grand_total || v.total_amount || 0));
                });
                const sorted = Object.entries(customerMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

                let msg = `${header}👥 <b>Top 10 Customers</b>\n\n`;
                sorted.forEach(([name, amount], i) => {
                    msg += `${i + 1}. <b>${this.escapeHtml(name)}</b> — ₹${Number(amount).toLocaleString('en-IN')}\n`;
                });
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 7: Top Items / Products ---
            if (/\b(top|best|sabse|zyada|biggest)\b.*\b(item|product|stock|maal|saman)\b/i.test(lowerText)) {
                const { data: items } = await supabase
                    .from('stock_items')
                    .select('name, closing_value, current_stock, rate')
                    .in('company_id', companyIds)
                    .order('closing_value', { ascending: false })
                    .limit(10);

                let msg = `${header}📦 <b>Top 10 Stock Items</b>\n\n`;
                (items || []).forEach((item, i) => {
                    const val = Number(item.closing_value || (item.current_stock * item.rate) || 0);
                    msg += `${i + 1}. <b>${this.escapeHtml(item.name)}</b>\n`;
                    msg += `   Qty: ${item.current_stock || 0} | Value: ₹${val.toLocaleString('en-IN')}\n`;
                });
                return this.sendMessage(chatId, msg);
            }

            // --- INTENT 8: Stock Check ---
            if (/\b(stock|inventory|maal|saman|godown)\b/i.test(lowerText)) {
                let searchItem = lowerText.replace(/\b(stock|inventory|maal|saman|godown|check|kya|hai|kitna|kitni|of|ka|ki|ke|show|me|the)\b/gi, '').trim();
                if (searchItem.length > 1) {
                    const { data: items } = await supabase
                        .from('stock_items')
                        .select('name, current_stock, rate, unit, closing_value')
                        .in('company_id', companyIds)
                        .ilike('name', `%${searchItem}%`)
                        .limit(5);

                    if (items && items.length > 0) {
                        let msg = `${header}📦 <b>Stock Search: "${this.escapeHtml(searchItem)}"</b>\n\n`;
                        items.forEach(item => {
                            msg += `• <b>${this.escapeHtml(item.name)}</b>\n`;
                            msg += `  Qty: ${item.current_stock || 0} ${item.unit || ''} | Rate: ₹${Number(item.rate || 0).toLocaleString('en-IN')}\n`;
                            msg += `  Value: ₹${Number(item.closing_value || 0).toLocaleString('en-IN')}\n\n`;
                        });
                        return this.sendMessage(chatId, msg);
                    }
                }
                // Fallback: show stock summary
                const { data: items } = await supabase
                    .from('stock_items')
                    .select('closing_value')
                    .in('company_id', companyIds);
                const totalVal = (items || []).reduce((s, i) => s + Number(i.closing_value || 0), 0);
                return this.sendMessage(chatId, `${header}📦 <b>Stock Summary</b>\n\nTotal Items: <b>${(items || []).length}</b>\nTotal Value: <b>₹${totalVal.toLocaleString('en-IN')}</b>\n\n<i>Specific item search karo jaise: "stock Sugar" ya "Cement ka stock"</i>`);
            }

            // --- INTENT 9: Voucher / Transaction Query ---
            if (/\b(transaction|voucher|entry|recent|aaj|today|kal)\b/i.test(lowerText)) {
                return this.handleVouchersCommand(chatId);
            }

            // --- INTENT 10: Direct name search (fuzzy ledger match) ---
            // If nothing else matches, try to find a ledger with the user's text
            const cleanedText = lowerText.replace(/\b(ka|ki|ke|hai|kya|show|me|the|tell|mera|mere|meri|please|bhai|sir|ji|do|de|batao|bata|dikha|dikhao)\b/gi, '').trim();
            if (cleanedText.length > 2) {
                const { data: ledgers } = await supabase
                    .from('ledgers')
                    .select('name, current_balance, parent')
                    .in('company_id', companyIds)
                    .ilike('name', `%${cleanedText}%`)
                    .limit(5);

                if (ledgers && ledgers.length > 0) {
                    if (ledgers.length === 1) {
                        const l = ledgers[0];
                        const bal = Number(l.current_balance || 0);
                        return this.sendMessage(chatId, `${header}📒 <b>${this.escapeHtml(l.name)}</b>\n\n💰 Balance: <b>₹${Math.abs(bal).toLocaleString('en-IN')} ${bal >= 0 ? 'Dr' : 'Cr'}</b>\n📁 Group: ${this.escapeHtml(l.parent || '-')}`);
                    }
                    let msg = `${header}🔍 Ye accounts mile hain:\n\n`;
                    ledgers.forEach((l, i) => {
                        const bal = Number(l.current_balance || 0);
                        msg += `${i + 1}. <b>${this.escapeHtml(l.name)}</b> — ₹${Math.abs(bal).toLocaleString('en-IN')} ${bal >= 0 ? 'Dr' : 'Cr'}\n`;
                    });
                    msg += `\n<i>Kisi ek ka poora naam bhejein for details</i>`;
                    return this.sendMessage(chatId, msg);
                }
            }

            // Fallback to knowledge base
            await this.sendMessage(chatId, this.getSmartResponse(lowerText));
        } catch (error) {
            console.error('AI Query Error:', error);
            await this.sendMessage(chatId, "🤖 Kuch gadbad ho gayi. Try: <i>'Ramesh ka balance'</i> ya <i>'aaj ki sale'</i> ya <i>'profit dikhao'</i>");
        }
    }

    /**
     * extractDateRange - Extracts date range from natural language
     * Supports: today, yesterday, this month, last month, this year, etc.
     */
    extractDateRange(text) {
        const now = new Date();
        const lower = text.toLowerCase();

        if (/\b(aaj|today)\b/.test(lower)) {
            const d = now.toISOString().split('T')[0];
            return { start: d, end: d, label: 'Today' };
        }
        if (/\b(kal|yesterday)\b/.test(lower)) {
            const d = new Date(now - 86400000).toISOString().split('T')[0];
            return { start: d, end: d, label: 'Yesterday' };
        }
        if (/\b(is\s*hafte|this\s*week)\b/.test(lower)) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            return { start: weekStart.toISOString().split('T')[0], end: now.toISOString().split('T')[0], label: 'This Week' };
        }
        if (/\b(is\s*mahine|this\s*month)\b/.test(lower)) {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: monthStart.toISOString().split('T')[0], end: now.toISOString().split('T')[0], label: 'This Month' };
        }
        if (/\b(pichle?\s*mahine|last\s*month)\b/.test(lower)) {
            const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            return { start: lm.toISOString().split('T')[0], end: lmEnd.toISOString().split('T')[0], label: 'Last Month' };
        }

        // Default: Full Financial Year
        const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        return { start: `${fyYear}-04-01`, end: `${fyYear + 1}-03-31`, label: `FY ${fyYear}-${(fyYear + 1).toString().slice(2)}` };
    }

    async handleAuthCommand(chatId, email) {
        if (!email || !email.includes('@')) {
            return this.sendMessage(chatId, "❌ Please provide a valid email.\nExample: `/auth user@example.com`");
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            // 1. Store code in DB
            const { error } = await supabase
                .from('telegram_auth_codes')
                .upsert({
                    email: email.toLowerCase(),
                    code,
                    chat_id: chatId,
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
                }, { onConflict: 'email' });

            if (error) throw error;

            console.log(`🔑 Verification Code for ${email}: ${code}`);

            // 2. Send Email
            try {
                await mailService.sendContactMail({
                    name: 'TallyLink Bot',
                    email: 'noreply@tallylink.com',
                    subject: 'Your Telegram Verification Code',
                    message: `Your TallyLink verification code is: ${code}\n\nEnter this code in Telegram using: /verify ${code}`
                });
                await this.sendMessage(chatId, `📧 A verification code has been sent to *${email}*.\n\nPlease type your code here to complete setup.`);
            } catch (mailError) {
                console.error('Mail Service Error (falling back to manual):', mailError.message);
                await this.sendMessage(chatId, `⚠️ Email service is currently down, but I've generated your code.\n\nSince this is a test environment, please ask the developer for the code or check server logs.`);
            }
        } catch (error) {
            console.error('Auth Error:', error);
            await this.sendMessage(chatId, "⚠️ Failed to start authentication. Please try again later.");
        }
    }

    async handleVerifyCommand(chatId, code) {
        if (!code) return this.sendMessage(chatId, "❌ Please provide the 6-digit code.\nExample: `/verify 123456`");

        try {
            // 1. Check code
            const { data: authEntry, error: fetchError } = await supabase
                .from('telegram_auth_codes')
                .select('*')
                .eq('code', code)
                .eq('chat_id', chatId)
                .single();

            if (fetchError || !authEntry) {
                return this.sendMessage(chatId, "❌ Invalid or expired code. Please try `/auth` again.");
            }

            // 2. Link chat_id to user_profile
            const { error: updateError } = await supabase
                .from('user_profiles')
                .update({ telegram_chat_id: chatId })
                .eq('email', authEntry.email);

            if (updateError) throw updateError;

            // 3. Clean up
            await supabase.from('telegram_auth_codes').delete().eq('id', authEntry.id);

            // 4. Fetch User Profile for Company Check
            const { data: user } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('email', authEntry.email)
                .single();

            if (user) {
                const { data: companies } = await supabase
                    .from('companies')
                    .select('id, name')
                    .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);

                if (companies && companies.length > 1) {
                    await this.sendMessage(chatId, "🎉 <b>Success!</b> Your account is now linked.\n\nMujhe aapke account mein Multiple Companies mili hain. Kripya ek select karein:");
                    return await this.handleSelectCompany(chatId);
                } else if (companies && companies.length === 1) {
                    const company = companies[0];
                    this.setSelectedCompany(chatId, company.id, company.name);
                    return await this.sendMessage(chatId, `🎉 <b>Success!</b> Your account is now linked.\n\nAutomatically selected: <b>${this.escapeHtml(company.name)}</b>`, this.getMainMenu());
                }
            }

            await this.sendMessage(chatId, "🎉 <b>Success!</b> Your account is now linked.\n\nYou can now use summary, status, or help buttons below!");
        } catch (error) {
            console.error('Verify Error:', error);
            await this.sendMessage(chatId, "⚠️ Verification failed. Ensure you have an account at TallyLink.");
        }
    }

    async handleStatusCommand(chatId) {
        try {
            // 1. Get user by chat_id
            const { data: user, error: userError } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('telegram_chat_id', chatId)
                .single();

            if (userError || !user) {
                return this.sendMessage(chatId, "⚠️ Your account is not linked. Use `/auth your@email.com` first.");
            }

            // 2. Get companies
            console.log(`📡 Fetching companies for User: ${user.id}...`);
            const { data: companies, error: compError } = await supabase
                .from('companies')
                .select('name, last_sync_at, is_active')
                .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);

            if (compError) {
                console.error('❌ Supabase Company Query Error:', compError);
                return this.sendMessage(chatId, "⚠️ Database error. Please contact support.");
            }

            console.log(`🏢 Found ${companies ? companies.length : 0} companies for User ${user.id}`);
            if (companies) {
                companies.forEach(c => console.log(`   - ${c.name}`));
            }

            if (!companies || !companies.length) {
                return this.sendMessage(chatId, "📉 No companies found in your account.");
            }

            const selected = this.getSelectedCompany(chatId);
            let response = "🏢 <b>Your Company Status:</b>\n\n";
            companies.forEach(c => {
                const isSelected = selected && selected.id === c.id;
                const status = c.is_active ? "🟢 Online" : "🔴 Offline";
                const lastSync = c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('en-IN') : 'Never';

                response += `${isSelected ? '👉 ' : ''}<b>${this.escapeHtml(c.name)}</b> ${isSelected ? '<i>(Selected)</i>' : ''}\n`;
                response += `Status: ${status}\n`;
                response += `Last Sync: ${this.escapeHtml(lastSync)}\n\n`;
            });

            if (!selected && companies.length > 1) {
                response += "💡 <i>Tip: Use 'Change Company' to focus on one.</i>";
            }

            await this.sendMessage(chatId, response);
        } catch (error) {
            console.error('Status Command Error:', error);
            await this.sendMessage(chatId, "⚠️ Failed to fetch status.");
        }
    }

    async handleSummaryCommand(chatId) {
        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, "⚠️ Not authenticated.");

            let companyIds = [];
            let headerText = `📊 <b>Business Summary</b>\n`;

            const selected = this.getSelectedCompany(chatId);
            if (selected) {
                companyIds = [selected.id];
                headerText = `📊 <b>Business Summary for ${this.escapeHtml(selected.name)}</b>\n`;
            } else {
                const { data: companies } = await supabase.from('companies').select('id, name').or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
                if (!companies || !companies.length) return this.sendMessage(chatId, "📉 No data available.");
                companyIds = companies.map(c => c.id);
            }

            // 3. Simple Summary (Aggregation)
            const { data: sales } = await supabase.from('sales').select('net_amount').in('company_id', companyIds);
            const { data: purchases } = await supabase.from('purchases').select('net_amount').in('company_id', companyIds);

            const totalSales = sales?.reduce((sum, item) => sum + Number(item.net_amount), 0) || 0;
            const totalPurchases = purchases?.reduce((sum, item) => sum + Number(item.net_amount), 0) || 0;

            let response = headerText + "\n";
            response += `💰 <b>Total Sales:</b> ₹${totalSales.toLocaleString('en-IN')}\n`;
            response += `🛒 <b>Total Purchases:</b> ₹${totalPurchases.toLocaleString('en-IN')}\n\n`;
            response += `⚖️ <b>Net Impact:</b> ₹${(totalSales - totalPurchases).toLocaleString('en-IN')}`;

            if (!selected && companyIds.length > 1) {
                response += "\n\n💡 <i>Tip: Use 'Change Company' to focus on one company.</i>";
            }

            await this.sendMessage(chatId, response);
        } catch (error) {
            console.error('Summary Error:', error);
            await this.sendMessage(chatId, "⚠️ Failed to generate summary.");
        }
    }

    /**
     * sendSyncReport - Sends an automated sync status update to user's Telegram
     */
    async sendSyncReport(companyId, dataType, result) {
        try {
            // 1. Get company details
            const { data: company } = await supabase.from('companies').select('name, owner_id').eq('id', companyId).single();
            if (!company) return;

            // 2. Get owner's telegram_chat_id
            const { data: user } = await supabase.from('user_profiles').select('telegram_chat_id').eq('id', company.owner_id).single();
            if (!user || !user.telegram_chat_id) return;

            // 3. Construct Message
            const statusIcon = result.success !== false ? "✅" : "❌";
            let message = `${statusIcon} *Sync Complete: ${company.name}*\n\n`;
            message += `📂 *Type:* ${dataType.toUpperCase()}\n`;
            message += `🔢 *Records:* ${result.count || 0} processed\n`;

            if (result.added) message += `➕ *Added:* ${result.added}\n`;
            if (result.updated) message += `🔄 *Updated:* ${result.updated}\n`;
            if (result.failed) message += `⚠️ *Failed:* ${result.failed}\n`;

            message += `\n🕒 *Time:* ${new Date().toLocaleTimeString()}`;

            await this.sendMessage(user.telegram_chat_id, message);
        } catch (error) {
            console.error('Error sending sync report:', error);
        }
    }

    getSmartResponse(text) {
        // TallyLink Knowledge Base
        if (text.includes('hi') || text.includes('hello')) {
            return "Namaste! How can I help you today with your TallyLink synchronization?";
        }

        if (text.includes('sync') || text.includes('how to')) {
            return "To sync your Tally data:\n1. Open Tally ERP/Prime on your PC.\n2. Open the *TallyLink Sync App*.\n3. Login and select your company.\n4. Click 'Start Sync'.\n\nYour data will appear on the web dashboard instantly!";
        }

        if (text.includes('support') || text.includes('contact') || text.includes('help')) {
            return "You can reach our lead developer *Lavneet Rathi* at:\n📧 Email: lovneetrathi@gmail.com\n📞 Phone: +91 9413821007\n\nWe are available Mon-Sat (10AM - 6PM).";
        }

        if (text.includes('price') || text.includes('pricing') || text.includes('cost')) {
            return "TallyLink offers competitive pricing for small and medium businesses. Please contact Lavneet Rathi at +91 9413821007 for a customized quote tailored to your Tally usage.";
        }

        if (text.includes('safe') || text.includes('security') || text.includes('privacy')) {
            return "Your data is 100% safe! We use bank-grade *AES-256 bit encryption*. Your financial data is encrypted on your local PC before being synced to our secure cloud (Supabase).";
        }

        if (text.includes('tallylink') || text.includes('what is')) {
            return "TallyLink is a premium cloud synchronization service for Tally ERP. It allows you to access your Tally reports, vouchers, and ledgers on any mobile or web browser in real-time.";
        }

        // Default "Smart" fallback
        return "I'm not sure I understand. Could you please rephrase? You can ask about 'sync process', 'security', 'pricing', or 'support'.";
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    async sendMessage(chatId, text, replyMarkup = null) {
        try {
            const data = {
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            };
            if (replyMarkup) {
                data.reply_markup = replyMarkup;
            }
            await axios.post(`${this.apiUrl}/sendMessage`, data);
        } catch (error) {
            console.error('Error sending Telegram message (HTML):', error.response ? error.response.data : error.message);
            // Fallback to plain text if HTML fails
            try {
                const plainText = text.replace(/<[^>]*>/g, '');
                await axios.post(`${this.apiUrl}/sendMessage`, {
                    chat_id: chatId,
                    text: plainText + "\n\n(Formatting error, sending plain text)",
                    reply_markup: replyMarkup
                });
            } catch (fallbackError) {
                console.error('Critical Error: Failed to send fallback message:', fallbackError.message);
            }
        }
    }

    /**
     * startPolling - Enables bot to work on localhost using long polling
     */
    async startPolling() {
        if (!this.token) {
            console.error('TELEGRAM_BOT_TOKEN not set. Polling skipped.');
            return;
        }

        console.log('🤖 Telegram Bot Polling started...');
        let offset = 0;

        // If webhook is set, Telegram blocks getUpdates (409). Remove webhook for polling mode.
        try {
            const webhookInfo = await axios.get(`${this.apiUrl}/getWebhookInfo`);
            const existingWebhookUrl = webhookInfo?.data?.result?.url;
            if (existingWebhookUrl) {
                await axios.post(`${this.apiUrl}/deleteWebhook`, { drop_pending_updates: false });
                console.log(`Telegram webhook cleared for polling mode: ${existingWebhookUrl}`);
            }
        } catch (webhookError) {
            console.warn('Unable to clear Telegram webhook before polling:', webhookError.message);
        }

        while (true) {
            try {
                const response = await axios.get(`${this.apiUrl}/getUpdates`, {
                    params: { offset, timeout: 30 },
                    timeout: 35000 // Slightly higher than TG timeout
                });

                const updates = response.data.result;
                for (const update of updates) {
                    if (update.message) {
                        await this.handleMessage(update.message);
                    } else if (update.callback_query) {
                        await this.handleCallbackQuery(update.callback_query);
                    }
                    offset = update.update_id + 1;
                }
            } catch (error) {
                if (error.code === 'ECONNABORTED' || error.response?.status === 502) {
                    // Normal timeout or TG server hiccup, just continue
                    continue;
                }
                console.error('Polling Error:', error.message);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
            }
        }
    }
}

module.exports = new TelegramService();


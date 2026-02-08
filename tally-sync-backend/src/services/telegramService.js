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

            case '/help':
            case '🛠 help':
                await this.sendMessage(chatId, "🛠 *TallyLink Bot Help*\n\n" +
                    "• `/select` - Choose a specific company 🏢\n" +
                    "• `/status` - Check sync status 📡\n" +
                    "• `/summary` - View business summary 📊\n" +
                    "• `/ledgers` - Top 10 ledgers 📖\n" +
                    "• `/vouchers` - Recent entries 📑\n" +
                    "• `/auth` - Link your account 🔑\n\n" +
                    "You can also use the buttons below or ask me naturally!");
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
     * handleAIQuery - Acts as a "Free Financial AI"
     * Analyzes natural language and fetches relevant Tally data.
     */
    async handleAIQuery(chatId, text) {
        const lowerText = text.toLowerCase();

        try {
            const { data: user } = await supabase.from('user_profiles').select('id').eq('telegram_chat_id', chatId).single();
            if (!user) return this.sendMessage(chatId, this.getSmartResponse(lowerText));

            let companyIds = [];
            const selected = this.getSelectedCompany(chatId);
            if (selected) {
                companyIds = [selected.id];
            } else {
                const { data: companies } = await supabase.from('companies').select('id').or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
                companyIds = companies.map(c => c.id);
            }

            if (!companyIds.length) return this.sendMessage(chatId, "📉 No companies found.");
            let header = "🤖 <b>AI Response:</b> ";

            if (selected) {
                header += `<i>(Filtering for ${this.escapeHtml(selected.name)})</i>\n`;
            } else {
                header += `<i>(Across all companies)</i>\n`;
            }

            // 1. Check for "Balance of X" or "X balance"
            if (lowerText.includes('balance') || lowerText.includes('kitna hai') || lowerText.includes('kaise')) {
                // ... (existing logic)
                let keywords = lowerText
                    .replace('balance', '')
                    .replace('kitna hai', '')
                    .replace('kaise', '')
                    .replace('batana', '')
                    .replace('dikhao', '')
                    .replace('tell me', '')
                    .replace('show', '')
                    .trim();

                if (keywords.length > 1) {
                    const { data: ledgers } = await supabase
                        .from('ledgers')
                        .select('name, closing_balance')
                        .in('company_id', companyIds)
                        .ilike('name', `%${keywords}%`)
                        .limit(5);

                    if (ledgers && ledgers.length === 1) {
                        const ledger = ledgers[0];
                        const bal = Number(ledger.closing_balance);
                        return this.sendMessage(chatId, `${header}The current balance for <b>${this.escapeHtml(ledger.name)}</b> is <b>₹${Math.abs(bal).toLocaleString('en-IN')} ${bal >= 0 ? 'Dr' : 'Cr'}</b>.`);
                    } else if (ledgers && ledgers.length > 1) {
                        let suggestionMsg = `🔍 Mujhse milte-julte <b>${ledgers.length}</b> account mile hain. Aap kiski baat kar rahe hain?\n\n`;
                        ledgers.forEach(l => {
                            suggestionMsg += `• <code>${this.escapeHtml(l.name)}</code>\n`;
                        });
                        suggestionMsg += `\n<i>Tip: Inme se koi bhi naam copy karke mujhe bhejie, main uska balance nikaal dunga!</i>`;
                        return this.sendMessage(chatId, suggestionMsg);
                    }
                }
            }

            // 2. Check for "Total Sales" or "Kamai"
            if (lowerText.includes('sales') || lowerText.includes('kamai') || lowerText.includes('becha')) {
                const { data: sales } = await supabase.from('sales').select('net_amount').in('company_id', companyIds);
                const total = sales.reduce((s, i) => s + Number(i.net_amount), 0);
                return this.sendMessage(chatId, `🤖 *AI Response:* Your total sales across all companies is *₹${total.toLocaleString('en-IN')}*. 📈`);
            }

            // 3. Check for "Recent Transactions"
            if (lowerText.includes('transaction') || lowerText.includes('voucher') || lowerText.includes('entry')) {
                return this.handleVouchersCommand(chatId);
            }

            // Fallback to knowledge base
            await this.sendMessage(chatId, this.getSmartResponse(lowerText));
        } catch (error) {
            console.error('AI Query Error:', error);
            await this.sendMessage(chatId, "🤖 I'm thinking... but I hit a snag. Try asking 'What is my balance?' or 'Show me sales summary'.");
        }
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

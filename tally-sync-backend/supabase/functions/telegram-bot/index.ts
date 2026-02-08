import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const GEMINI_API_KEY = "AIzaSyCJgOmnUemghYT8dz1e7udiDsqQ0S2F7No"

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

// ═══════════════════════════════════════════════════════════
//                    MAIN REQUEST HANDLER
// ═══════════════════════════════════════════════════════════

serve(async (req) => {
    try {
        const update = await req.json()
        const { message, callback_query } = update
        if (message) await handleMessage(message)
        else if (callback_query) await handleCallbackQuery(callback_query)
        return new Response("OK", { status: 200 })
    } catch (err: any) {
        console.error("Bot Error:", err)
        return new Response("Error", { status: 500 })
    }
})

// ═══════════════════════════════════════════════════════════
//                    MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════

async function handleMessage(message: any) {
    const chatId = message.chat.id.toString()
    const text = message.text?.trim() || ""
    const firstName = message.from?.first_name || "User"

    // Email & OTP detection (bypass auth check)
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return await handleAuthCommand(chatId, text)
    if (/^\d{6}$/.test(text)) return await handleVerifyCommand(chatId, text)

    // ══════════════════════════════════════════════════════════
    // STEP 1: Check if user is authenticated
    // ══════════════════════════════════════════════════════════
    const { data: user } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, selected_company_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle()

    if (!user) {
        // NOT AUTHENTICATED - Show welcome & ask for email
        return await showWelcomeAuth(chatId, firstName)
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: Check if company is selected
    // ══════════════════════════════════════════════════════════
    const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)

    if (!companies || companies.length === 0) {
        // NO COMPANIES - Tell user to sync Tally first
        return await showNoCompanies(chatId, user.full_name || user.email.split('@')[0])
    }

    // If only 1 company, auto-select it
    let selectedCompanyId = user.selected_company_id
    if (!selectedCompanyId) {
        if (companies.length === 1) {
            selectedCompanyId = companies[0].id
            await supabase.from("user_profiles").update({ selected_company_id: selectedCompanyId }).eq("id", user.id)
        } else {
            // Multiple companies, none selected - ask to select
            return await showCompanySelection(chatId, companies, user.full_name || user.email.split('@')[0])
        }
    }

    // ══════════════════════════════════════════════════════════
    // STEP 3: User is authenticated & company selected - Process command
    // ══════════════════════════════════════════════════════════
    const userName = user.full_name || user.email.split('@')[0]
    const command = text.startsWith("/") ? text.split(" ")[0].toLowerCase() : text.toLowerCase()

    switch (command) {
        case "/start":
            await showMainDashboard(chatId, userName)
            break
        case "📡 status":
        case "/status":
            await handleStatusCommand(chatId, user.id)
            break
        case "📊 summary":
        case "/summary":
            await handleSummaryCommand(chatId, user.id, selectedCompanyId)
            break
        case "📖 ledgers":
        case "/ledgers":
            await handleLedgersCommand(chatId, selectedCompanyId)
            break
        case "📑 vouchers":
        case "/vouchers":
            await handleVouchersCommand(chatId, selectedCompanyId)
            break
        case "🏢 change company":
        case "/select":
            await showCompanySelection(chatId, companies, userName)
            break
        case "🛠 help":
        case "/help":
            await sendHelp(chatId)
            break
        default:
            await handleSmartAIQuery(chatId, text, user.id, selectedCompanyId)
    }
}

// ═══════════════════════════════════════════════════════════
//                    ONBOARDING SCREENS
// ═══════════════════════════════════════════════════════════

async function showWelcomeAuth(chatId: string, firstName: string) {
    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>🎯 TallyLink Pro</b>      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

Namaste <b>${firstName}</b>! 🙏

Welcome to your <b>AI-Powered</b> Tally Assistant!

━━━━━━━━━━━━━━━━━━━━
📱 <b>STEP 1 of 2: Verify Account</b>
━━━━━━━━━━━━━━━━━━━━

Please type your <b>registered email</b> address to continue.

<i>Example: yourmail@example.com</i>`

    await sendMessage(chatId, msg)
}

async function showNoCompanies(chatId: string, userName: string) {
    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>📂 No Companies</b>       ┃
┗━━━━━━━━━━━━━━━━━━━━┛

Hi <b>${userName}</b>,

You don't have any companies synced yet.

━━━━━━━━━━━━━━━━━━━━
<b>How to sync your Tally data:</b>

1️⃣ Open <b>TallyLink Desktop App</b>
2️⃣ Start your Tally software
3️⃣ Click <b>"Sync Now"</b> button

━━━━━━━━━━━━━━━━━━━━
<i>Your data will appear here automatically</i>`

    await sendMessage(chatId, msg)
}

async function showCompanySelection(chatId: string, companies: any[], userName: string) {
    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>🏢 Select Company</b>     ┃
┗━━━━━━━━━━━━━━━━━━━━┛

Hi <b>${userName}</b>!

You have <b>${companies.length}</b> companies linked.

━━━━━━━━━━━━━━━━━━━━
<b>Choose your active company:</b>`

    const kb = {
        inline_keyboard: companies.map(c => [{
            text: `🏢 ${c.name}`,
            callback_data: `sel:${c.id}`
        }])
    }

    await sendMessage(chatId, msg, kb)
}

async function showMainDashboard(chatId: string, userName: string) {
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : hour < 21 ? "Good Evening" : "Good Night"

    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>🎯 TallyLink Pro</b>      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

${greeting}, <b>${userName}</b>! 👋

📊 <b>Your Dashboard is Ready</b>

━━━━━━━━━━━━━━━━━━━━
✨ <b>Quick Actions:</b>

Use the menu buttons below or ask:
• "Cash balance kitna hai?"
• "Aaj ki sales dikhao"
• "Ram ka balance?"

━━━━━━━━━━━━━━━━━━━━
💡 <i>Powered by AI • Real-time Data</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

// ═══════════════════════════════════════════════════════════
//                    COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleStatusCommand(chatId: string, userId: string) {
    const { data: comps } = await supabase
        .from("companies")
        .select("name, is_active, last_sync_at")
        .or(`owner_id.eq.${userId},user_id.eq.${userId}`)

    let msg = `━━━ <b>📡 System Status</b> ━━━\n\n`

    comps?.forEach((c: any) => {
        const status = c.is_active ? "🟢 Online" : "🔴 Offline"
        const sync = c.last_sync_at
            ? new Date(c.last_sync_at).toLocaleString("en-IN", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : "Never"

        msg += `🏢 <b>${c.name}</b>\n`
        msg += `   ${status}\n`
        msg += `   Last Sync: <code>${sync}</code>\n\n`
    })

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Real-time monitoring active</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

async function handleSummaryCommand(chatId: string, userId: string, companyId: string) {
    const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()
    const { data: sales } = await supabase.from("sales").select("net_amount").eq("company_id", companyId)
    const { data: purchases } = await supabase.from("purchases").select("net_amount").eq("company_id", companyId)

    const totalSales = sales?.reduce((a: any, b: any) => a + Number(b.net_amount), 0) || 0
    const totalPurchases = purchases?.reduce((a: any, b: any) => a + Number(b.net_amount), 0) || 0
    const profit = totalSales - totalPurchases

    const msg = `━━━ <b>📊 Business Summary</b> ━━━

🏢 <b>${company?.name || "Your Company"}</b>

💰 <b>Total Sales</b>
   ₹${totalSales.toLocaleString("en-IN")}

🛒 <b>Total Purchases</b>
   ₹${totalPurchases.toLocaleString("en-IN")}

${profit >= 0 ? "📈" : "📉"} <b>Net ${profit >= 0 ? "Profit" : "Loss"}</b>
   ₹${Math.abs(profit).toLocaleString("en-IN")}

━━━━━━━━━━━━━━━━━━━━
<i>Updated: ${new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

async function handleLedgersCommand(chatId: string, companyId: string) {
    const { data: ledgers } = await supabase
        .from("ledgers")
        .select("name, closing_balance")
        .eq("company_id", companyId)
        .order("closing_balance", { ascending: false })
        .limit(10)

    let msg = `━━━ <b>📖 Top Ledgers</b> ━━━\n\n`

    ledgers?.forEach((l: any, i: number) => {
        const bal = Number(l.closing_balance)
        msg += `${i + 1}. <b>${l.name}</b>\n`
        msg += `   ₹${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "Dr" : "Cr"}\n\n`
    })

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Sorted by balance</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

async function handleVouchersCommand(chatId: string, companyId: string) {
    const { data: vouchers } = await supabase
        .from("vouchers")
        .select("vch_date, party_ledger_name, amount, voucher_type")
        .eq("company_id", companyId)
        .order("vch_date", { ascending: false })
        .limit(5)

    let msg = `━━━ <b>📑 Recent Vouchers</b> ━━━\n\n`

    vouchers?.forEach((v: any) => {
        const date = new Date(v.vch_date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short' })
        msg += `📅 ${date} | <b>${v.party_ledger_name}</b>\n`
        msg += `   ₹${Number(v.amount).toLocaleString("en-IN")} <i>(${v.voucher_type})</i>\n\n`
    })

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Latest 5 entries</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

async function handleSmartAIQuery(chatId: string, text: string, userId: string, companyId: string) {
    try {
        // Check cache first
        const { data: cached } = await supabase
            .from("ai_learning_cache")
            .select("intent, subject")
            .eq("query_text", text.toLowerCase().trim())
            .maybeSingle()

        let result = cached
        if (!cached) {
            const aiResp = await callGemini(`You are TallyLink AI. User: "${text}". Reply JSON: {"intent": "BALANCE|SUMMARY|STATUS|HELP|GENERAL", "subject": "name_or_null"}`)
            result = JSON.parse(aiResp)
            if (result.intent !== "GENERAL") {
                await supabase.from("ai_learning_cache").insert({ query_text: text.toLowerCase().trim(), intent: result.intent, subject: result.subject })
            }
        }

        if (result.intent === "BALANCE" && result.subject) {
            return await handleLedgerBalance(chatId, result.subject, companyId)
        } else if (result.intent === "SUMMARY") {
            return await handleSummaryCommand(chatId, userId, companyId)
        } else if (result.intent === "STATUS") {
            return await handleStatusCommand(chatId, userId)
        } else if (result.intent === "HELP") {
            return await sendHelp(chatId)
        }

        // General AI response
        const ans = await callGemini(`Answer professionally in Hinglish about business/Tally: "${text}"`)
        await sendMessage(chatId, `💡 <b>AI Insight:</b>\n\n${ans}\n\n<i>Powered by Gemini</i>`, getMainMenu())

    } catch (e) {
        await sendMessage(chatId, `🤖 <b>I'm here to help!</b>\n\nUse the menu buttons or try:\n• "Cash balance?"\n• "Sales summary"\n• "Ram ka hisab"`, getMainMenu())
    }
}

async function handleLedgerBalance(chatId: string, subject: string, companyId: string) {
    const { data: ledgers } = await supabase
        .from("ledgers")
        .select("name, closing_balance")
        .eq("company_id", companyId)
        .ilike("name", `%${subject}%`)
        .limit(8)

    if (!ledgers?.length) {
        return sendMessage(chatId, `🔍 <b>Not Found</b>\n\nNo ledger matching "<code>${subject}</code>".\n\n<i>Tip: Try partial name</i>`, getMainMenu())
    }

    if (ledgers.length === 1) {
        const l = ledgers[0]
        const bal = Number(l.closing_balance)
        const msg = `${bal >= 0 ? "💰" : "📤"} <b>Balance Report</b>

📋 <b>Ledger:</b> ${l.name}
💵 <b>Balance:</b> ₹${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "Dr" : "Cr"}

━━━━━━━━━━━━━━━━━━━━
<i>Real-time data</i>`
        return sendMessage(chatId, msg, getMainMenu())
    }

    // Multiple matches - show buttons
    const kb = { inline_keyboard: ledgers.map(l => [{ text: `💼 ${l.name}`, callback_data: `bal:${l.name.slice(0, 50)}` }]) }
    await sendMessage(chatId, `🔍 <b>${ledgers.length} Matches Found</b>\n\nSelect the ledger:`, kb)
}

// ═══════════════════════════════════════════════════════════
//                    CALLBACK HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCallbackQuery(cb: any) {
    const chatId = cb.message.chat.id.toString()
    const data = cb.data

    if (data.startsWith("sel:")) {
        const companyId = data.split(":")[1]
        const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()

        // Save selected company
        await supabase.from("user_profiles").update({ selected_company_id: companyId }).eq("telegram_chat_id", chatId)

        const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>✅ Company Selected</b>   ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🏢 <b>${company?.name}</b>

All your reports will now show data from this company.

━━━━━━━━━━━━━━━━━━━━
<i>Use the menu below to explore</i>`

        await sendMessage(chatId, msg, getMainMenu())

    } else if (data.startsWith("bal:")) {
        const { data: user } = await supabase.from("user_profiles").select("selected_company_id").eq("telegram_chat_id", chatId).maybeSingle()
        if (user?.selected_company_id) {
            await handleLedgerBalance(chatId, data.split(":")[1], user.selected_company_id)
        }
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cb.id })
    })
}

// ═══════════════════════════════════════════════════════════
//                    AUTH HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleAuthCommand(chatId: string, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    await supabase.from("telegram_auth_codes").upsert({
        email: email.toLowerCase(),
        code,
        chat_id: chatId,
        expires_at: new Date(Date.now() + 600000).toISOString()
    }, { onConflict: "email" })

    const msg = `━━━ <b>🔐 Verification</b> ━━━

📧 <b>Email:</b> <code>${email}</code>

━━━━━━━━━━━━━━━━━━━━
🔑 <b>Your OTP Code:</b>

<code>${code}</code>

━━━━━━━━━━━━━━━━━━━━
⏱ <i>Valid for 10 minutes</i>

Type the 6-digit code above to verify.`

    await sendMessage(chatId, msg)
}

async function handleVerifyCommand(chatId: string, code: string) {
    const { data: auth } = await supabase
        .from("telegram_auth_codes")
        .select("*")
        .eq("code", code)
        .eq("chat_id", chatId)
        .maybeSingle()

    if (!auth) {
        return sendMessage(chatId, `❌ <b>Invalid Code</b>\n\nThe code is incorrect or expired.\n\n<i>Type your email again to get a new code.</i>`)
    }

    // Link the user
    await supabase.from("user_profiles").update({ telegram_chat_id: chatId }).eq("email", auth.email)
    await supabase.from("telegram_auth_codes").delete().eq("id", auth.id)

    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>✅ Verified!</b>          ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🎉 <b>Account linked successfully!</b>

Type <b>/start</b> to continue setup.`

    await sendMessage(chatId, msg)
}

async function sendHelp(chatId: string) {
    const msg = `━━━ <b>🛠 Help Center</b> ━━━

<b>📱 Menu Buttons:</b>
Use the buttons below for quick access.

<b>💬 Ask Naturally:</b>
• "Cash balance kitna hai?"
• "Ram ka hisab dikhao"
• "Aaj ki sales?"
• "Pending payments?"

<b>⚡ Commands:</b>
• /status - Sync status
• /summary - Business overview
• /ledgers - Top accounts
• /vouchers - Recent entries
• /select - Change company

━━━━━━━━━━━━━━━━━━━━
🤖 <i>Powered by Gemini AI</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

// ═══════════════════════════════════════════════════════════
//                    UTILITIES
// ═══════════════════════════════════════════════════════════

async function callGemini(prompt: string) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    return (await resp.json()).candidates[0].content.parts[0].text.trim()
}

function getMainMenu() {
    return {
        keyboard: [
            [{ text: "📊 Summary" }, { text: "📡 Status" }],
            [{ text: "📖 Ledgers" }, { text: "📑 Vouchers" }],
            [{ text: "🏢 Change Company" }, { text: "🛠 Help" }]
        ],
        resize_keyboard: true
    }
}

async function sendMessage(chatId: string, text: string, replyMarkup?: any) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup })
    })
}

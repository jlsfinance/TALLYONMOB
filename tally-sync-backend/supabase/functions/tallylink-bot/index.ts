import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const GEMINI_API_KEY = "AIzaSyCJgOmnUemghYT8dz1e7udiDsqQ0S2F7No"

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

// ═══════════════════════════════════════════════════════════
//                    FINANCIAL YEAR HELPER
// ═══════════════════════════════════════════════════════════

function getCurrentFY() {
    const now = new Date()
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
    return {
        start: `${year}-04-01`,
        end: `${year + 1}-03-31`,
        label: `FY ${year}-${(year + 1).toString().slice(-2)}`
    }
}

function getMonthRange(monthOffset: number = 0) {
    const now = new Date()
    now.setMonth(now.getMonth() - monthOffset)
    const year = now.getFullYear()
    const month = now.getMonth()
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0)
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
        label: start.toLocaleString('en-IN', { month: 'short', year: 'numeric' })
    }
}

function getTodayRange() {
    const today = new Date().toISOString().split('T')[0]
    return { start: today, end: today, label: 'Today' }
}

const MONTHS_IN_FY = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

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

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return await handleAuthCommand(chatId, text)
    if (/^\d{6}$/.test(text)) return await handleVerifyCommand(chatId, text)

    const { data: user } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, selected_company_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle()

    if (!user) return await showWelcomeAuth(chatId, firstName)

    const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)

    if (!companies?.length) return await showNoCompanies(chatId, user.full_name || user.email.split('@')[0])

    let selectedCompanyId = user.selected_company_id
    if (!selectedCompanyId) {
        if (companies.length === 1) {
            selectedCompanyId = companies[0].id
            await supabase.from("user_profiles").update({ selected_company_id: selectedCompanyId }).eq("id", user.id)
        } else {
            return await showCompanySelection(chatId, companies, user.full_name || user.email.split('@')[0])
        }
    }

    const userName = user.full_name || user.email.split('@')[0]
    const command = text.startsWith("/") ? text.split(" ")[0].toLowerCase() : text.toLowerCase()

    switch (command) {
        case "/start":
            await showMainDashboard(chatId, userName, selectedCompanyId)
            break
        case "📡 status":
        case "/status":
            await handleStatusCommand(chatId, user.id)
            break
        case "📊 summary":
        case "/summary":
            await showSummaryWithFilters(chatId, selectedCompanyId)
            break
        case "📖 ledgers":
        case "/ledgers":
            await handleLedgersCommand(chatId, selectedCompanyId)
            break
        case "📑 vouchers":
        case "/vouchers":
            await showVouchersWithFilters(chatId, selectedCompanyId)
            break
        case "📒 daybook":
        case "/daybook":
            await showDaybookMenu(chatId, selectedCompanyId)
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
📱 <b>STEP 1: Verify Account</b>
━━━━━━━━━━━━━━━━━━━━

Type your <b>registered email</b> to continue.

<i>Example: yourmail@example.com</i>`
    await sendMessage(chatId, msg)
}

async function showNoCompanies(chatId: string, userName: string) {
    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>📂 No Companies</b>       ┃
┗━━━━━━━━━━━━━━━━━━━━┛

Hi <b>${userName}</b>,

No companies synced yet.

━━━━━━━━━━━━━━━━━━━━
<b>How to sync:</b>
1️⃣ Open TallyLink Desktop App
2️⃣ Start Tally software
3️⃣ Click "Sync Now"
━━━━━━━━━━━━━━━━━━━━`
    await sendMessage(chatId, msg)
}

async function showCompanySelection(chatId: string, companies: any[], userName: string) {
    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>🏢 Select Company</b>     ┃
┗━━━━━━━━━━━━━━━━━━━━┛

Hi <b>${userName}</b>!

You have <b>${companies.length}</b> companies.

━━━━━━━━━━━━━━━━━━━━
<b>Choose your active company:</b>`

    const kb = { inline_keyboard: companies.map(c => [{ text: `🏢 ${c.name}`, callback_data: `sel:${c.id}` }]) }
    await sendMessage(chatId, msg, kb)
}

async function showMainDashboard(chatId: string, userName: string, companyId: string) {
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : hour < 21 ? "Good Evening" : "Good Night"
    const fy = getCurrentFY()

    const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()

    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>🎯 TallyLink Pro</b>      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

${greeting}, <b>${userName}</b>! 👋

🏢 <b>${company?.name || "Your Company"}</b>
📅 <b>${fy.label}</b> (Apr-Mar)

━━━━━━━━━━━━━━━━━━━━
✨ <b>Quick Actions:</b>

• "Cash balance?"
• "Sales summary"
• "April ki sales"

━━━━━━━━━━━━━━━━━━━━
💡 <i>AI Powered • Real-time</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

// ═══════════════════════════════════════════════════════════
//                    SUMMARY WITH FILTERS
// ═══════════════════════════════════════════════════════════

async function showSummaryWithFilters(chatId: string, companyId: string) {
    const fy = getCurrentFY()

    const msg = `━━━ <b>📊 Summary</b> ━━━

📅 <b>${fy.label}</b>

<b>Select period:</b>`

    const kb = {
        inline_keyboard: [
            [
                { text: "📅 Full Year", callback_data: `sum:fy:${companyId}` },
                { text: "📆 This Month", callback_data: `sum:m0:${companyId}` }
            ],
            [
                { text: "◀️ Last Month", callback_data: `sum:m1:${companyId}` },
                { text: "📊 Monthly View", callback_data: `sum:months:${companyId}` }
            ]
        ]
    }

    await sendMessage(chatId, msg, kb)
}

async function showVouchersWithFilters(chatId: string, companyId: string) {
    const fy = getCurrentFY()

    const msg = `━━━ <b>📑 Vouchers</b> ━━━

📅 <b>${fy.label}</b>

<b>Select period:</b>`

    const kb = {
        inline_keyboard: [
            [
                { text: "📅 Full Year", callback_data: `vch:fy:${companyId}` },
                { text: "📆 This Month", callback_data: `vch:m0:${companyId}` }
            ],
            [
                { text: "◀️ Last Month", callback_data: `vch:m1:${companyId}` },
                { text: "📊 Monthly View", callback_data: `vch:months:${companyId}` }
            ]
        ]
    }

    await sendMessage(chatId, msg, kb)
}

// ═══════════════════════════════════════════════════════════
//                    DAYBOOK FEATURE
// ═══════════════════════════════════════════════════════════

async function showDaybookMenu(chatId: string, companyId: string) {
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    const msg = `━━━ <b>📒 Daybook</b> ━━━

📅 <b>${today}</b>

<b>Select date:</b>`

    const kb = {
        inline_keyboard: [
            [
                { text: "📅 Today", callback_data: `day:0:${companyId}` },
                { text: "◀️ Yesterday", callback_data: `day:1:${companyId}` }
            ],
            [
                { text: "📆 2 Days Ago", callback_data: `day:2:${companyId}` },
                { text: "📆 3 Days Ago", callback_data: `day:3:${companyId}` }
            ]
        ]
    }

    await sendMessage(chatId, msg, kb)
}

async function showDaybookEntries(chatId: string, companyId: string, daysAgo: number) {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() - daysAgo)
    const dateStr = targetDate.toISOString().split('T')[0]
    const dateLabel = targetDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })

    const { data: vouchers } = await supabase
        .from("vouchers")
        .select("id, voucher_number, voucher_type, party_name, total_amount, narration")
        .eq("company_id", companyId)
        .eq("voucher_date", dateStr)
        .order("created_at", { ascending: false })
        .limit(15)

    let msg = `━━━ <b>📒 Daybook</b> ━━━

📅 <b>${dateLabel}</b>

━━━━━━━━━━━━━━━━━━━━\n\n`

    if (!vouchers?.length) {
        msg += `<i>No entries for this date</i>\n\n`
        await sendMessage(chatId, msg, getMainMenu())
        return
    }

    // Group by type
    const grouped: any = {}
    vouchers.forEach((v: any) => {
        const type = v.voucher_type || 'Other'
        if (!grouped[type]) grouped[type] = []
        grouped[type].push(v)
    })

    const typeEmojis: any = {
        'Sales': '💰', 'Receipt': '📥', 'Purchase': '🛒', 'Payment': '📤',
        'Contra': '🔄', 'Journal': '📝', 'Debit Note': '📋', 'Credit Note': '📋'
    }

    Object.keys(grouped).forEach(type => {
        const emoji = typeEmojis[type] || '📄'
        msg += `${emoji} <b>${type}</b> (${grouped[type].length})\n`
        grouped[type].slice(0, 5).forEach((v: any) => {
            const amt = Math.abs(Number(v.total_amount || 0))
            msg += `   • ${v.party_name || v.voucher_number || '-'} ₹${amt.toLocaleString('en-IN')}\n`
        })
        msg += '\n'
    })

    msg += `━━━━━━━━━━━━━━━━━━━━
<i>Tap voucher for details</i>`

    // Create buttons for each voucher
    const buttons = vouchers.slice(0, 8).map((v: any) => [{
        text: `${typeEmojis[v.voucher_type] || '📄'} ${v.voucher_number || v.party_name?.slice(0, 15) || 'View'}`,
        callback_data: `vdet:${v.id.slice(0, 30)}`
    }])

    await sendMessage(chatId, msg, { inline_keyboard: buttons })
}

async function showVoucherDetail(chatId: string, voucherId: string) {
    const { data: v } = await supabase
        .from("vouchers")
        .select("*")
        .eq("id", voucherId)
        .maybeSingle()

    if (!v) {
        return sendMessage(chatId, `❌ Voucher not found`, getMainMenu())
    }

    const typeEmojis: any = {
        'Sales': '💰', 'Receipt': '📥', 'Purchase': '🛒', 'Payment': '📤',
        'Contra': '🔄', 'Journal': '📝', 'Debit Note': '📋', 'Credit Note': '📋'
    }

    const emoji = typeEmojis[v.voucher_type] || '📄'
    const date = new Date(v.voucher_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    const msg = `${emoji} <b>${v.voucher_type} Voucher</b>

━━━━━━━━━━━━━━━━━━━━

📋 <b>Voucher No:</b> ${v.voucher_number || '-'}
📅 <b>Date:</b> ${date}
👤 <b>Party:</b> ${v.party_name || '-'}

━━━━━━━━━━━━━━━━━━━━

💵 <b>Amount:</b> ₹${Math.abs(Number(v.total_amount || v.grand_total || 0)).toLocaleString('en-IN')}

${v.narration ? `📝 <b>Narration:</b>\n<i>${v.narration}</i>` : ''}

━━━━━━━━━━━━━━━━━━━━
<i>Master ID: ${v.master_id || '-'}</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

async function showMonthlyBreakdown(chatId: string, companyId: string, type: string) {
    const fy = getCurrentFY()
    const now = new Date()
    const currentFYMonth = now.getMonth() >= 3 ? now.getMonth() - 3 : now.getMonth() + 9

    const msg = `━━━ <b>📊 ${type === 'sum' ? 'Summary' : 'Vouchers'} by Month</b> ━━━

📅 <b>${fy.label}</b>

<b>Select month:</b>`

    const buttons: any[] = []
    for (let i = 0; i <= currentFYMonth; i++) {
        const monthLabel = MONTHS_IN_FY[i]
        if (i % 3 === 0) buttons.push([])
        buttons[buttons.length - 1].push({
            text: monthLabel,
            callback_data: `${type}:fm${i}:${companyId}`
        })
    }

    await sendMessage(chatId, msg, { inline_keyboard: buttons })
}

// ═══════════════════════════════════════════════════════════
//                    DATA HANDLERS (FIXED COLUMN NAMES)
// ═══════════════════════════════════════════════════════════

async function handleSummaryData(chatId: string, companyId: string, dateStart: string, dateEnd: string, periodLabel: string) {
    const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()

    // Using correct column: total_amount, voucher_date
    const { data: sales } = await supabase
        .from("vouchers")
        .select("total_amount")
        .eq("company_id", companyId)
        .eq("voucher_type", "Sales")
        .gte("voucher_date", dateStart)
        .lte("voucher_date", dateEnd)

    const { data: purchases } = await supabase
        .from("vouchers")
        .select("total_amount")
        .eq("company_id", companyId)
        .eq("voucher_type", "Purchase")
        .gte("voucher_date", dateStart)
        .lte("voucher_date", dateEnd)

    const { data: receipts } = await supabase
        .from("vouchers")
        .select("total_amount")
        .eq("company_id", companyId)
        .eq("voucher_type", "Receipt")
        .gte("voucher_date", dateStart)
        .lte("voucher_date", dateEnd)

    const { data: payments } = await supabase
        .from("vouchers")
        .select("total_amount")
        .eq("company_id", companyId)
        .eq("voucher_type", "Payment")
        .gte("voucher_date", dateStart)
        .lte("voucher_date", dateEnd)

    const totalSales = sales?.reduce((a: number, b: any) => a + Math.abs(Number(b.total_amount || 0)), 0) || 0
    const totalPurchases = purchases?.reduce((a: number, b: any) => a + Math.abs(Number(b.total_amount || 0)), 0) || 0
    const totalReceipts = receipts?.reduce((a: number, b: any) => a + Math.abs(Number(b.total_amount || 0)), 0) || 0
    const totalPayments = payments?.reduce((a: number, b: any) => a + Math.abs(Number(b.total_amount || 0)), 0) || 0
    const profit = totalSales - totalPurchases

    const msg = `━━━ <b>📊 Business Summary</b> ━━━

🏢 <b>${company?.name}</b>
📅 <b>${periodLabel}</b>

━━━━━━━━━━━━━━━━━━━━

💰 <b>Sales</b>
   ₹${totalSales.toLocaleString("en-IN")}

🛒 <b>Purchases</b>
   ₹${totalPurchases.toLocaleString("en-IN")}

📥 <b>Receipts</b>
   ₹${totalReceipts.toLocaleString("en-IN")}

📤 <b>Payments</b>
   ₹${totalPayments.toLocaleString("en-IN")}

━━━━━━━━━━━━━━━━━━━━

${profit >= 0 ? "📈" : "📉"} <b>Net ${profit >= 0 ? "Profit" : "Loss"}</b>
   ₹${Math.abs(profit).toLocaleString("en-IN")}

━━━━━━━━━━━━━━━━━━━━
<i>Updated: ${new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}</i>`

    await sendMessage(chatId, msg, getMainMenu())
}

async function handleVouchersData(chatId: string, companyId: string, dateStart: string, dateEnd: string, periodLabel: string) {
    // Using correct columns: voucher_date, party_name, total_amount
    const { data: vouchers } = await supabase
        .from("vouchers")
        .select("voucher_date, party_name, total_amount, voucher_type, voucher_number")
        .eq("company_id", companyId)
        .gte("voucher_date", dateStart)
        .lte("voucher_date", dateEnd)
        .order("voucher_date", { ascending: false })
        .limit(10)

    let msg = `━━━ <b>📑 Vouchers</b> ━━━

📅 <b>${periodLabel}</b>

━━━━━━━━━━━━━━━━━━━━\n\n`

    if (!vouchers?.length) {
        msg += `<i>No vouchers in this period</i>\n\n`
    } else {
        const typeEmojis: any = { 'Sales': '💰', 'Receipt': '📥', 'Purchase': '🛒', 'Payment': '📤' }
        vouchers.forEach((v: any) => {
            const date = new Date(v.voucher_date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short' })
            const emoji = typeEmojis[v.voucher_type] || "📄"
            msg += `${emoji} ${date} | <b>${v.party_name || v.voucher_number || '-'}</b>\n`
            msg += `   ₹${Math.abs(Number(v.total_amount || 0)).toLocaleString("en-IN")} <i>(${v.voucher_type})</i>\n\n`
        })
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Latest 10 entries</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

async function handleStatusCommand(chatId: string, userId: string) {
    const { data: comps } = await supabase
        .from("companies")
        .select("name, is_active, last_sync_at")
        .or(`owner_id.eq.${userId},user_id.eq.${userId}`)

    const fy = getCurrentFY()
    let msg = `━━━ <b>📡 System Status</b> ━━━\n\n📅 <b>${fy.label}</b>\n\n`

    comps?.forEach((c: any) => {
        const status = c.is_active ? "🟢 Online" : "🔴 Offline"
        const sync = c.last_sync_at
            ? new Date(c.last_sync_at).toLocaleString("en-IN", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : "Never"

        msg += `🏢 <b>${c.name}</b>\n`
        msg += `   ${status}\n`
        msg += `   Last Sync: <code>${sync}</code>\n\n`
    })

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Real-time monitoring</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

async function handleLedgersCommand(chatId: string, companyId: string) {
    const { data: ledgers } = await supabase
        .from("ledgers")
        .select("name, current_balance")
        .eq("company_id", companyId)
        .order("current_balance", { ascending: false })
        .limit(10)

    const fy = getCurrentFY()
    let msg = `━━━ <b>📖 Top Ledgers</b> ━━━\n\n📅 <b>${fy.label}</b>\n\n`

    if (!ledgers?.length) {
        msg += `<i>No ledgers found</i>\n\n`
    } else {
        ledgers.forEach((l: any, i: number) => {
            const bal = Number(l.current_balance || 0)
            msg += `${i + 1}. <b>${l.name}</b>\n`
            msg += `   ₹${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "Dr" : "Cr"}\n\n`
        })
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n<i>Sorted by balance</i>`
    await sendMessage(chatId, msg, getMainMenu())
}

// ═══════════════════════════════════════════════════════════
//                    CALLBACK HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCallbackQuery(cb: any) {
    const chatId = cb.message.chat.id.toString()
    const data = cb.data
    const parts = data.split(":")

    // Company Selection
    if (data.startsWith("sel:")) {
        const companyId = parts[1]
        const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle()
        await supabase.from("user_profiles").update({ selected_company_id: companyId }).eq("telegram_chat_id", chatId)

        const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>✅ Company Selected</b>   ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🏢 <b>${company?.name}</b>

━━━━━━━━━━━━━━━━━━━━
<i>Use the menu to explore</i>`
        await sendMessage(chatId, msg, getMainMenu())
    }

    // Summary Filters
    else if (data.startsWith("sum:")) {
        const filter = parts[1]
        const companyId = parts[2]
        const fy = getCurrentFY()

        if (filter === "fy") {
            await handleSummaryData(chatId, companyId, fy.start, fy.end, fy.label)
        } else if (filter === "m0") {
            const m = getMonthRange(0)
            await handleSummaryData(chatId, companyId, m.start, m.end, m.label)
        } else if (filter === "m1") {
            const m = getMonthRange(1)
            await handleSummaryData(chatId, companyId, m.start, m.end, m.label)
        } else if (filter === "months") {
            await showMonthlyBreakdown(chatId, companyId, "sum")
        } else if (filter.startsWith("fm")) {
            const monthIndex = parseInt(filter.slice(2))
            const fyStart = new Date(fy.start)
            const targetMonth = new Date(fyStart.getFullYear(), fyStart.getMonth() + monthIndex, 1)
            const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)
            const label = targetMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
            await handleSummaryData(chatId, companyId, targetMonth.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0], label)
        }
    }

    // Voucher Filters
    else if (data.startsWith("vch:")) {
        const filter = parts[1]
        const companyId = parts[2]
        const fy = getCurrentFY()

        if (filter === "fy") {
            await handleVouchersData(chatId, companyId, fy.start, fy.end, fy.label)
        } else if (filter === "m0") {
            const m = getMonthRange(0)
            await handleVouchersData(chatId, companyId, m.start, m.end, m.label)
        } else if (filter === "m1") {
            const m = getMonthRange(1)
            await handleVouchersData(chatId, companyId, m.start, m.end, m.label)
        } else if (filter === "months") {
            await showMonthlyBreakdown(chatId, companyId, "vch")
        } else if (filter.startsWith("fm")) {
            const monthIndex = parseInt(filter.slice(2))
            const fyStart = new Date(fy.start)
            const targetMonth = new Date(fyStart.getFullYear(), fyStart.getMonth() + monthIndex, 1)
            const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)
            const label = targetMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
            await handleVouchersData(chatId, companyId, targetMonth.toISOString().split('T')[0], monthEnd.toISOString().split('T')[0], label)
        }
    }

    // Daybook
    else if (data.startsWith("day:")) {
        const daysAgo = parseInt(parts[1])
        const companyId = parts[2]
        await showDaybookEntries(chatId, companyId, daysAgo)
    }

    // Voucher Detail
    else if (data.startsWith("vdet:")) {
        const voucherId = parts[1]
        await showVoucherDetail(chatId, voucherId)
    }

    // Ledger Balance
    else if (data.startsWith("bal:")) {
        const { data: user } = await supabase.from("user_profiles").select("selected_company_id").eq("telegram_chat_id", chatId).maybeSingle()
        if (user?.selected_company_id) {
            await handleLedgerBalance(chatId, parts[1], user.selected_company_id)
        }
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: cb.id })
    })
}

// ═══════════════════════════════════════════════════════════
//                    AI & LEDGER
// ═══════════════════════════════════════════════════════════

const GENERATIVE_MODEL_ID = "gemini-1.5-flash"; // Or use pro

async function handleSmartAIQuery(chatId: string, text: string, userId: string, companyId: string) {
    try {
        await sendTypingAction(chatId);

        // 1. Detect Intent
        // Simple regex fallback for speed, or call AI for complex
        let intent = "GENERAL";
        const lowerText = text.toLowerCase();

        if (lowerText.includes("sales") || lowerText.includes("invoice")) intent = "SALES";
        if (lowerText.includes("purchase") || lowerText.includes("expense")) intent = "PURCHASE";
        if (lowerText.includes("receipt")) intent = "RECEIPT";
        if (lowerText.includes("payment")) intent = "PAYMENT";
        if (lowerText.includes("balance") || lowerText.includes("ledger") || lowerText.includes("party")) intent = "LEDGER_BALANCE";
        if (lowerText.includes("cash")) intent = "CASH_BALANCE";
        if (lowerText.includes("outstanding") || lowerText.includes("due")) intent = "OUTSTANDING";

        let contextData: any = {};
        let systemPrompt = "";

        // 2. Fetch Relevant Data based on Intent
        if (intent === "SALES" || intent === "PURCHASE" || intent === "RECEIPT" || intent === "PAYMENT") {
            const { data: vouchers } = await supabase
                .from("vouchers")
                .select("voucher_date, voucher_number, voucher_type, party_name, total_amount, narration")
                .eq("company_id", companyId)
                .ilike("voucher_type", `%${intent}%`) // 'Sales', 'Purchase' etc match
                .order("voucher_date", { ascending: false })
                .limit(5);

            contextData = { vouchers: vouchers || [] };
            systemPrompt = `You are a financial assistant. Answer correctly using the PROVIDED voucher data.
             - If user asks for "recent sales", list the top 3-5 sales vouchers.
             - Format nicely with emojis.
             - Total amount summarization is helpful.
             - Date format: DD-MMM-YYYY.`;

        } else if (intent === "LEDGER_BALANCE" || intent === "CASH_BALANCE") {
            let searchTerm = "";
            if (intent === "CASH_BALANCE") searchTerm = "Cash";
            else {
                // Extract possible ledger name (naive approach: removed keywords)
                searchTerm = text.replace(/(balance|ledger|party|of|what|is|the|ka|kya|hai)/gi, "").trim();
            }

            const { data: ledgers } = await supabase
                .from("ledgers")
                .select("name, current_balance, parent_group")
                .eq("company_id", companyId)
                .ilike("name", `%${searchTerm}%`)
                .limit(5);

            contextData = { ledgers: ledgers || [], searchTerm };
            systemPrompt = `You are a financial assistant. Answer using the PROVIDED ledger data.
             - If multiple matches, list them all.
             - Balance is usually Negative for Credit (Cr) and Positive for Debit (Dr) in DB, but Tally convention:
               - Positive = Debit (Dr) i.e. Receivable/Asset
               - Negative = Credit (Cr) i.e. Payable/Liability
             - Explicitly state Dr/Cr based on sign.
             - If no data found, say "No matching ledger found".`;
        } else {
            // General chat - no specific DB fetch
            systemPrompt = `You are TallyLink AI, a helpful accountant assistant. 
             - Answer general finance questions or guide user to use menus.
             - Keep it short and professional (Hinglish allowed).
             - If they ask for data you don't have, say "I can only read Sales, Purchases, Ledgers, and Daybook currently."`;
        }

        // 3. Call Gemini with Context
        const aiResponse = await callGeminiWithContext(text, contextData, systemPrompt);

        await sendMessage(chatId, `🤖 <b>AI Insights:</b>\n\n${aiResponse}`, getMainMenu());

    } catch (e) {
        console.error("AI Error:", e);
        await sendMessage(chatId, `🤖 Sorry, I couldn't process that. Try asking "Sales summary" or "Cash balance".`, getMainMenu());
    }
}

async function callGeminiWithContext(userQuery: string, data: any, systemInstruction: string) {
    const prompt = `${systemInstruction}

    DATA CONTEXT:
    ${JSON.stringify(data, null, 2)}

    USER QUERY:
    ${userQuery}

    ANSWER (in clean text, no markdown code blocks):`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const result = await response.json();
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I can't think right now.";
}

async function sendTypingAction(chatId: string) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action: "typing" })
        });
    } catch (e) { } // ignore errors
}

async function handleLedgerBalance(chatId: string, subject: string, companyId: string) {
    const { data: ledgers } = await supabase
        .from("ledgers")
        .select("name, current_balance")
        .eq("company_id", companyId)
        .ilike("name", `%${subject}%`)
        .limit(8)

    if (!ledgers?.length) {
        return sendMessage(chatId, `🔍 <b>Not Found</b>\n\nNo ledger matching "${subject}"`, getMainMenu())
    }

    if (ledgers.length === 1) {
        const l = ledgers[0]
        const bal = Number(l.current_balance || 0)
        const msg = `${bal >= 0 ? "💰" : "📤"} <b>Balance</b>

📋 <b>${l.name}</b>
💵 ₹${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "Dr" : "Cr"}

━━━━━━━━━━━━━━━━━━━━
<i>Real-time</i>`
        return sendMessage(chatId, msg, getMainMenu())
    }

    const kb = { inline_keyboard: ledgers.map((l: any) => [{ text: `💼 ${l.name}`, callback_data: `bal:${l.name.slice(0, 50)}` }]) }
    await sendMessage(chatId, `🔍 <b>${ledgers.length} Matches</b>\n\nSelect:`, kb)
}

// ═══════════════════════════════════════════════════════════
//                    AUTH
// ═══════════════════════════════════════════════════════════

async function handleAuthCommand(chatId: string, email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    await supabase.from("telegram_auth_codes").upsert({
        email: email.toLowerCase(), code, chat_id: chatId,
        expires_at: new Date(Date.now() + 600000).toISOString()
    }, { onConflict: "email" })

    const msg = `━━━ <b>🔐 Verification</b> ━━━

📧 <code>${email}</code>

🔑 <b>OTP:</b> <code>${code}</code>

━━━━━━━━━━━━━━━━━━━━
⏱ <i>Valid 10 min</i>`
    await sendMessage(chatId, msg)
}

async function handleVerifyCommand(chatId: string, code: string) {
    const { data: auth } = await supabase.from("telegram_auth_codes").select("*").eq("code", code).eq("chat_id", chatId).maybeSingle()
    if (!auth) return sendMessage(chatId, `❌ <b>Invalid</b>\n\nType email again.`)

    await supabase.from("user_profiles").update({ telegram_chat_id: chatId }).eq("email", auth.email)
    await supabase.from("telegram_auth_codes").delete().eq("id", auth.id)

    const msg = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  <b>✅ Verified!</b>          ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🎉 <b>Account linked!</b>

Type <b>/start</b> to continue.`
    await sendMessage(chatId, msg)
}

async function sendHelp(chatId: string) {
    const fy = getCurrentFY()
    const msg = `━━━ <b>🛠 Help</b> ━━━

📅 <b>${fy.label}</b>

<b>📱 Buttons:</b>
Use menu for quick access.

<b>💬 Ask:</b>
• "Cash balance?"
• "Daybook dikhao"
• "Ram ka hisab"

<b>📊 Features:</b>
• Summary with month filters
• Daybook with full details
• AI-powered queries

━━━━━━━━━━━━━━━━━━━━
🤖 <i>Gemini AI Powered</i>`
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
            [{ text: "📊 Summary" }, { text: "📒 Daybook" }],
            [{ text: "📖 Ledgers" }, { text: "📑 Vouchers" }],
            [{ text: "📡 Status" }, { text: "🏢 Change Company" }],
            [{ text: "🛠 Help" }]
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

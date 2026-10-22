const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3502;

// Paths
const LEADS_FILE = path.join(__dirname, 'leads.json');
const WHATSAPP_BOT_WEBHOOK = process.env.WHATSAPP_WEBHOOK_URL || 'http://127.0.0.1:3503/webhook/lead';

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// ─── Helper: Read/Write leads ─────────────────────────────────────────────

function readLeads() {
    try {
        if (!fs.existsSync(LEADS_FILE)) {
            fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf-8');
            return [];
        }
        const data = fs.readFileSync(LEADS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('[LEADS] Error reading leads.json:', err.message);
        return [];
    }
}

function writeLeads(leads) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
}

// ─── Serve index.html on root ──────────────────────────────────────────────

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── POST /api/lead — Accept lead submissions ─────────────────────────────

app.post('/api/lead', async (req, res) => {
    const { name, phone, amount, city } = req.body;

    // Basic validation
    if (!name || !phone || !amount || !city) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required: name, phone, amount, city'
        });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid phone number. Must be 10 digits.'
        });
    }

    const lead = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        phone,
        amount,
        city,
        source: 'landing-page',
        createdAt: new Date().toISOString()
    };

    // Save to leads.json
    try {
        const leads = readLeads();
        leads.push(lead);
        writeLeads(leads);
        console.log(`[LEAD] New lead: ${name} | ${phone} | ₹${amount} | ${city}`);
    } catch (err) {
        console.error('[LEAD] Failed to save lead:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to save lead. Please try again.'
        });
    }

    // Send WhatsApp notification (if webhook URL is configured)
    if (WHATSAPP_BOT_WEBHOOK) {
        try {
            const notificationPayload = {
                type: 'lead_notification',
                lead: {
                    name,
                    phone,
                    amount: `₹${Number(amount).toLocaleString()}`,
                    city
                },
                message: `🔔 *New Loan Lead!*\n\n👤 *Name:* ${name}\n📞 *Phone:* ${phone}\n💰 *Amount:* ₹${Number(amount).toLocaleString()}\n🏙️ *City:* ${city}\n🕐 *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
            };

            const webhookRes = await fetch(WHATSAPP_BOT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notificationPayload),
                signal: AbortSignal.timeout(5000)
            });

            if (webhookRes.ok) {
                console.log('[WA] WhatsApp notification sent successfully');
            } else {
                console.warn(`[WA] WhatsApp webhook responded with status ${webhookRes.status}`);
            }
        } catch (err) {
            // Don't break the request if webhook fails — just log it
            console.warn('[WA] Failed to send WhatsApp notification:', err.message);
        }
    } else {
        console.log('[WA] No WHATSAPP_WEBHOOK_URL configured. Notification logged only.');
        console.log('─────── New Lead ───────');
        console.log(`  Name:   ${name}`);
        console.log(`  Phone:  ${phone}`);
        console.log(`  Amount: ₹${Number(amount).toLocaleString()}`);
        console.log(`  City:   ${city}`);
        console.log('────────────────────────');
    }

    // Return success
    return res.status(201).json({
        success: true,
        message: 'Lead submitted successfully! We will contact you shortly.',
        lead: {
            id: lead.id,
            name: lead.name,
            amount: lead.amount,
            createdAt: lead.createdAt
        }
    });
});

// ─── GET /api/leads — List all leads (admin) ──────────────────────────────

app.get('/api/leads', (req, res) => {
    const leads = readLeads();
    return res.json({
        success: true,
        count: leads.length,
        leads: leads.slice(-50).reverse() // Latest 50
    });
});

// ─── GET /api/stats — Lead statistics ────────────────────────────────────

app.get('/api/stats', (req, res) => {
    const leads = readLeads();
    const total = leads.length;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = leads.filter(l => l.createdAt && l.createdAt.startsWith(today)).length;

    // Amount ranges
    const amountRanges = {
        small: leads.filter(l => parseInt(l.amount) <= 25000).length,
        medium: leads.filter(l => parseInt(l.amount) > 25000 && parseInt(l.amount) <= 100000).length,
        large: leads.filter(l => parseInt(l.amount) > 100000).length
    };

    return res.json({
        success: true,
        total,
        today: todayCount,
        amountRanges
    });
});

// ─── Start Server ─────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║     JLS Finance — Lead Capture Server        ║
╠══════════════════════════════════════════════╣
║  URL:     http://localhost:${PORT}              ║
║  API:     http://localhost:${PORT}/api/lead    ║
║  Leads:   http://localhost:${PORT}/api/leads   ║
║  Stats:   http://localhost:${PORT}/api/stats   ║
║  Data:    ${LEADS_FILE.replace(/\\/g, '/')}   ║
║                                              ║
║  WhatsApp: ${WHATSAPP_BOT_WEBHOOK ? '✓ Connected' : '✗ Not configured'}        ║
╚══════════════════════════════════════════════╝
    `);
});

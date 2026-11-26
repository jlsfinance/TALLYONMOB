const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'session.json');
let sessionCfg = fs.existsSync(SESSION_FILE) ? JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) : {};

const client = new Client({
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    session: sessionCfg
});

client.on('qr', (qr) => {
    console.log('=== SCAN THIS QR CODE WITH WHATSAPP ===');
    qrcode.generate(qr, { small: true });
    console.log('========================================');
});

client.on('authenticated', (session) => {
    sessionCfg = session;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
    console.log('WhatsApp authenticated. Session saved.');
});

client.on('ready', () => {
    console.log('WhatsApp client READY');
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
});

client.initialize().catch((err) => {
    console.error('Failed to initialize WhatsApp client:', err.message);
});

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'phone and message required' });
        }
        await client.sendMessage(phone + '@c.us', message);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/status', (req, res) => {
    res.json({ ready: client.ready });
});

app.listen(3001, () => {
    console.log('WhatsApp notifier listening on http://localhost:3001');
});

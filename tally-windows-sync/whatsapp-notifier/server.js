const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Prevent broken stdout/stderr pipes when launched headless from GUI apps (fixes EPIPE: broken pipe, write)
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

// Keep Chromium/Puppeteer temp files in writable per-user LocalAppData (or local .tmp fallback).
const localTmpDir = process.env.WHATSAPP_TMP_DIR
    || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Syncora', 'whatsapp-tmp') : path.join(__dirname, '.tmp'));
const logFilePath = process.env.WHATSAPP_LOG_FILE
    || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Syncora', 'whatsapp-notifier.log') : path.join(__dirname, 'whatsapp-notifier.log'));
try {
    fs.mkdirSync(localTmpDir, { recursive: true });
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    process.env.TEMP = localTmpDir;
    process.env.TMP = localTmpDir;
} catch {
    // Non-fatal
}

function writeLog(level, message) {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    try {
        try {
            if (fs.existsSync(logFilePath) && fs.statSync(logFilePath).size > 1024 * 1024) {
                fs.writeFileSync(logFilePath, '');
            }
        } catch { }
        fs.appendFileSync(logFilePath, line + '\n');
    } catch { }

    try {
        const stream = level === 'ERROR' ? process.stderr : process.stdout;
        if (stream && !stream.destroyed && stream.writable) {
            stream.write(line + '\n');
        }
    } catch { }
}

function cleanupStaleBrowserLocks(baseAuthDir) {
    const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort', 'lockfile'];
    const dirs = [baseAuthDir, path.join(baseAuthDir, 'session'), path.join(baseAuthDir, 'session', 'Default')];
    for (const dir of dirs) {
        if (!dir || !fs.existsSync(dir)) continue;
        for (const name of lockNames) {
            const target = path.join(dir, name);
            try {
                if (fs.existsSync(target)) fs.rmSync(target, { force: true, recursive: true });
            } catch { }
        }
    }
}

function loadEnvFile(filePath) {
    const vars = {};
    if (!fs.existsSync(filePath)) return vars;
    try {
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            const idx = line.indexOf('=');
            if (idx <= 0) continue;
            const k = line.slice(0, idx).trim();
            let v = line.slice(idx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            if (k && !(k in vars)) vars[k] = v;
        }
    } catch {
        // Ignore unreadable .env
    }
    return vars;
}

const localEnv = loadEnvFile(path.join(__dirname, '.env'));
const backendEnv = loadEnvFile(path.resolve(__dirname, '../../tally-sync-backend/.env'));
const SUPABASE_URL = (process.env.SUPABASE_URL || localEnv.SUPABASE_URL || backendEnv.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    localEnv.SUPABASE_SERVICE_ROLE_KEY ||
    backendEnv.SUPABASE_SERVICE_ROLE_KEY ||
    '';
const PORT = Number(process.env.WHATSAPP_NOTIFIER_PORT || 3001);

let isReady = false;
let lastQr = null;
let connectedPhone = null;
let lastError = null;
let isResetting = false;
let client = null;
const sentMessageIds = new Set();

process.on('unhandledRejection', (err) => {
    const msg = err?.message || String(err);
    writeLog('ERROR', `Unhandled rejection in whatsapp-notifier: ${msg}`);
    if (!/EBUSY|EPERM|EPIPE/i.test(msg)) lastError = msg;
});
process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err);
    writeLog('ERROR', `Uncaught exception in whatsapp-notifier: ${msg}`);
    if (/EBUSY|EPERM|EPIPE/i.test(msg)) return;
    lastError = msg;
});

function trackSent(msg) {
    const id = msg?.id?._serialized;
    if (!id) return;
    sentMessageIds.add(id);
    if (sentMessageIds.size > 500) {
        const first = sentMessageIds.values().next().value;
        sentMessageIds.delete(first);
    }
}

function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length < 10) return '';
    return digits;
}

function formatBotHelp() {
    return [
        '*Syncora WhatsApp Bot*',
        '',
        '/start - account aur sync status',
        '/status - last sync aur companies',
        '/link email license-key - WhatsApp link karna',
        '/help - ye message',
        '',
        'Sync start/finish aur voucher PDFs automatically yahan aayenge.',
    ].join('\n');
}

const UNLINKED_MSG = [
    'WhatsApp account link nahi hai.',
    '',
    'Notifications paane ke liye apna email aur license key bhejo:',
    '`/link you@email.com TOM-2026-XXXX-XXXX`',
    '',
    'License key PC app me (License / About screen) milegi.',
].join('\n');

async function supabaseRest(restPath, options = {}) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase server config unavailable in whatsapp-notifier');
    }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, {
        ...options,
        headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(10000),
    });
    const text = await resp.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { ok: resp.ok, status: resp.status, data: json };
}

async function profileForPhone(digits) {
    const clean = normalizePhone(digits);
    if (!clean) return null;
    const short10 = clean.startsWith('91') && clean.length === 12 ? clean.slice(2) : clean;
    const { ok, data } = await supabaseRest(
        `user_profiles?or=(whatsapp_phone.eq.${encodeURIComponent(clean)},whatsapp_phone.eq.${encodeURIComponent(short10)})&select=id,full_name,email,whatsapp_phone&limit=1`
    );
    if (!ok || !Array.isArray(data) || data.length === 0) return null;
    return data[0];
}

async function statusMessageForPhone(digits) {
    const user = await profileForPhone(digits);
    if (!user) return UNLINKED_MSG;

    const { ok: compOk, data: companies } = await supabaseRest(
        `companies?or=(owner_id.eq.${user.id},user_id.eq.${user.id})&select=id,name,last_sync_at&order=name.asc`
    );
    const list = compOk && Array.isArray(companies) ? companies : [];
    const displayName = user.full_name || user.email || 'Syncora User';
    if (!list.length) {
        return [
            `*${displayName}*`,
            '',
            'Koi company sync nahi hui.',
            'PC par Syncora Connector kholo aur sync chalao.',
        ].join('\n');
    }

    const { ok: histOk, data: histRows } = await supabaseRest(
        `sync_history?owner_id=eq.${user.id}&select=status,sync_type,total_records,completed_at&order=completed_at.desc.nullslast&limit=1`
    );
    const h = histOk && Array.isArray(histRows) && histRows.length > 0 ? histRows[0] : null;
    const when = h?.completed_at
        ? new Date(h.completed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : '-';

    const rows = list.slice(0, 10).map((c) => {
        const t = c.last_sync_at
            ? new Date(c.last_sync_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short',
            })
            : 'kabhi nahi';
        return `- *${c.name}*: ${t}`;
    });

    return [
        '*Syncora Status*',
        '',
        displayName,
        `Companies: ${list.length}`,
        '',
        ...rows,
        '',
        `Last sync: ${h ? `${h.sync_type} / ${h.total_records} records / ${h.status}` : '-'}`,
        when,
        '',
        '_Sync start/finish aur voucher PDFs yahan aayenge._',
    ].join('\n');
}

async function linkPhoneCommand(digits, emailRaw, keyRaw) {
    const email = String(emailRaw || '').trim().toLowerCase();
    const key = String(keyRaw || '').trim().toUpperCase();
    const cleanPhone = normalizePhone(digits);
    if (!cleanPhone || !email.includes('@') || key.length < 8) {
        return 'Format: `/link you@email.com TOM-2026-XXXX-XXXX`';
    }

    const { ok: licOk, data: lics } = await supabaseRest(
        `user_licenses?email=eq.${encodeURIComponent(email)}&select=user_id,status,expires_at,license_key&order=created_at.desc&limit=1`
    );
    const row = licOk && Array.isArray(lics) && lics.length > 0 ? lics[0] : null;
    if (!row || String(row.license_key || '').trim().toUpperCase() !== key) {
        return 'Email ya license key match nahi hui.';
    }
    if (row.status !== 'active' || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())) {
        return 'License active nahi hai. Renew karke dobara try karo.';
    }

    const existing = await profileForPhone(cleanPhone);
    if (existing && existing.id !== row.user_id) {
        return 'Ye WhatsApp number pehle se dusre account se linked hai.';
    }

    const { ok: updOk } = await supabaseRest(`user_profiles?id=eq.${row.user_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ whatsapp_phone: cleanPhone }),
    });
    if (!updOk) {
        return 'Link nahi ho paya. Thodi der baad try karo.';
    }

    return '*Linked!* Ab `/status` bhejo.';
}

async function resolveChatJid(phone) {
    const digits = normalizePhone(phone);
    if (!digits) throw new Error('Valid phone number with country code is required');
    try {
        const numberId = await client.getNumberId(digits);
        if (numberId && numberId._serialized) {
            return { jid: numberId._serialized, digits };
        }
    } catch {
        // Fallback to direct @c.us JID below
    }
    return { jid: `${digits}@c.us`, digits };
}

const puppeteerOpts = {
    headless: true,
    pipe: false,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-crash-reporter',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--window-size=1280,800',
    ],
};
const browserCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '',
].filter(Boolean);
const detectedBrowser = browserCandidates.find((p) => fs.existsSync(p));
if (detectedBrowser) puppeteerOpts.executablePath = detectedBrowser;

// Store LocalAuth session in %LOCALAPPDATA%\Syncora\whatsapp-auth so app upgrades never wipe QR login.
const localAuthFallback = path.join(__dirname, '.wwebjs_auth');
const appDataAuthDir = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Syncora', 'whatsapp-auth')
    : localAuthFallback;
const authDataPath =
    process.env.WHATSAPP_AUTH_DIR ||
    (fs.existsSync(appDataAuthDir) || !fs.existsSync(localAuthFallback)
        ? appDataAuthDir
        : localAuthFallback);
try {
    fs.mkdirSync(authDataPath, { recursive: true });
} catch {
    // Non-fatal
}

function createClient() {
    const c = new Client({
        authStrategy: new LocalAuth({
            dataPath: authDataPath,
        }),
        deviceName: 'Syncora PC',
        browserName: 'Chrome',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        puppeteer: puppeteerOpts,
    });
    wireClientEvents(c);
    return c;
}

function wireClientEvents(c) {
    c.on('qr', (qr) => {
        isReady = false;
        lastQr = qr;
        lastError = null;
        writeLog('INFO', `QR generated for WhatsApp linking (http://127.0.0.1:${PORT}/qr)`);
        if (Boolean(process.stdout?.isTTY)) {
            try {
                qrcodeTerminal.generate(qr, { small: true });
            } catch { }
        }
    });

    c.on('authenticated', () => {
        lastQr = null;
        lastError = null;
        writeLog('INFO', 'WhatsApp authenticated. LocalAuth session saved.');
    });

    c.on('auth_failure', (msg) => {
        isReady = false;
        lastError = msg || 'Authentication failed';
        writeLog('ERROR', `WhatsApp auth_failure: ${lastError}`);
    });

    c.on('ready', () => {
        isReady = true;
        lastQr = null;
        lastError = null;
        connectedPhone = c.info?.wid?.user || null;
        writeLog('INFO', `WhatsApp client READY (phone: ${connectedPhone || 'unknown'})`);
    });

    c.on('disconnected', (reason) => {
        isReady = false;
        connectedPhone = null;
        lastError = reason ? `Disconnected: ${reason}` : 'Disconnected';
        writeLog('WARN', `WhatsApp client disconnected: ${reason}`);
    });

    c.on('message_create', async (msg) => {
        try {
            if (!isReady || !msg || !msg.body) return;
            const msgId = msg.id?._serialized;
            if (msgId && sentMessageIds.has(msgId)) return;

            const selfWid = c.info?.wid?._serialized;
            const peer = msg.fromMe ? msg.to : msg.from;
            if (!peer || peer.endsWith('@g.us') || peer === 'status@broadcast') return;
            if (msg.fromMe && peer !== selfWid) return;

            const text = String(msg.body || '').trim();
            if (!text) return;

            const firstToken = text.split(/\s+/)[0].toLowerCase().replace(/^\//, '');
            if (!['start', 'status', 'help', 'link'].includes(firstToken)) return;

            const senderDigits = peer.split('@')[0];
            let replyText = null;

            if (firstToken === 'start') {
                if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
                    replyText = `Namaste! Syncora WhatsApp bot active hai.\n\n${formatBotHelp()}`;
                } else {
                    const user = await profileForPhone(senderDigits);
                    if (!user) {
                        replyText = `Namaste! Main Syncora WhatsApp bot hoon.\n\n${UNLINKED_MSG}`;
                    } else {
                        const statusReply = await statusMessageForPhone(senderDigits);
                        replyText = `*${user.full_name || user.email}*\n\nWhatsApp linked hai. Sync notifications aur voucher PDFs yahan aayenge.\n\n${statusReply}`;
                    }
                }
            } else if (firstToken === 'status') {
                replyText = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
                    ? await statusMessageForPhone(senderDigits)
                    : 'Status check ke liye Supabase env configure nahi hai.';
            } else if (firstToken === 'help') {
                replyText = formatBotHelp();
            } else if (firstToken === 'link') {
                const parts = text.split(/\s+/);
                replyText = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
                    ? await linkPhoneCommand(senderDigits, parts[1], parts[2])
                    : 'Linking ke liye Supabase env configure nahi hai.';
            }

            if (replyText) {
                const sent = await c.sendMessage(peer, replyText);
                trackSent(sent);
            }
        } catch (err) {
            writeLog('ERROR', `WhatsApp bot handler error: ${err?.message || err}`);
        }
    });
}

async function initWithRetry(attempt = 1) {
    try {
        lastError = null;
        cleanupStaleBrowserLocks(authDataPath);
        if (!client) client = createClient();
        await client.initialize();
    } catch (err) {
        const msg = err?.message || String(err);
        writeLog('ERROR', `Failed to initialize WhatsApp client (attempt ${attempt}/4): ${msg}`);
        if (/EPIPE|Target closed|Failed to launch|browser has disconnected/i.test(msg)) {
            if (client) {
                try { await client.destroy(); } catch { }
                client = null;
            }
            cleanupStaleBrowserLocks(authDataPath);
            lastError = attempt < 4 ? null : msg;
        } else {
            lastError = msg;
        }
        if (attempt < 4) {
            setTimeout(() => void initWithRetry(attempt + 1), 2500);
        }
    }
}

async function resetSession() {
    if (isResetting) return;
    isResetting = true;
    try {
        isReady = false;
        lastQr = null;
        connectedPhone = null;
        lastError = null;
        if (client) {
            try { await client.destroy(); } catch { }
            client = null;
        }
        await new Promise((r) => setTimeout(r, 1200));
        try {
            fs.rmSync(authDataPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
        } catch {
            // Non-fatal if Edge still releasing a lock
        }
        try {
            fs.mkdirSync(authDataPath, { recursive: true });
        } catch { }
        client = createClient();
        void initWithRetry();
    } finally {
        isResetting = false;
    }
}

client = createClient();
void initWithRetry();

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/status', (_req, res) => {
    res.json({
        ready: isReady,
        hasQr: Boolean(lastQr),
        connectedPhone,
        error: lastError,
    });
});

app.get('/qr', async (_req, res) => {
    try {
        let bodyHtml = '';
        if (isReady) {
            bodyHtml = `
                <div class="badge ok">Connected</div>
                <h1>WhatsApp Linked &amp; Ready</h1>
                <p>Connected number: <strong>+${connectedPhone || 'Linked'}</strong></p>
                <p class="muted">Ab Syncora Connector se sync start/complete/failed reports aur voucher PDFs isi WhatsApp par aayenge. Commands try karo: <code>/status</code>, <code>/help</code>.</p>
                <button class="btn" onclick="resetSession()">Disconnect / Switch Number</button>
            `;
        } else if (lastQr) {
            const dataUrl = await QRCode.toDataURL(lastQr, { width: 300, margin: 2 });
            bodyHtml = `
                <div class="badge wait">Scan QR Code</div>
                <h1>Syncora WhatsApp QR Login</h1>
                <p>Apne phone me <strong>WhatsApp &rarr; Linked Devices &rarr; Link a Device</strong> khol kar ye QR scan karo:</p>
                <img src="${dataUrl}" alt="WhatsApp QR Code" class="qr" />
                <p class="muted">Agar phone me <strong>"Can't link new devices"</strong> aaye: Linked Devices me purane unused devices (max 4 limit) log out karo, phir <strong>Reset Session / Fresh QR</strong> dabao.</p>
                <button class="btn" onclick="resetSession()">Reset Session / Fresh QR</button>
            `;
        } else {
            bodyHtml = `
                <div class="badge wait">${isResetting ? 'Resetting...' : 'Starting...'}</div>
                <h1>WhatsApp Web Load Ho Raha Hai</h1>
                <p>QR code generate hone ka wait karo...</p>
                ${lastError ? `<p class="err">Error: ${String(lastError).replace(/</g, '&lt;')}</p>` : ''}
                <p class="muted">Page har 4 second me auto-refresh hota hai.</p>
                <button class="btn" onclick="resetSession()">Reset Session / Fresh QR</button>
            `;
        }

        const refreshSeconds = isReady ? 20 : lastQr ? 12 : 4;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="refresh" content="${refreshSeconds}" />
  <title>Syncora WhatsApp QR</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; display: grid; place-items: center; min-height: 100vh; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 28px 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,.45); }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
    .ok { background: rgba(16,185,129,.15); color: #34d399; border: 1px solid rgba(16,185,129,.35); }
    .wait { background: rgba(245,158,11,.15); color: #fbbf24; border: 1px solid rgba(245,158,11,.35); }
    .qr { border-radius: 12px; background: #fff; padding: 8px; margin: 14px auto; display: block; }
    .muted { color: #94a3b8; font-size: 13px; line-height: 1.45; }
    .err { color: #f87171; font-size: 13px; }
    .btn { margin-top: 12px; padding: 9px 16px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; font-weight: 600; font-size: 13px; cursor: pointer; }
    .btn:hover { background: #334155; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">${bodyHtml}</div>
  <script>
    async function resetSession() {
      const btn = document.querySelector('.btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Resetting session...'; }
      try { await fetch('/reset-session', { method: 'POST' }); } catch {}
      setTimeout(() => location.reload(), 1800);
    }
  </script>
</body>
</html>`);
    } catch (err) {
        res.status(500).send(err?.message || 'QR render failed');
    }
});

app.post('/reset-session', (_req, res) => {
    void resetSession();
    res.json({ ok: true });
});

app.post('/send', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                error: 'WhatsApp client not ready. Open http://127.0.0.1:' + PORT + '/qr and scan the QR code.',
            });
        }
        const { phone, message } = req.body || {};
        if (!phone || !message) {
            return res.status(400).json({ error: 'phone and message required' });
        }
        const { jid, digits } = await resolveChatJid(phone);
        const sent = await client.sendMessage(jid, String(message));
        trackSent(sent);
        return res.json({ ok: true, to: digits });
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to send WhatsApp message' });
    }
});

app.post('/send-document', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                error: 'WhatsApp client not ready. Open http://127.0.0.1:' + PORT + '/qr and scan the QR code.',
            });
        }
        const { phone, filename, caption, pdfBase64, mimeType } = req.body || {};
        if (!phone || !pdfBase64) {
            return res.status(400).json({ error: 'phone and pdfBase64 required' });
        }
        const { jid, digits } = await resolveChatJid(phone);
        const media = new MessageMedia(
            mimeType || 'application/pdf',
            String(pdfBase64),
            filename || 'voucher.pdf'
        );
        const sent = await client.sendMessage(jid, media, { caption: caption ? String(caption) : '' });
        trackSent(sent);
        return res.json({ ok: true, to: digits, filename: filename || 'voucher.pdf' });
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to send WhatsApp document' });
    }
});

app.listen(PORT, '127.0.0.1', () => {
    writeLog('INFO', `WhatsApp notifier listening on http://127.0.0.1:${PORT} (QR page: http://127.0.0.1:${PORT}/qr)`);
});

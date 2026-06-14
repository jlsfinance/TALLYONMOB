const express = require('express');
const crypto = require('crypto');
const { Client, Databases, Users, Query, ID } = require('node-appwrite');

const router = express.Router();

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(client);
const users = new Users(client);
const DB_ID = 'tally_sync_db';

// --- TOTP AND 2FA UTILITY FUNCTIONS ---
function base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    str = str.replace(/=+$/, '').toUpperCase();
    let len = str.length;
    let val = 0;
    let count = 0;
    const bytes = [];
    for (let i = 0; i < len; i++) {
        const idx = alphabet.indexOf(str[i]);
        if (idx === -1) throw new Error('Invalid base32 character');
        val = (val << 5) | idx;
        count += 5;
        if (count >= 8) {
            bytes.push((val >> (count - 8)) & 255);
            count -= 8;
        }
    }
    return Buffer.from(bytes);
}

function base32Encode(buffer) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let val = 0;
    let count = 0;
    let str = '';
    for (let i = 0; i < buffer.length; i++) {
        val = (val << 8) | buffer[i];
        count += 8;
        while (count >= 5) {
            str += alphabet[(val >> (count - 5)) & 31];
            count -= 5;
        }
    }
    if (count > 0) {
        str += alphabet[(val << (5 - count)) & 31];
    }
    return str;
}

function generateSecret(length = 20) {
    const bytes = crypto.randomBytes(length);
    return base32Encode(bytes);
}

function verifyTOTP(secret, code, window = 1) {
    try {
        const key = base32Decode(secret);
        const epoch = Math.floor(Date.now() / 1000);
        const counter = Math.floor(epoch / 30);
        
        for (let i = -window; i <= window; i++) {
            const c = counter + i;
            const buf = Buffer.alloc(8);
            buf.writeUInt32BE(0, 0);
            buf.writeUInt32BE(c, 4);
            
            const hmac = crypto.createHmac('sha1', key);
            hmac.update(buf);
            const hmacResult = hmac.digest();
            
            const offset = hmacResult[hmacResult.length - 1] & 0xf;
            const binary = ((hmacResult[offset] & 0x7f) << 24) |
                           ((hmacResult[offset + 1] & 0xff) << 16) |
                           ((hmacResult[offset + 2] & 0xff) << 8) |
                           (hmacResult[offset + 3] & 0xff);
            
            const otpVal = binary % 1000000;
            const otpStr = String(otpVal).padStart(6, '0');
            if (otpStr === String(code).trim()) {
                return true;
            }
        }
    } catch (err) {
        console.error('verifyTOTP error:', err);
    }
    return false;
}

async function getAppwriteUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('Missing token');
    }
    const token = authHeader.split('Bearer ')[1];
    const response = await fetch('https://nyc.cloud.appwrite.io/v1/account', {
        headers: {
            'X-Appwrite-Project': '69a06098003b91c827a9',
            'X-Appwrite-Session': token
        }
    });
    if (!response.ok) {
        throw new Error('Unauthorized');
    }
    return await response.json();
}

async function getUser2FASettings(userId) {
    try {
        await ensureCollectionAndAttributes('user_profiles');
        const doc = await databases.getDocument(DB_ID, 'user_profiles', userId);
        const data = doc.json_data ? JSON.parse(doc.json_data) : doc;
        return {
            two_factor_enabled: !!data.two_factor_enabled,
            two_factor_secret: data.two_factor_secret || null
        };
    } catch (e) {
        return { two_factor_enabled: false, two_factor_secret: null };
    }
}

async function saveUser2FASettings(userId, email, enabled, secret) {
    await ensureCollectionAndAttributes('user_profiles');
    const data = {
        id: userId,
        email: email,
        two_factor_enabled: enabled,
        two_factor_secret: secret,
        updated_at: new Date().toISOString()
    };
    const jsonBlob = JSON.stringify(data);
    const dataHash = crypto.createHash('sha1').update(jsonBlob).digest('hex');
    const appwritePayload = {
        json_data: jsonBlob,
        data_hash: dataHash
    };
    try {
        await databases.createDocument(DB_ID, 'user_profiles', userId, appwritePayload);
    } catch (e) {
        if (e.code === 409) {
            await databases.updateDocument(DB_ID, 'user_profiles', userId, appwritePayload);
        } else {
            throw e;
        }
    }
}

async function logActivity(req, action, details = {}) {
    try {
        let actorId = 'system';
        let actorEmail = 'system@tallylink.com';

        if (req.headers.authorization) {
            try {
                const user = await getAppwriteUser(req);
                actorId = user.$id;
                actorEmail = user.email;
            } catch (err) {
                // ignore
            }
        } else if (req.headers['x-api-key']) {
            actorId = 'tally_sync_agent';
            actorEmail = 'sync@tallylink.com';
        }

        const pathParts = req.path.split('/').filter(p => p !== '');
        const tableName = pathParts[0] || 'unknown';

        let companyId = req.query.company_id || req.body.company_id || '';
        if (!companyId && Array.isArray(req.body)) {
            companyId = req.body[0]?.company_id || '';
        } else if (!companyId && req.body && typeof req.body === 'object') {
            companyId = req.body.company_id || '';
        }

        const logDoc = {
            id: ID.unique(),
            user_id: actorId,
            user_email: actorEmail,
            company_id: String(companyId || ''),
            action: action || `${req.method} ${tableName}`,
            details: JSON.stringify({
                method: req.method,
                path: req.path,
                ip: req.ip || req.headers['x-forwarded-for'] || '',
                userAgent: req.headers['user-agent'] || '',
                ...details
            }),
            created_at: new Date().toISOString()
        };

        // Don't recursively log audit logs
        if (tableName !== 'audit_logs') {
            await ensureCollectionAndAttributes('audit_logs');
            const jsonBlob = JSON.stringify(logDoc);
            const dataHash = crypto.createHash('sha1').update(jsonBlob).digest('hex');
            const appwritePayload = {
                json_data: jsonBlob,
                data_hash: dataHash,
                company_id: logDoc.company_id,
                name: logDoc.action
            };
            await databases.createDocument(DB_ID, 'audit_logs', logDoc.id, appwritePayload);
            console.log(`[Audit Log] ${logDoc.action} by ${actorEmail}`);
        }
    } catch (err) {
        console.error('Failed to write audit log:', err.message);
    }
}
// --- END OF TOTP AND 2FA UTILITY FUNCTIONS ---

// Safely create coll/attrs dynamically
async function ensureCollectionAndAttributes(collectionId, sampleData) {
    try {
        await databases.getCollection(DB_ID, collectionId);
    } catch (e) {
        if (e.code === 404) {
            await databases.createCollection(DB_ID, collectionId, collectionId);
        }
    }

    // Create required attributes silently
    const attrsToCreate = [
        { key: 'json_data', type: 'string', size: 1000000 },
        { key: 'company_id', type: 'string', size: 250 },
        { key: 'name', type: 'string', size: 250 },
        { key: 'status', type: 'string', size: 250 },
        { key: 'voucher_type', type: 'string', size: 250 },
        { key: 'vch_date', type: 'string', size: 250 },
        { key: 'invoice_number', type: 'string', size: 250 },
        { key: 'sync_api_key', type: 'string', size: 250 },
        { key: 'amount', type: 'float', size: 0 },
        { key: 'data_hash', type: 'string', size: 128 },
        { key: 'voucher_id', type: 'string', size: 250 },
        { key: 'is_deleted', type: 'boolean' },
        { key: 'is_debit', type: 'boolean' },
        { key: 'stock_item_name', type: 'string', size: 500 },
        { key: 'quantity', type: 'float', size: 0 },
        { key: 'rate', type: 'float', size: 0 },
        { key: 'unit', type: 'string', size: 250 },
        { key: 'hsn_code', type: 'string', size: 250 },
        { key: 'is_inward', type: 'boolean' },
        { key: 'discount_percent', type: 'float', size: 0 },
        { key: 'tax_rate', type: 'float', size: 0 },
        { key: 'owner_id', type: 'string', size: 250 },
        { key: 'voucher_number', type: 'string', size: 500 },
        { key: 'party_ledger_name', type: 'string', size: 500 },
        { key: 'narration', type: 'string', size: 1000 },
        { key: 'alter_id', type: 'string', size: 250 }
    ];

    for (const attr of attrsToCreate) {
        try {
            if (attr.type === 'string') {
                await databases.createStringAttribute(DB_ID, collectionId, attr.key, attr.size, false);
            } else if (attr.type === 'float') {
                await databases.createFloatAttribute(DB_ID, collectionId, attr.key, false);
            } else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(DB_ID, collectionId, attr.key, false);
            }
        } catch (e) {
            // usually 409 already exists, or creation in progress
        }
    }
}

router.use('/', async (req, res) => {
    try {
        const pathParts = req.path.split('/').filter(p => p !== '');
        let tableName = pathParts[0];

        if (tableName === 'rest' && pathParts[1] === 'v1') {
            tableName = pathParts[2];
        }

        console.log(`MockRoute Debug: method=${req.method}, path=${req.path}, parsedTableName=${tableName}`);
        require('fs').appendFileSync('debug.log', `MockRoute Debug: method=${req.method}, path=${req.path}, parsedTableName=${tableName}\n`);

        // MOCK SUPABASE AUTH ROUTE
        if (tableName === 'auth') {
            // Check 2FA custom routes first
            if (req.path.includes('2fa/setup')) {
                try {
                    const user = await getAppwriteUser(req);
                    const secret = generateSecret();
                    const qrCodeUrl = `otpauth://totp/TallyLink:${encodeURIComponent(user.email)}?secret=${secret}&issuer=TallyLink`;
                    return res.json({ secret, qrCodeUrl });
                } catch (e) {
                    return res.status(401).json({ error: 'unauthorized', message: e.message || 'Unauthorized' });
                }
            }

            if (req.path.includes('2fa/enable')) {
                const { secret, code } = req.body;
                try {
                    const user = await getAppwriteUser(req);
                    const isValid = verifyTOTP(secret, code);
                    if (!isValid) {
                        return res.status(400).json({ error: 'invalid_code', message: 'Invalid 2FA code. Verification failed.' });
                    }
                    await saveUser2FASettings(user.$id, user.email, true, secret);
                    await logActivity(req, '2FA Enabled', { user_id: user.$id });
                    return res.json({ success: true, message: 'Two-factor authentication enabled.' });
                } catch (e) {
                    return res.status(400).json({ error: 'bad_request', message: e.message || 'Verification failed' });
                }
            }

            if (req.path.includes('2fa/disable')) {
                const { code } = req.body;
                try {
                    const user = await getAppwriteUser(req);
                    const settings = await getUser2FASettings(user.$id);
                    if (!settings.two_factor_enabled || !settings.two_factor_secret) {
                        return res.status(400).json({ error: 'not_enabled', message: '2FA is not enabled.' });
                    }
                    const isValid = verifyTOTP(settings.two_factor_secret, code);
                    if (!isValid) {
                        return res.status(400).json({ error: 'invalid_code', message: 'Invalid 2FA code. Verification failed.' });
                    }
                    await saveUser2FASettings(user.$id, user.email, false, null);
                    await logActivity(req, '2FA Disabled', { user_id: user.$id });
                    return res.json({ success: true, message: 'Two-factor authentication disabled.' });
                } catch (e) {
                    return res.status(400).json({ error: 'bad_request', message: e.message || 'Failed to disable 2FA' });
                }
            }

            if (req.path.includes('2fa/status')) {
                try {
                    const user = await getAppwriteUser(req);
                    const settings = await getUser2FASettings(user.$id);
                    return res.json({ enabled: settings.two_factor_enabled });
                } catch (e) {
                    return res.status(401).json({ error: 'unauthorized', message: e.message || 'Unauthorized' });
                }
            }

            if (req.path.includes('2fa/verify-login')) {
                const { temp_token, user_id, email, code } = req.body;
                try {
                    const settings = await getUser2FASettings(user_id);
                    if (!settings.two_factor_enabled || !settings.two_factor_secret) {
                        return res.status(400).json({ error: 'not_enabled', message: '2FA is not enabled.' });
                    }
                    const isValid = verifyTOTP(settings.two_factor_secret, code);
                    if (!isValid) {
                        // Delete the temporary session on Appwrite so it cannot be used
                        await fetch(`https://nyc.cloud.appwrite.io/v1/account/sessions/${temp_token}`, {
                            method: 'DELETE',
                            headers: {
                                'X-Appwrite-Project': '69a06098003b91c827a9',
                                'X-Appwrite-Session': temp_token
                            }
                        });
                        await logActivity(req, '2FA Login Failed', { user_id, reason: 'Invalid code' });
                        return res.status(400).json({ error: 'invalid_code', message: 'Invalid 2FA verification code. Session terminated.' });
                    }
                    // Code is valid! Return the final session
                    await logActivity(req, '2FA Login Success', { user_id });
                    return res.json({
                        access_token: temp_token,
                        refresh_token: temp_token,
                        expires_in: 31536000,
                        user: {
                            id: user_id,
                            email: email
                        }
                    });
                } catch (e) {
                    return res.status(400).json({ error: 'bad_request', message: e.message || 'Verification failed' });
                }
            }

            const isSignup = req.path.includes('signup');

            if (req.method === 'POST' && isSignup) {
                const { email, password, data } = req.body;
                try {
                    const user = await users.create(ID.unique(), email, undefined, password, data?.full_name);
                    await logActivity(req, 'User Signup', { userEmail: email });
                    return res.json({
                        access_token: 'fake-token-do-login-next',
                        user: { id: user.$id, email: user.email }
                    });
                } catch (e) {
                    return res.status(400).json({ error: 'invalid_grant', error_description: e.message || 'Signup failed' });
                }
            } else if (req.method === 'POST') {
                const { email, password } = req.body;
                try {
                    const response = await fetch('https://nyc.cloud.appwrite.io/v1/account/sessions/email', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Appwrite-Project': '69a06098003b91c827a9'
                        },
                        body: JSON.stringify({ email, password })
                    });
                    const data = await response.json();

                    if (response.ok) {
                        // Check if 2FA is enabled
                        const settings = await getUser2FASettings(data.userId);
                        if (settings.two_factor_enabled) {
                            await logActivity(req, '2FA Code Requested', { userId: data.userId });
                            return res.json({
                                two_factor_required: true,
                                temp_token: data.$id,
                                user_id: data.userId,
                                email: email
                            });
                        }

                        await logActivity(req, 'User Login Success', { userId: data.userId });
                        return res.json({
                            access_token: data.$id,
                            refresh_token: data.$id,
                            expires_in: 31536000,
                            user: {
                                id: data.userId,
                                email: email
                            }
                        });
                    } else {
                        return res.status(400).json({ error: 'invalid_grant', error_description: data.message || 'Login failed' });
                    }
                } catch (e) {
                    return res.status(400).json({ error: 'invalid_grant', error_description: e.message });
                }
            }
            return res.status(400).json({ error: 'invalid_grant', error_description: 'Unsupported Auth Method' });
        }

        if (req.method === 'GET') {
            const queries = [Query.limit(100)];
            if (req.query.name && req.query.name.startsWith('eq.')) {
                queries.push(Query.equal('name', req.query.name.replace('eq.', '')));
            }
            if (req.query.company_id && req.query.company_id.startsWith('eq.')) {
                queries.push(Query.equal('company_id', req.query.company_id.replace('eq.', '')));
            }

            if (req.query.select === 'count') {
                try {
                    const countResult = await databases.listDocuments(DB_ID, tableName, queries);
                    return res.json([{ count: countResult.total }]);
                } catch (e) {
                    return res.json([{ count: 0 }]);
                }
            }

            try {
                const result = await databases.listDocuments(DB_ID, tableName, queries);
                const docs = result.documents.map(d => {
                    if (d.json_data) return { id: d.$id, ...JSON.parse(d.json_data) };
                    const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, json_data, ...rest } = d;
                    return { id: $id, ...rest };
                });
                return res.json(docs);
            } catch (e) {
                return res.json([]);
            }
        }

        if (req.method === 'POST' || req.method === 'PATCH') {
            let data = req.body;
            if (!Array.isArray(data)) data = [data];

            await ensureCollectionAndAttributes(tableName);
            logActivity(req, `Modify ${tableName}`, { recordCount: data.length });

            const WRITE_CONCURRENCY = 20;
            for (let i = 0; i < data.length; i += WRITE_CONCURRENCY) {
                const chunk = data.slice(i, i + WRITE_CONCURRENCY);
                await Promise.all(chunk.map(async (item) => {
                    const docId = item.id || ID.unique();

                    // Normalize date fields - PC app sends vchDate, date, voucher_date etc.
                    const resolvedDate = item.vch_date || item.vchDate || item.date || item.voucher_date || item.invoice_date || '';
                    if (resolvedDate && !item.vch_date) item.vch_date = resolvedDate;

                    const jsonBlob = JSON.stringify(item);
                    const dataHash = crypto.createHash('sha1').update(jsonBlob).digest('hex');

                    const appwritePayload = {
                        json_data: jsonBlob,
                        data_hash: dataHash
                    };

                    // Lift indexed attributes for Query.equal routing
                    if (item.company_id !== undefined) appwritePayload.company_id = String(item.company_id).substr(0, 250);
                    if (item.name !== undefined) appwritePayload.name = String(item.name).substr(0, 250);
                    if (item.status !== undefined) appwritePayload.status = String(item.status).substr(0, 250);
                    if (item.voucher_type !== undefined) appwritePayload.voucher_type = String(item.voucher_type).substr(0, 250);
                    // Always set vch_date - required by Appwrite collection
                    appwritePayload.vch_date = String(resolvedDate).substr(0, 250);
                    if (item.invoice_number !== undefined) appwritePayload.invoice_number = String(item.invoice_number).substr(0, 250);
                    if (item.sync_api_key !== undefined) appwritePayload.sync_api_key = String(item.sync_api_key).substr(0, 250);

                    // Lift voucher_id for voucher_stock_entries / voucher_ledger_entries
                    if (item.voucher_id !== undefined) appwritePayload.voucher_id = String(item.voucher_id).substr(0, 250);

                    // Lift is_deleted for vouchers
                    if (item.is_deleted !== undefined) appwritePayload.is_deleted = !!item.is_deleted;

                    // Lift is_debit for voucher_ledger_entries
                    if (item.is_debit !== undefined) appwritePayload.is_debit = !!item.is_debit;

                    // Lift stock entry fields for voucher_stock_entries
                    if (tableName === 'voucher_stock_entries') {
                        if (item.stock_item_name !== undefined) appwritePayload.stock_item_name = String(item.stock_item_name || '').substr(0, 500);
                        if (item.quantity !== undefined) { const q = parseFloat(item.quantity); appwritePayload.quantity = isNaN(q) ? 0 : q; }
                        if (item.rate !== undefined) { const r = parseFloat(item.rate); appwritePayload.rate = isNaN(r) ? 0 : r; }
                        if (item.unit !== undefined) appwritePayload.unit = String(item.unit || '').substr(0, 250);
                        if (item.hsn_code !== undefined) appwritePayload.hsn_code = String(item.hsn_code || '').substr(0, 250);
                        if (item.is_inward !== undefined) appwritePayload.is_inward = !!item.is_inward;
                        if (item.discount_percent !== undefined) { const d = parseFloat(item.discount_percent); appwritePayload.discount_percent = isNaN(d) ? 0 : d; }
                        if (item.tax_rate !== undefined) { const t = parseFloat(item.tax_rate); appwritePayload.tax_rate = isNaN(t) ? 0 : t; }
                        if (item.owner_id !== undefined) appwritePayload.owner_id = String(item.owner_id).substr(0, 250);
                    }

                    // Lift voucher-specific fields
                    if (tableName === 'vouchers') {
                        if (item.voucher_number !== undefined) appwritePayload.voucher_number = String(item.voucher_number || '').substr(0, 500);
                        if (item.party_ledger_name !== undefined) appwritePayload.party_ledger_name = String(item.party_ledger_name || '').substr(0, 500);
                        if (item.narration !== undefined) appwritePayload.narration = String(item.narration || '').substr(0, 1000);
                        if (item.alter_id !== undefined) appwritePayload.alter_id = String(item.alter_id || '').substr(0, 250);
                    }

                    if (item.amount !== undefined) {
                        const parsedAmount = parseFloat(item.amount);
                        appwritePayload.amount = isNaN(parsedAmount) ? 0 : parsedAmount;
                    }

                    try {
                        await databases.createDocument(DB_ID, tableName, docId, appwritePayload);
                    } catch (e) {
                        if (e.code === 409) {
                            try {
                                // No-change short-circuit: skip update when payload hash is unchanged.
                                const existing = await databases.getDocument(DB_ID, tableName, docId);
                                if (existing?.data_hash && existing.data_hash === dataHash) return;
                                await databases.updateDocument(DB_ID, tableName, docId, appwritePayload);
                            } catch (updateErr) {
                                console.error('Appwrite Update Error:', updateErr.message);
                                throw updateErr;
                            }
                        } else {
                            console.error(`Appwrite Create Error [${tableName}]:`, e.message);
                            throw e;
                        }
                    }
                }));
            }
            return res.json(data);
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Appwrite Proxy Error', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;


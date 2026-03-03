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
            const isSignup = req.path.includes('signup');

            if (req.method === 'POST' && isSignup) {
                const { email, password, data } = req.body;
                try {
                    const user = await users.create(ID.unique(), email, undefined, password, data?.full_name);
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


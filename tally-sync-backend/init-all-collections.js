require('dotenv').config();
const { Client, Databases } = require('node-appwrite');

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || '69a06098003b91c827a9';
const apiKey = process.env.APPWRITE_API_KEY || process.env.APPWRITE_KEY || process.env.APPWRITE_SERVER_KEY;
const dbId = process.env.APPWRITE_DATABASE_ID || 'tally_sync_db';

if (!apiKey) {
    console.error('Missing APPWRITE_API_KEY');
    process.exit(1);
}

const appwriteClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(appwriteClient);

const collections = [
    'companies', 'ledgers', 'vouchers', 'stock_items',
    'voucher_ledger_entries', 'voucher_stock_entries',
    'sales', 'purchases', 'ledger_groups', 'cost_centres',
    'godowns', 'stock_groups', 'stock_categories',
    'currencies', 'voucher_types', 'units', 'budgets', 'price_lists',
    'pending_transactions', 'sync_history', 'payment_links', 'recurring_invoices'
];

async function ensureCollection(collectionId) {
    try {
        await databases.getCollection(dbId, collectionId);
        console.log('Exists:', collectionId);
    } catch (e) {
        if (e.code === 404) {
            await databases.createCollection(dbId, collectionId, collectionId);
            console.log('Created:', collectionId);
        } else {
            throw e;
        }
    }

    const attrs = [
        ['json_data', 'string', 1000000],
        ['company_id', 'string', 250],
        ['name', 'string', 250],
        ['status', 'string', 250],
        ['voucher_type', 'string', 250],
        ['vch_date', 'string', 250],
        ['invoice_number', 'string', 250],
        ['sync_api_key', 'string', 250]
    ];

    for (const [key, type, size] of attrs) {
        try {
            if (type === 'string') {
                await databases.createStringAttribute(dbId, collectionId, key, size, false, null);
            }
        } catch (e) {
            if (e.code !== 409) {
                console.log('Attr skip', collectionId, key, e.message);
            }
        }
    }

    try {
        await databases.createFloatAttribute(dbId, collectionId, 'amount', false, null, null, null);
    } catch (e) {
        if (e.code !== 409) console.log('Attr skip', collectionId, 'amount', e.message);
    }
}

(async () => {
    for (const collectionId of collections) {
        await ensureCollection(collectionId);
    }
    console.log('Appwrite collections initialized');
})().catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});

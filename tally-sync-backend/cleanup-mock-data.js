const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || '69a06098003b91c827a9';
const apiKey = process.env.APPWRITE_API_KEY || process.env.APPWRITE_KEY || process.env.APPWRITE_SERVER_KEY;
const dbId = process.env.APPWRITE_DATABASE_ID || 'tally_sync_db';

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

// Known mock IDs from seed-mock-data.js
const MOCK_PREFIXES = ['stk_', 'led_', 'vch_s_', 'vch_p_', 'vch_r_', 'vch_pay_', 'txn_vch_', 'vse_', 'vle_'];
const MOCK_STOCK_NAMES = ['Laptop Pro 14', 'Thermal Printer', 'Mechanical Keyboard', 'Wireless Mouse', 'SSD 1TB', 'UPS 1KVA', 'Printer Toner', 'HDMI Cable'];
const MOCK_LEDGER_NAMES = ['Sales Account', 'Purchase Account', 'Sundry Debtors', 'Sundry Creditors', 'Cash', 'HDFC Bank', 'Freight Inward', 'Salary Expense', 'Discount Received', 'Interest Income', 'Stock-in-Hand'];
const MOCK_PARTIES = ['Apex Traders', 'Neon Retail', 'Orbit Tech', 'Metro Systems', 'Walkin Customer', 'Bright Mart', 'Zen Agency', 'Prime Enterprises', 'Bluebox Sales', 'Mango Retail', 'Vista LLP', 'Delta Supplies', 'Core Imports', 'Omni Components', 'SupplyHub', 'Local Vendor', 'Metro Wholesale'];

const COLLECTIONS_TO_CLEAN = [
    'stock_items',
    'ledgers',
    'vouchers',
    'sales',
    'purchases',
    'voucher_stock_entries',
    'voucher_ledger_entries'
];

async function listAll(collectionId) {
    let offset = 0;
    const all = [];
    while (true) {
        try {
            const res = await databases.listDocuments(dbId, collectionId, [Query.limit(100), Query.offset(offset)]);
            all.push(...res.documents);
            if (res.documents.length < 100) break;
            offset += 100;
        } catch (e) {
            if (e.code === 404) {
                console.log(`  Collection ${collectionId} not found, skipping.`);
                return [];
            }
            throw e;
        }
    }
    return all;
}

function isMockDocument(doc, collectionId) {
    const id = doc.$id || '';

    // Check if ID matches mock prefixes (with or without company prefix)
    for (const prefix of MOCK_PREFIXES) {
        if (id.includes(prefix)) return true;
    }

    // Parse json_data for deeper check
    let jd = {};
    try { jd = JSON.parse(doc.json_data || '{}'); } catch (e) { }

    const name = jd.name || doc.name || '';
    const party = jd.party_name || jd.party_ledger_name || '';
    const narration = jd.narration || '';

    // Check narration for "auto-seeded" marker
    if (narration.includes('auto-seeded')) return true;

    // Check mock stock names
    if (collectionId === 'stock_items' && MOCK_STOCK_NAMES.includes(name)) return true;

    // Check mock ledger names  
    if (collectionId === 'ledgers' && MOCK_LEDGER_NAMES.includes(name)) return true;

    // Check mock party names in vouchers/sales/purchases
    if (['vouchers', 'sales', 'purchases'].includes(collectionId) && MOCK_PARTIES.includes(party)) return true;

    return false;
}

async function run() {
    console.log('🧹 Starting mock data cleanup...\n');

    let totalDeleted = 0;

    for (const collectionId of COLLECTIONS_TO_CLEAN) {
        console.log(`📋 Checking ${collectionId}...`);
        const docs = await listAll(collectionId);
        console.log(`  Found ${docs.length} total documents`);

        const mockDocs = docs.filter(d => isMockDocument(d, collectionId));
        console.log(`  Identified ${mockDocs.length} mock documents to delete`);

        for (const doc of mockDocs) {
            let name = '';
            try { name = JSON.parse(doc.json_data || '{}').name || ''; } catch (e) { }
            try {
                await databases.deleteDocument(dbId, collectionId, doc.$id);
                console.log(`  ❌ Deleted: ${doc.$id} ${name ? '(' + name + ')' : ''}`);
                totalDeleted++;
            } catch (e) {
                console.error(`  ⚠️ Failed to delete ${doc.$id}: ${e.message}`);
            }
        }

        const remaining = docs.length - mockDocs.length;
        console.log(`  ✅ Kept ${remaining} real documents\n`);
    }

    console.log(`\n🏁 Cleanup complete! Deleted ${totalDeleted} mock documents.`);
    console.log('Real Tally-synced data has been preserved.');
}

run().catch(err => {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
});

/**
 * Migration Script: Fix voucher_stock_entries in Appwrite
 * 
 * Problem: voucher_id and other stock entry fields were only stored inside json_data blob,
 * not as top-level Appwrite attributes. This made server-side filtering impossible.
 * 
 * Solution: Read json_data for each document, extract voucher_id, stock_item_name, quantity, 
 * rate, unit, hsn_code, etc. and set them as top-level attributes.
 * 
 * Usage: node fix-stock-entries.js
 */

const { Client, Databases, Query } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY || 'standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(client);
const DB_ID = 'tally_sync_db';
const COLLECTION = 'voucher_stock_entries';
const PAGE_SIZE = 100;
const CONCURRENCY = 10;

async function ensureAttributes() {
    const attrsNeeded = [
        { key: 'stock_item_name', type: 'string', size: 500 },
        { key: 'quantity', type: 'float' },
        { key: 'rate', type: 'float' },
        { key: 'unit', type: 'string', size: 250 },
        { key: 'hsn_code', type: 'string', size: 250 },
        { key: 'is_inward', type: 'boolean' },
        { key: 'discount_percent', type: 'float' },
        { key: 'tax_rate', type: 'float' },
        { key: 'owner_id', type: 'string', size: 250 },
    ];

    for (const attr of attrsNeeded) {
        try {
            if (attr.type === 'string') {
                await databases.createStringAttribute(DB_ID, COLLECTION, attr.key, attr.size, false);
                console.log(`✅ Created string attribute: ${attr.key}`);
            } else if (attr.type === 'float') {
                await databases.createFloatAttribute(DB_ID, COLLECTION, attr.key, false);
                console.log(`✅ Created float attribute: ${attr.key}`);
            } else if (attr.type === 'boolean') {
                await databases.createBooleanAttribute(DB_ID, COLLECTION, attr.key, false);
                console.log(`✅ Created boolean attribute: ${attr.key}`);
            }
        } catch (e) {
            if (e.code === 409) {
                console.log(`⏭️  Attribute ${attr.key} already exists`);
            } else {
                console.error(`❌ Failed to create ${attr.key}: ${e.message}`);
            }
        }
    }

    // Wait for attributes to be ready
    console.log('\n⏳ Waiting 10s for attributes to be provisioned...\n');
    await new Promise(r => setTimeout(r, 10000));
}

async function migrateDocuments() {
    let cursorAfter = null;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    while (true) {
        const queries = [Query.limit(PAGE_SIZE)];
        if (cursorAfter) queries.push(Query.cursorAfter(cursorAfter));

        let resp;
        try {
            resp = await databases.listDocuments(DB_ID, COLLECTION, queries);
        } catch (e) {
            console.error('❌ Failed to list documents:', e.message);
            break;
        }

        const docs = resp.documents || [];
        if (docs.length === 0) break;

        // Process in batches of CONCURRENCY
        for (let i = 0; i < docs.length; i += CONCURRENCY) {
            const batch = docs.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (doc) => {
                totalProcessed++;
                try {
                    // Parse json_data
                    let parsed = {};
                    if (doc.json_data) {
                        try { parsed = JSON.parse(doc.json_data); } catch (_) { }
                    }

                    // Check if voucher_id is already set as top-level
                    const needsUpdate = !doc.voucher_id || doc.voucher_id === '' || doc.voucher_id === null;
                    const voucherId = doc.voucher_id || parsed.voucher_id;

                    if (!voucherId && !parsed.stock_item_name) {
                        totalSkipped++;
                        return;
                    }

                    const payload = {};

                    // Lift voucher_id
                    if (!doc.voucher_id && parsed.voucher_id) {
                        payload.voucher_id = String(parsed.voucher_id).substr(0, 250);
                    }

                    // Lift stock_item_name
                    if (!doc.stock_item_name && parsed.stock_item_name) {
                        payload.stock_item_name = String(parsed.stock_item_name).substr(0, 500);
                    }

                    // Lift numeric/other fields
                    if (doc.quantity === undefined || doc.quantity === null) {
                        const q = parseFloat(parsed.quantity);
                        if (!isNaN(q)) payload.quantity = q;
                    }
                    if (doc.rate === undefined || doc.rate === null) {
                        const r = parseFloat(parsed.rate);
                        if (!isNaN(r)) payload.rate = r;
                    }
                    if (!doc.unit && parsed.unit) {
                        payload.unit = String(parsed.unit).substr(0, 250);
                    }
                    if (!doc.hsn_code && parsed.hsn_code) {
                        payload.hsn_code = String(parsed.hsn_code).substr(0, 250);
                    }
                    if (doc.is_inward === undefined || doc.is_inward === null) {
                        payload.is_inward = !!parsed.is_inward;
                    }
                    if (doc.discount_percent === undefined || doc.discount_percent === null) {
                        const d = parseFloat(parsed.discount_percent);
                        if (!isNaN(d)) payload.discount_percent = d;
                    }
                    if (doc.tax_rate === undefined || doc.tax_rate === null) {
                        const t = parseFloat(parsed.tax_rate);
                        if (!isNaN(t)) payload.tax_rate = t;
                    }
                    if (!doc.owner_id && parsed.owner_id) {
                        payload.owner_id = String(parsed.owner_id).substr(0, 250);
                    }

                    if (Object.keys(payload).length === 0) {
                        totalSkipped++;
                        return;
                    }

                    await databases.updateDocument(DB_ID, COLLECTION, doc.$id, payload);
                    totalUpdated++;
                } catch (e) {
                    totalErrors++;
                    if (totalErrors <= 5) {
                        console.error(`❌ Error updating ${doc.$id}: ${e.message}`);
                    }
                }
            }));
        }

        console.log(`📊 Progress: ${totalProcessed}/${resp.total} processed, ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`);

        cursorAfter = docs[docs.length - 1].$id;
        if (docs.length < PAGE_SIZE) break;
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   Updated: ${totalUpdated}`);
    console.log(`   Skipped: ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
}

async function main() {
    console.log('🔧 Step 1: Ensure Appwrite attributes exist...\n');
    await ensureAttributes();

    console.log('🚀 Step 2: Migrate existing documents...\n');
    await migrateDocuments();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

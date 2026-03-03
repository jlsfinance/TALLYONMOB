const fs = require('fs');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const c = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(c);

(async () => {
    // Check voucher stock entries
    const r1 = await db.listDocuments('tally_sync_db', 'voucher_stock_entries', [Query.limit(5)]);

    // Check voucher ledger entries
    const r2 = await db.listDocuments('tally_sync_db', 'voucher_ledger_entries', [Query.limit(5)]);

    fs.writeFileSync('entries-debug.json', JSON.stringify({
        stock_entries_count: r1.total,
        ledger_entries_count: r2.total,
        first_stock_entry: r1.documents[0] ? r1.documents[0].json_data : null,
        first_ledger_entry: r2.documents[0] ? r2.documents[0].json_data : null
    }, null, 2), 'utf8');
})();

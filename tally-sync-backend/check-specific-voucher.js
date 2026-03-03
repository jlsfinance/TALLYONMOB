const fs = require('fs');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const c = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(c);

(async () => {
    const sr = await db.listDocuments('tally_sync_db', 'voucher_stock_entries', [Query.limit(100)]);
    const entries = sr.documents.map(d => JSON.parse(d.json_data || '{}')).filter(e => e.voucher_id === '2e823992-b01c-b22e-aa05-2a6c7416e90a');
    fs.writeFileSync('voucher-122-debug.json', JSON.stringify(entries, null, 2), 'utf8');
})();

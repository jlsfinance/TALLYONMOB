const fs = require('fs');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const c = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(c);

(async () => {
    // get vouchers
    const vr = await db.listDocuments('tally_sync_db', 'vouchers', [Query.limit(100)]);
    const vIds = vr.documents.map(d => d.$id);

    // get stock entries
    const sr = await db.listDocuments('tally_sync_db', 'voucher_stock_entries', [Query.limit(100)]);

    let matched = 0;
    let missing = 0;
    let missingVids = new Set();

    sr.documents.forEach(doc => {
        let jd = {};
        try { jd = JSON.parse(doc.json_data || '{}'); } catch (e) { }
        if (vIds.includes(jd.voucher_id)) {
            matched++;
        } else {
            missing++;
            missingVids.add(jd.voucher_id);
        }
    });

    const out = {
        vouchersTotal: vIds.length,
        stockEntriesTotal: sr.documents.length,
        matched,
        missing,
        sampleMissing: Array.from(missingVids).slice(0, 3),
        sampleValid: vIds.slice(0, 3)
    };
    fs.writeFileSync('links-debug.json', JSON.stringify(out, null, 2), 'utf8');
})();

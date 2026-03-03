const fs = require('fs');
const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const c = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(c);

(async () => {
    const r = await db.listDocuments('tally_sync_db', 'stock_items', [Query.limit(10)]);
    const res = [];
    r.documents.forEach(d => {
        let jd = {};
        try { jd = JSON.parse(d.json_data || '{}'); } catch (e) { }
        res.push({
            id: d.$id,
            name: jd.name || d.name,
            stock_group: jd.stock_group,
            company_id: jd.company_id || d.company_id
        });
    });
    fs.writeFileSync('stock-debug.json', JSON.stringify(res, null, 2), 'utf8');
})();

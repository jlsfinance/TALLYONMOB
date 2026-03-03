const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const c = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(c);

(async () => {
    const r = await db.listDocuments('tally_sync_db', 'stock_items', [Query.limit(10)]);
    console.log('Total stock_items:', r.total);
    r.documents.forEach(d => {
        let jd = {};
        try { jd = JSON.parse(d.json_data || '{}'); } catch (e) { }
        console.log('\n--- ID:', d.$id);
        console.log('  name:', jd.name || d.name);
        console.log('  stock_group:', jd.stock_group);
        console.log('  current_stock:', jd.current_stock);
        console.log('  closing_value:', jd.closing_value);
        console.log('  company_id:', jd.company_id || d.company_id);
        console.log('  All keys:', Object.keys(jd).join(', '));
    });
})();

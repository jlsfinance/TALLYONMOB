require('dotenv').config();
const { Client, Databases, Query } = require('node-appwrite');

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || '69a06098003b91c827a9';
const apiKey = process.env.APPWRITE_API_KEY || process.env.APPWRITE_KEY || process.env.APPWRITE_SERVER_KEY;
const dbId = process.env.APPWRITE_DATABASE_ID || 'tally_sync_db';

if (!apiKey) {
    console.error('Missing APPWRITE_API_KEY');
    process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function listAll(collectionId) {
    let offset = 0;
    const out = [];
    while (true) {
        const res = await databases.listDocuments(dbId, collectionId, [Query.limit(100), Query.offset(offset)]);
        out.push(...res.documents);
        if (res.documents.length < 100) break;
        offset += 100;
    }
    return out;
}

async function backfillVouchersFromSalesPurchases() {
    const sales = await listAll('sales');
    const purchases = await listAll('purchases');
    const rows = [...sales, ...purchases];

    let created = 0;
    let updated = 0;

    for (const doc of rows) {
        let jd = {};
        try { jd = JSON.parse(doc.json_data || '{}'); } catch (e) {}

        const id = jd.id || jd.voucher_id || doc.$id;
        const payload = {
            json_data: JSON.stringify({
                ...jd,
                id,
                voucher_id: jd.voucher_id || id,
                company_id: jd.company_id || doc.company_id || null,
                voucher_type: jd.voucher_type || (doc.$collectionId === 'sales' ? 'Sales' : 'Purchase'),
                voucher_date: jd.voucher_date || jd.vch_date || jd.invoice_date || jd.date || null,
                vch_date: jd.vch_date || jd.voucher_date || jd.invoice_date || jd.date || null,
                party_name: jd.party_name || jd.party_ledger_name || null,
                amount: jd.amount ?? jd.total_amount ?? jd.grand_total ?? jd.net_amount ?? jd.gross_amount ?? 0,
                is_deleted: jd.is_deleted ?? false
            }),
            company_id: String(jd.company_id || doc.company_id || '').slice(0, 250),
            voucher_type: String(jd.voucher_type || (doc.$collectionId === 'sales' ? 'Sales' : 'Purchase')).slice(0, 250),
            vch_date: String(jd.vch_date || jd.voucher_date || jd.invoice_date || jd.date || '').slice(0, 250),
            amount: Number(jd.amount ?? jd.total_amount ?? jd.grand_total ?? jd.net_amount ?? jd.gross_amount ?? 0)
        };

        try {
            await databases.createDocument(dbId, 'vouchers', id, payload);
            created++;
        } catch (e) {
            if (e.code === 409) {
                await databases.updateDocument(dbId, 'vouchers', id, payload);
                updated++;
            }
        }
    }

    console.log('Voucher backfill complete:', { created, updated, sourceRows: rows.length });
}

(async () => {
    await backfillVouchersFromSalesPurchases();
})().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});

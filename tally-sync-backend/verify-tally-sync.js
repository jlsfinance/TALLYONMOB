const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || '69a06098003b91c827a9';
const apiKey = process.env.APPWRITE_API_KEY || process.env.APPWRITE_KEY || process.env.APPWRITE_SERVER_KEY;
const dbId = process.env.APPWRITE_DATABASE_ID || 'tally_sync_db';

if (!apiKey) {
    console.error('FAIL: Missing APPWRITE_API_KEY in environment');
    process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return def;
    return args[i + 1] ?? def;
};

const minutes = Number(getArg('minutes', '30'));
const marker = getArg('marker', '').trim();
const explicitCompany = getArg('company', '').trim();
const requireMarker = args.includes('--require-marker');

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

function toDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseJson(doc) {
    try { return JSON.parse(doc.json_data || '{}'); } catch (e) { return {}; }
}

async function listAll(collectionId) {
    let offset = 0;
    const all = [];

    while (true) {
        const res = await databases.listDocuments(dbId, collectionId, [Query.limit(100), Query.offset(offset)]);
        all.push(...(res.documents || []));
        if ((res.documents || []).length < 100) break;
        offset += 100;
    }

    return all;
}

async function main() {
    const now = new Date();
    const threshold = new Date(now.getTime() - minutes * 60 * 1000);

    const companies = await listAll('companies');
    if (!companies.length) {
        console.error('FAIL: companies collection is empty');
        process.exit(1);
    }

    let company = null;
    let companyData = null;

    for (const c of companies) {
        const j = parseJson(c);
        const cid = j.id || c.company_id || c.$id;
        if (!explicitCompany || explicitCompany === cid) {
            company = c;
            companyData = { ...j, id: cid, name: j.name || c.name || 'Unknown Company' };
            break;
        }
    }

    if (!company) {
        console.error(`FAIL: company not found for --company ${explicitCompany}`);
        process.exit(1);
    }

    const companyId = companyData.id;

    const vouchers = await listAll('vouchers');
    const sales = await listAll('sales');
    const purchases = await listAll('purchases');

    const companyVouchers = vouchers
        .map((d) => ({ raw: d, json: parseJson(d) }))
        .filter((x) => (x.raw.company_id === companyId || x.json.company_id === companyId));

    const companySales = sales
        .map((d) => ({ raw: d, json: parseJson(d) }))
        .filter((x) => (x.raw.company_id === companyId || x.json.company_id === companyId));

    const companyPurchases = purchases
        .map((d) => ({ raw: d, json: parseJson(d) }))
        .filter((x) => (x.raw.company_id === companyId || x.json.company_id === companyId));

    const recentVouchers = companyVouchers.filter((x) => {
        const updatedAt = toDate(x.raw.$updatedAt) || toDate(x.raw.$createdAt);
        return updatedAt && updatedAt >= threshold;
    });

    const markerMatches = marker
        ? companyVouchers.filter((x) => {
            const hay = JSON.stringify(x.json).toLowerCase();
            return hay.includes(marker.toLowerCase());
        })
        : [];

    const lastSyncAt = toDate(companyData.last_sync_at || company.last_sync_at);
    const isLastSyncRecent = lastSyncAt ? lastSyncAt >= threshold : false;

    let syncLogsRecent = 0;
    try {
        const syncLogs = await listAll('sync_logs');
        syncLogsRecent = syncLogs
            .map((d) => parseJson(d))
            .filter((j) => j.company_id === companyId)
            .filter((j) => {
                const dt = toDate(j.started_at || j.completed_at || j.updated_at);
                return dt && dt >= threshold;
            }).length;
    } catch (e) {
        // sync_logs collection may not exist; ignore
    }

    const passRecent = recentVouchers.length > 0 || syncLogsRecent > 0 || isLastSyncRecent;
    const passMarker = marker ? markerMatches.length > 0 : true;
    const pass = requireMarker ? (passRecent && passMarker) : passRecent;

    console.log('--- Tally Sync Verification ---');
    console.log('Company:', companyData.name, `(${companyId})`);
    console.log('Window:', `${minutes} minutes`);
    console.log('Now:', now.toISOString());
    console.log('Threshold:', threshold.toISOString());
    console.log('Totals:', {
        vouchers: companyVouchers.length,
        sales: companySales.length,
        purchases: companyPurchases.length,
        recentVouchers: recentVouchers.length,
        recentSyncLogs: syncLogsRecent,
        lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
        isLastSyncRecent
    });

    if (marker) {
        console.log('Marker:', marker);
        console.log('MarkerMatches:', markerMatches.length);
        if (markerMatches.length) {
            const m = markerMatches[0];
            console.log('SampleMarkerVoucher:', {
                voucher_number: m.json.voucher_number || m.json.invoice_number || m.raw.$id,
                voucher_type: m.json.voucher_type,
                voucher_date: m.json.voucher_date || m.json.vch_date,
                party: m.json.party_name || m.json.party_ledger_name
            });
        }
    }

    const latest = companyVouchers
        .slice()
        .sort((a, b) => (new Date(b.raw.$updatedAt).getTime() - new Date(a.raw.$updatedAt).getTime()))
        .slice(0, 5)
        .map((x) => ({
            updatedAt: x.raw.$updatedAt,
            voucher_number: x.json.voucher_number || x.json.invoice_number || x.raw.$id,
            voucher_type: x.json.voucher_type,
            voucher_date: x.json.voucher_date || x.json.vch_date,
            party: x.json.party_name || x.json.party_ledger_name || null
        }));

    console.log('LatestVouchers:', latest);

    if (pass) {
        console.log('RESULT: PASS - Data likely picked from Tally and synced recently.');
        process.exit(0);
    }

    console.error('RESULT: FAIL - Recent Tally pickup evidence not found in selected window.');
    console.error('Tip: create a new voucher in Tally with unique marker and run sync, then re-run with --marker <text>.');
    process.exit(2);
}

main().catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
});

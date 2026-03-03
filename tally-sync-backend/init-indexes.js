const { Client, Databases } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(client);

const dbId = 'tally_sync_db';

const tables = [
    'companies', 'ledgers', 'vouchers', 'stock_items',
    'voucher_ledger_entries', 'voucher_stock_entries',
    'sales', 'purchases', 'ledger_groups', 'cost_centres',
    'godowns', 'stock_groups', 'stock_categories', 'currencies',
    'voucher_types', 'units', 'budgets', 'price_lists'
];

const attributes = [
    { key: 'company_id', type: 'string', size: 255 },
    { key: 'name', type: 'string', size: 255 },
    { key: 'status', type: 'string', size: 255 },
    { key: 'voucher_type', type: 'string', size: 255 },
    { key: 'vch_date', type: 'string', size: 255 },
    { key: 'invoice_number', type: 'string', size: 255 },
    { key: 'amount', type: 'double' },
    { key: 'sync_api_key', type: 'string', size: 255 }
];

async function run() {
    for (const table of tables) {
        for (const attr of attributes) {
            try {
                if (attr.type === 'string') {
                    await databases.createStringAttribute(dbId, table, attr.key, attr.size, false);
                } else if (attr.type === 'double') {
                    await databases.createFloatAttribute(dbId, table, attr.key, false);
                }
                console.log(`Added ${attr.key} to ${table}`);
            } catch (e) {
                if (e.code !== 409) console.error(e.message);
            }
        }
        await new Promise(r => setTimeout(r, 1000));
        console.log(`Done building attributes for ${table}`);

        // Add index on company_id
        try {
            await databases.createIndex(dbId, table, 'idx_company_id', 'key', ['company_id'], ['ASC']);
        } catch (e) { }
    }
}
run();

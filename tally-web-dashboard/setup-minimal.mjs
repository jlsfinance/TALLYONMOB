/**
 * Minimal setup script - creates only essential collections
 * Run: node setup-minimal.mjs
 */
import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('69a320ff003acccf8024')
    .setKey('standard_f51fbb04eec1559fa556e29040058be1139f3f18188b59dd9b74b58cc5ef402e1e9e6ed8be0e37516f18cf19b89ba5a6499d62053c9c7980e2cfc8df787a7f0eb905b2b0bd6d4d03faf6d504542a316a43da0decdc43f639e549a8de75933f2d4388373eb772eb37198721f08f266e7f45e155d3e669eedeb5fe0e276b87dad5');

const db = new Databases(client);
const DB = 'tally_sync_db';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const perms = [
    'read("any")',
    'create("users")',
    'update("users")',
    'delete("users")'
];

async function createCol(id, name) {
    try {
        await db.createCollection(DB, id, name, perms);
        console.log(`✅ ${id}`);
    } catch (e) {
        if (e.code === 409) console.log(`ℹ️  ${id} exists`);
        else { console.error(`❌ ${id}: ${e.message}`); return false; }
    }
    return true;
}

async function addStr(colId, key, size = 250) {
    try {
        await db.createStringAttribute(DB, colId, key, size, false);
        await sleep(500);
    } catch (e) {
        if (e.code !== 409) console.warn(`  ⚠ ${colId}.${key}: ${e.message}`);
    }
}

async function addFloat(colId, key) {
    try {
        await db.createFloatAttribute(DB, colId, key, false);
        await sleep(500);
    } catch (e) {
        if (e.code !== 409) console.warn(`  ⚠ ${colId}.${key}: ${e.message}`);
    }
}

async function addBool(colId, key) {
    try {
        await db.createBooleanAttribute(DB, colId, key, false);
        await sleep(500);
    } catch (e) {
        if (e.code !== 409) console.warn(`  ⚠ ${colId}.${key}: ${e.message}`);
    }
}

async function addIndex(colId, key, attrs) {
    try {
        await db.createIndex(DB, colId, key, 'key', attrs);
        await sleep(500);
    } catch (e) {
        if (e.code !== 409) console.warn(`  ⚠ idx ${colId}.${key}: ${e.message}`);
    }
}

// Core string attrs for all master collections
async function addCoreAttrs(colId) {
    await addStr(colId, 'company_id', 250);
    await addStr(colId, 'name', 500);
    await addStr(colId, 'json_data', 50000);
    await addStr(colId, 'sync_api_key', 250);
    await addStr(colId, 'status', 250);
}

async function main() {
    console.log('🚀 Creating collections...\n');

    // === COMPANIES ===
    if (await createCol('companies', 'Companies')) {
        await addCoreAttrs('companies');
        await addStr('companies', 'formal_name', 500);
        await addStr('companies', 'address', 500);
        await addStr('companies', 'phone', 50);
        await addStr('companies', 'data_hash', 250);
        await addStr('companies', 'owner_id', 250);
        await addBool('companies', 'is_active');
        console.log('  attrs done');
    }

    // === LEDGERS ===
    if (await createCol('ledgers', 'Ledgers')) {
        await addCoreAttrs('ledgers');
        await addStr('ledgers', 'parent', 500);
        await addStr('ledgers', 'parent_group', 500);
        await addStr('ledgers', 'alter_id', 250);
        await addStr('ledgers', 'data_hash', 250);
        await addFloat('ledgers', 'closing_balance');
        await addIndex('ledgers', 'idx_company_id', ['company_id']);
        await addIndex('ledgers', 'idx_ledgers_parent', ['parent']);
        console.log('  attrs + indexes done');
    }

    // === VOUCHERS ===
    if (await createCol('vouchers', 'Vouchers')) {
        await addCoreAttrs('vouchers');
        await addStr('vouchers', 'voucher_type', 250);
        await addStr('vouchers', 'vch_date', 50);
        await addStr('vouchers', 'invoice_number', 500);
        await addStr('vouchers', 'voucher_number', 500);
        await addStr('vouchers', 'party_ledger_name', 500);
        await addStr('vouchers', 'narration', 2000);
        await addStr('vouchers', 'alter_id', 250);
        await addStr('vouchers', 'voucher_id', 250);
        await addStr('vouchers', 'data_hash', 250);
        await addStr('vouchers', 'owner_id', 250);
        await addFloat('vouchers', 'amount');
        await addBool('vouchers', 'is_deleted');
        await sleep(3000);
        await addIndex('vouchers', 'idx_company_id', ['company_id']);
        await addIndex('vouchers', 'idx_vouchers_voucher_type', ['voucher_type']);
        await addIndex('vouchers', 'idx_vouchers_is_deleted', ['is_deleted']);
        console.log('  attrs + indexes done');
    }

    // === STOCK ITEMS ===
    if (await createCol('stock_items', 'stock_items')) {
        await addCoreAttrs('stock_items');
        await addStr('stock_items', 'alter_id', 250);
        await addStr('stock_items', 'data_hash', 250);
        await addStr('stock_items', 'unit', 250);
        await addStr('stock_items', 'hsn_code', 250);
        await addFloat('stock_items', 'rate');
        await addFloat('stock_items', 'quantity');
        await addFloat('stock_items', 'amount');
        await addIndex('stock_items', 'idx_company_id', ['company_id']);
        console.log('  attrs + indexes done');
    }

    // === VOUCHER LEDGER ENTRIES ===
    if (await createCol('voucher_ledger_entries', 'voucher_ledger_entries')) {
        await addStr('voucher_ledger_entries', 'company_id', 250);
        await addStr('voucher_ledger_entries', 'voucher_id', 250);
        await addStr('voucher_ledger_entries', 'name', 500);
        await addStr('voucher_ledger_entries', 'json_data', 50000);
        await addStr('voucher_ledger_entries', 'voucher_type', 250);
        await addStr('voucher_ledger_entries', 'vch_date', 50);
        await addStr('voucher_ledger_entries', 'party_ledger_name', 500);
        await addStr('voucher_ledger_entries', 'voucher_number', 500);
        await addStr('voucher_ledger_entries', 'data_hash', 250);
        await addStr('voucher_ledger_entries', 'owner_id', 250);
        await addFloat('voucher_ledger_entries', 'amount');
        await addBool('voucher_ledger_entries', 'is_debit');
        await addBool('voucher_ledger_entries', 'is_deleted');
        await sleep(3000);
        await addIndex('voucher_ledger_entries', 'idx_company_id', ['company_id']);
        await addIndex('voucher_ledger_entries', 'idx_vle_voucher_id', ['voucher_id']);
        await addIndex('voucher_ledger_entries', 'idx_vle_is_debit', ['is_debit']);
        console.log('  attrs + indexes done');
    }

    // === VOUCHER STOCK ENTRIES ===
    if (await createCol('voucher_stock_entries', 'voucher_stock_entries')) {
        await addStr('voucher_stock_entries', 'company_id', 250);
        await addStr('voucher_stock_entries', 'voucher_id', 250);
        await addStr('voucher_stock_entries', 'stock_item_name', 500);
        await addStr('voucher_stock_entries', 'json_data', 50000);
        await addStr('voucher_stock_entries', 'unit', 250);
        await addStr('voucher_stock_entries', 'hsn_code', 250);
        await addStr('voucher_stock_entries', 'voucher_type', 250);
        await addStr('voucher_stock_entries', 'vch_date', 50);
        await addStr('voucher_stock_entries', 'party_ledger_name', 500);
        await addStr('voucher_stock_entries', 'voucher_number', 500);
        await addStr('voucher_stock_entries', 'data_hash', 250);
        await addStr('voucher_stock_entries', 'owner_id', 250);
        await addFloat('voucher_stock_entries', 'amount');
        await addFloat('voucher_stock_entries', 'quantity');
        await addFloat('voucher_stock_entries', 'rate');
        await addFloat('voucher_stock_entries', 'discount_percent');
        await addFloat('voucher_stock_entries', 'tax_rate');
        await addBool('voucher_stock_entries', 'is_inward');
        await addBool('voucher_stock_entries', 'is_deleted');
        await sleep(3000);
        await addIndex('voucher_stock_entries', 'idx_company_id', ['company_id']);
        await addIndex('voucher_stock_entries', 'idx_vse_voucher_id', ['voucher_id']);
        console.log('  attrs + indexes done');
    }

    // === SIMPLER COLLECTIONS (fewer attrs) ===
    const simpleCollections = [
        'sales', 'purchases', 'ledger_groups', 'cost_centres',
        'stock_groups', 'stock_categories', 'voucher_types', 'price_lists',
        'sync_history', 'sales_items', 'bill_allocations', 'bank_allocations', 'rest'
    ];

    for (const colId of simpleCollections) {
        if (await createCol(colId, colId)) {
            await addStr(colId, 'company_id', 250);
            await addStr(colId, 'name', 500);
            await addStr(colId, 'json_data', 50000);
            await addStr(colId, 'sync_api_key', 250);
            await addStr(colId, 'status', 250);
            await addStr(colId, 'voucher_type', 250);
            await addStr(colId, 'vch_date', 50);
            await addStr(colId, 'invoice_number', 500);
            await addStr(colId, 'data_hash', 250);
            await addFloat(colId, 'amount');
            await addIndex(colId, 'idx_company_id', ['company_id']);
            console.log(`  ${colId} attrs done`);
        }
    }

    // === PENDING TRANSACTIONS ===
    if (await createCol('pending_transactions', 'pending_transactions')) {
        await addStr('pending_transactions', 'company_id', 250);
        await addStr('pending_transactions', 'status', 250);
        await addStr('pending_transactions', 'transaction_type', 250);
        await addIndex('pending_transactions', 'idx_pending_company_id', ['company_id']);
        await addIndex('pending_transactions', 'idx_pending_status', ['status']);
        console.log('  pending_transactions done');
    }

    console.log('\n🎉 All collections created! Now sync Tally data.');
}

main().catch(e => console.error('Fatal:', e));

/**
 * Run this script ONCE to create all collections + attributes in new Appwrite project.
 * Usage: node setup-collections.mjs
 */
import { Client, Databases, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('69a320ff003acccf8024')
    .setKey('standard_f51fbb04eec1559fa556e29040058be1139f3f18188b59dd9b74b58cc5ef402e1e9e6ed8be0e37516f18cf19b89ba5a6499d62053c9c7980e2cfc8df787a7f0eb905b2b0bd6d4d03faf6d504542a316a43da0decdc43f639e549a8de75933f2d4388373eb772eb37198721f08f266e7f45e155d3e669eedeb5fe0e276b87dad5');

const db = new Databases(client);
const DB_ID = 'tally_sync_db';

// Common attributes shared by many collections
const commonStringAttrs = [
    { key: 'company_id', size: 250, required: false },
    { key: 'name', size: 500, required: false },
    { key: 'status', size: 250, required: false },
    { key: 'sync_api_key', size: 250, required: false },
];

const voucherFields = [
    { key: 'voucher_type', size: 250 },
    { key: 'vch_date', size: 50 },
    { key: 'invoice_number', size: 500 },
    { key: 'voucher_number', size: 500 },
    { key: 'party_ledger_name', size: 500 },
    { key: 'narration', size: 2000 },
    { key: 'alter_id', size: 250 },
    { key: 'voucher_id', size: 250 },
    { key: 'data_hash', size: 250 },
    { key: 'owner_id', size: 250 },
    { key: 'json_data', size: 100000 },
];

const stockEntryFields = [
    { key: 'stock_item_name', size: 500 },
    { key: 'unit', size: 250 },
    { key: 'hsn_code', size: 250 },
];

const numericFields = ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate', 'closing_balance'];
const booleanFields = ['is_deleted', 'is_debit', 'is_inward'];

const COLLECTIONS = [
    {
        id: 'companies',
        name: 'Companies',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'formal_name', size: 500 },
            { key: 'address', size: 1000 },
            { key: 'phone', size: 50 },
            ...voucherFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_active', 'is_deleted', 'is_debit', 'is_inward'],
        datetimeAttrs: ['financial_year_start', 'last_sync_at'],
        indexes: []
    },
    {
        id: 'ledgers',
        name: 'Ledgers',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'parent_group', size: 500 },
            { key: 'parent', size: 500 },
            ...voucherFields,
        ],
        numericAttrs: ['closing_balance', 'amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
            { key: 'idx_ledgers_parent', type: 'key', attributes: ['parent'] },
        ]
    },
    {
        id: 'vouchers',
        name: 'Vouchers',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        datetimeAttrs: ['vch_date_dt'],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
            { key: 'idx_vouchers_voucher_type', type: 'key', attributes: ['voucher_type'] },
            { key: 'idx_vouchers_is_deleted', type: 'key', attributes: ['is_deleted'] },
        ]
    },
    {
        id: 'stock_items',
        name: 'stock_items',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
            ...stockEntryFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'voucher_ledger_entries',
        name: 'voucher_ledger_entries',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
            ...stockEntryFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
            { key: 'idx_vle_voucher_id', type: 'key', attributes: ['voucher_id'] },
            { key: 'idx_vle_is_debit', type: 'key', attributes: ['is_debit'] },
        ]
    },
    {
        id: 'voucher_stock_entries',
        name: 'voucher_stock_entries',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
            ...stockEntryFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
            { key: 'idx_vse_voucher_id', type: 'key', attributes: ['voucher_id'] },
        ]
    },
    {
        id: 'sales',
        name: 'sales',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
            { key: 'data_hash', size: 250 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'purchases',
        name: 'purchases',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'ledger_groups',
        name: 'ledger_groups',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'cost_centres',
        name: 'cost_centres',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'stock_groups',
        name: 'stock_groups',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'stock_categories',
        name: 'stock_categories',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'voucher_types',
        name: 'voucher_types',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'price_lists',
        name: 'price_lists',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 100000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_company_id', type: 'key', attributes: ['company_id'] },
        ]
    },
    {
        id: 'sync_history',
        name: 'sync_history',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
            ...stockEntryFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: []
    },
    {
        id: 'sales_items',
        name: 'sales_items',
        stringAttrs: [
            ...commonStringAttrs,
            ...voucherFields,
            ...stockEntryFields,
        ],
        numericAttrs: ['amount', 'quantity', 'rate', 'discount_percent', 'tax_rate'],
        booleanAttrs: ['is_deleted', 'is_debit', 'is_inward'],
        indexes: []
    },
    {
        id: 'pending_transactions',
        name: 'pending_transactions',
        stringAttrs: [
            { key: 'company_id', size: 250, required: false },
            { key: 'status', size: 250, required: false },
            { key: 'transaction_type', size: 250, required: false },
        ],
        numericAttrs: [],
        booleanAttrs: [],
        indexes: [
            { key: 'idx_pending_company_id', type: 'key', attributes: ['company_id'] },
            { key: 'idx_pending_status', type: 'key', attributes: ['status'] },
        ]
    },
    {
        id: 'bill_allocations',
        name: 'bill_allocations',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 1000000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: []
    },
    {
        id: 'bank_allocations',
        name: 'bank_allocations',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 1000000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: []
    },
    {
        id: 'rest',
        name: 'rest',
        stringAttrs: [
            ...commonStringAttrs,
            { key: 'voucher_type', size: 250 },
            { key: 'vch_date', size: 50 },
            { key: 'invoice_number', size: 500 },
            { key: 'json_data', size: 1000000 },
        ],
        numericAttrs: ['amount'],
        booleanAttrs: [],
        indexes: []
    },
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('🚀 Setting up Appwrite collections...\n');

    // Step 1: Create database
    try {
        await db.create(DB_ID, 'Tally Sync DB');
        console.log('✅ Database created: tally_sync_db');
    } catch (e) {
        if (e.code === 409) {
            console.log('ℹ️  Database already exists');
        } else {
            console.error('❌ Database create failed:', e.message);
            return;
        }
    }

    // Step 2: Create collections with attributes
    for (const col of COLLECTIONS) {
        console.log(`\n📁 Creating collection: ${col.id}`);

        try {
            await db.createCollection(DB_ID, col.id, col.name, [
                'read("any")',
                'create("users")',
                'update("users")',
                'delete("users")'
            ]);
            console.log(`  ✅ Collection created: ${col.id}`);
        } catch (e) {
            if (e.code === 409) {
                console.log(`  ℹ️  Collection already exists: ${col.id}`);
            } else {
                console.error(`  ❌ Failed: ${e.message}`);
                continue;
            }
        }

        // Create string attributes
        const seen = new Set();
        for (const attr of (col.stringAttrs || [])) {
            if (seen.has(attr.key)) continue;
            seen.add(attr.key);
            try {
                await db.createStringAttribute(DB_ID, col.id, attr.key, attr.size, false);
                console.log(`    + string: ${attr.key}`);
            } catch (e) {
                if (e.code === 409) { /* exists */ }
                else console.warn(`    ⚠ ${attr.key}: ${e.message}`);
            }
            await sleep(300);
        }

        // Create numeric (float) attributes
        for (const key of (col.numericAttrs || [])) {
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                await db.createFloatAttribute(DB_ID, col.id, key, false);
                console.log(`    + float: ${key}`);
            } catch (e) {
                if (e.code === 409) { /* exists */ }
                else console.warn(`    ⚠ ${key}: ${e.message}`);
            }
            await sleep(300);
        }

        // Create boolean attributes
        for (const key of (col.booleanAttrs || [])) {
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                await db.createBooleanAttribute(DB_ID, col.id, key, false);
                console.log(`    + bool: ${key}`);
            } catch (e) {
                if (e.code === 409) { /* exists */ }
                else console.warn(`    ⚠ ${key}: ${e.message}`);
            }
            await sleep(300);
        }

        // Create datetime attributes
        for (const key of (col.datetimeAttrs || [])) {
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                await db.createDatetimeAttribute(DB_ID, col.id, key, false);
                console.log(`    + datetime: ${key}`);
            } catch (e) {
                if (e.code === 409) { /* exists */ }
                else console.warn(`    ⚠ ${key}: ${e.message}`);
            }
            await sleep(300);
        }

        // Wait for attributes to be available before creating indexes
        await sleep(2000);

        // Create indexes
        for (const idx of (col.indexes || [])) {
            try {
                await db.createIndex(DB_ID, col.id, idx.key, idx.type, idx.attributes);
                console.log(`    🔑 index: ${idx.key}`);
            } catch (e) {
                if (e.code === 409) { /* exists */ }
                else console.warn(`    ⚠ index ${idx.key}: ${e.message}`);
            }
            await sleep(500);
        }
    }

    console.log('\n\n🎉 Setup complete! All collections created.');
    console.log('Now sync your Tally data using the Windows app.');
}

main().catch(e => console.error('Fatal:', e));

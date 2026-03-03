const { Client, Databases, Query } = require('node-appwrite');
require('dotenv').config();

const endpoint = process.env.APPWRITE_ENDPOINT || 'https://nyc.cloud.appwrite.io/v1';
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || '69a06098003b91c827a9';
const apiKey = process.env.APPWRITE_API_KEY || process.env.APPWRITE_KEY || process.env.APPWRITE_SERVER_KEY;
const dbId = process.env.APPWRITE_DATABASE_ID || 'tally_sync_db';

if (!apiKey) {
    console.error('Missing APPWRITE_API_KEY in .env');
    process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const TARGET_COLLECTIONS = [
    'vouchers',
    'voucher_stock_entries',
    'voucher_ledger_entries',
    'sales',
    'purchases',
    'stock_items',
    'ledgers'
];

function makePayload(data) {
    const payload = { json_data: JSON.stringify(data) };

    if (data.company_id !== undefined) payload.company_id = String(data.company_id).slice(0, 250);
    if (data.name !== undefined) payload.name = String(data.name).slice(0, 250);
    if (data.status !== undefined) payload.status = String(data.status).slice(0, 250);
    if (data.voucher_type !== undefined) payload.voucher_type = String(data.voucher_type).slice(0, 250);
    if (data.vch_date !== undefined) payload.vch_date = String(data.vch_date).slice(0, 250);
    if (data.invoice_number !== undefined) payload.invoice_number = String(data.invoice_number).slice(0, 250);
    if (data.sync_api_key !== undefined) payload.sync_api_key = String(data.sync_api_key).slice(0, 250);

    const amount = data.amount ?? data.total_amount ?? data.grand_total ?? data.net_amount ?? data.gross_amount;
    if (amount !== undefined && amount !== null) {
        const n = Number(amount);
        payload.amount = Number.isNaN(n) ? 0 : n;
    }

    return payload;
}

async function listAll(collectionId) {
    let offset = 0;
    const all = [];

    while (true) {
        const res = await databases.listDocuments(dbId, collectionId, [Query.limit(100), Query.offset(offset)]);
        all.push(...res.documents);
        if (res.documents.length < 100) break;
        offset += 100;
    }

    return all;
}

async function upsert(collectionId, docId, data) {
    const payload = makePayload(data);
    try {
        await databases.createDocument(dbId, collectionId, docId, payload);
    } catch (e) {
        if (e.code === 409) {
            await databases.updateDocument(dbId, collectionId, docId, payload);
        } else {
            throw e;
        }
    }
}

async function clearCompanyData(companyId) {
    for (const collectionId of TARGET_COLLECTIONS) {
        const docs = await listAll(collectionId);
        const toDelete = docs.filter((d) => {
            let jd = {};
            try { jd = JSON.parse(d.json_data || '{}'); } catch (e) { }
            return d.company_id === companyId || jd.company_id === companyId;
        });

        for (const d of toDelete) {
            await databases.deleteDocument(dbId, collectionId, d.$id);
        }

        console.log(`[clean] ${collectionId}: deleted ${toDelete.length}`);
    }
}

function makeLineItems(stockItems, baseAmount, type) {
    const one = stockItems[0];
    const two = stockItems[1];

    const split1 = Math.round(baseAmount * 0.58);
    const split2 = baseAmount - split1;

    const q1 = Math.max(1, Math.round(split1 / one.rate));
    const q2 = Math.max(1, Math.round(split2 / two.rate));

    return [
        {
            stock_item_name: one.name,
            quantity: q1,
            rate: one.rate,
            amount: q1 * one.rate,
            unit: one.unit,
            hsn_code: one.hsn_code,
            tax_rate: one.gst_rate,
            is_inward: type === 'Purchase'
        },
        {
            stock_item_name: two.name,
            quantity: q2,
            rate: two.rate,
            amount: q2 * two.rate,
            unit: two.unit,
            hsn_code: two.hsn_code,
            tax_rate: two.gst_rate,
            is_inward: type === 'Purchase'
        }
    ];
}

function calcTax(items, isInterState) {
    const taxable = items.reduce((s, it) => s + Number(it.amount || 0), 0);
    const avgRate = items.length ? items.reduce((s, it) => s + Number(it.tax_rate || 0), 0) / items.length : 0;
    const totalTax = (taxable * avgRate) / 100;

    if (isInterState) {
        return {
            taxable_value: taxable,
            cgst_amount: 0,
            sgst_amount: 0,
            igst_amount: Number(totalTax.toFixed(2)),
            cess_amount: 0
        };
    }

    return {
        taxable_value: taxable,
        cgst_amount: Number((totalTax / 2).toFixed(2)),
        sgst_amount: Number((totalTax / 2).toFixed(2)),
        igst_amount: 0,
        cess_amount: 0
    };
}

async function run() {
    const companies = await listAll('companies');
    if (!companies.length) {
        throw new Error('No company found in companies collection. Create a company first.');
    }

    const companyDoc = companies[0];
    let companyJson = {};
    try { companyJson = JSON.parse(companyDoc.json_data || '{}'); } catch (e) { }

    const companyId = companyJson.id || companyDoc.company_id || companyDoc.$id;
    const companyName = companyJson.name || companyDoc.name || 'Demo Tally Company';

    console.log(`[company] ${companyName} (${companyId})`);

    await upsert('companies', companyDoc.$id, {
        ...companyJson,
        id: companyId,
        company_id: companyId,
        name: companyName,
        gstin: companyJson.gstin || '27ABCDE1234F1Z5',
        state: companyJson.state || 'Maharashtra',
        is_active: true,
        last_sync_at: new Date().toISOString()
    });

    await clearCompanyData(companyId);

    const ledgers = [
        { id: 'led_sales', name: 'Sales Account', parent: 'Sales Accounts', current_balance: -845000, opening_balance: -120000 },
        { id: 'led_purchase', name: 'Purchase Account', parent: 'Purchase Accounts', current_balance: 465000, opening_balance: 82000 },
        { id: 'led_debtors', name: 'Sundry Debtors', parent: 'Sundry Debtors', current_balance: 213500, opening_balance: 95000 },
        { id: 'led_creditors', name: 'Sundry Creditors', parent: 'Sundry Creditors', current_balance: -152700, opening_balance: -67000 },
        { id: 'led_cash', name: 'Cash', parent: 'Cash-in-Hand', current_balance: 74500, opening_balance: 28000 },
        { id: 'led_bank', name: 'HDFC Bank', parent: 'Bank Accounts', current_balance: 331200, opening_balance: 155000 },
        { id: 'led_direct_exp', name: 'Freight Inward', parent: 'Direct Expenses', current_balance: 28700, opening_balance: 9000 },
        { id: 'led_indirect_exp', name: 'Salary Expense', parent: 'Indirect Expenses', current_balance: 136000, opening_balance: 42000 },
        { id: 'led_direct_inc', name: 'Discount Received', parent: 'Direct Incomes', current_balance: -18500, opening_balance: -6000 },
        { id: 'led_indirect_inc', name: 'Interest Income', parent: 'Indirect Incomes', current_balance: -12400, opening_balance: -3000 },
        { id: 'led_stock', name: 'Stock-in-Hand', parent: 'Stock-in-Hand', current_balance: 256800, opening_balance: 185200 }
    ];

    const companyKey = String(companyId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'cmp';

    for (let i = 0; i < ledgers.length; i += 1) {
        const l = ledgers[i];
        await upsert('ledgers', `${companyKey}_led_${String(i + 1).padStart(2, '0')}`, {
            ...l,
            company_id: companyId,
            parent_group: l.parent,
            closing_balance: l.current_balance,
            status: 'active'
        });
    }
    console.log(`[seed] ledgers: ${ledgers.length}`);

    const stockItems = [
        { id: 'stk_laptop', name: 'Laptop Pro 14', stock_group: 'Electronics', unit: 'Nos', hsn_code: '84713010', gst_rate: 18, opening_stock: 12, current_stock: 9, rate: 65000 },
        { id: 'stk_printer', name: 'Thermal Printer', stock_group: 'Electronics', unit: 'Nos', hsn_code: '84433290', gst_rate: 18, opening_stock: 18, current_stock: 13, rate: 8500 },
        { id: 'stk_keyboard', name: 'Mechanical Keyboard', stock_group: 'Accessories', unit: 'Nos', hsn_code: '84716040', gst_rate: 18, opening_stock: 45, current_stock: 36, rate: 3200 },
        { id: 'stk_mouse', name: 'Wireless Mouse', stock_group: 'Accessories', unit: 'Nos', hsn_code: '84716060', gst_rate: 18, opening_stock: 60, current_stock: 42, rate: 900 },
        { id: 'stk_ssd', name: 'SSD 1TB', stock_group: 'Storage', unit: 'Nos', hsn_code: '85235100', gst_rate: 18, opening_stock: 24, current_stock: 16, rate: 6200 },
        { id: 'stk_ups', name: 'UPS 1KVA', stock_group: 'Power', unit: 'Nos', hsn_code: '85044090', gst_rate: 18, opening_stock: 16, current_stock: 12, rate: 5400 },
        { id: 'stk_toner', name: 'Printer Toner', stock_group: 'Consumables', unit: 'Nos', hsn_code: '84439959', gst_rate: 18, opening_stock: 40, current_stock: 31, rate: 2100 },
        { id: 'stk_cable', name: 'HDMI Cable', stock_group: 'Accessories', unit: 'Nos', hsn_code: '85444299', gst_rate: 18, opening_stock: 100, current_stock: 78, rate: 450 }
    ];

    for (let i = 0; i < stockItems.length; i += 1) {
        const s = stockItems[i];
        const openingValue = s.opening_stock * s.rate;
        const closingValue = s.current_stock * s.rate;

        await upsert('stock_items', `${companyKey}_stk_${String(i + 1).padStart(2, '0')}`, {
            ...s,
            company_id: companyId,
            opening_value: openingValue,
            closing_value: closingValue,
            reorder_level: 5,
            status: 'active'
        });
    }
    console.log(`[seed] stock_items: ${stockItems.length}`);

    const salesVouchers = [
        { id: 'vch_s_001', date: '2025-10-08', party: 'Apex Traders', gstin: '27AABCA1111A1Z5', base: 118000, place: '27-Maharashtra' },
        { id: 'vch_s_002', date: '2025-10-21', party: 'Neon Retail', gstin: '', base: 42000, place: '27-Maharashtra' },
        { id: 'vch_s_003', date: '2025-11-05', party: 'Orbit Tech', gstin: '27AAACO2222B1Z4', base: 96500, place: '27-Maharashtra' },
        { id: 'vch_s_004', date: '2025-11-19', party: 'Metro Systems', gstin: '29AACCM3333C1Z2', base: 152000, place: '29-Karnataka' },
        { id: 'vch_s_005', date: '2025-12-03', party: 'Walkin Customer', gstin: '', base: 28000, place: '27-Maharashtra' },
        { id: 'vch_s_006', date: '2025-12-28', party: 'Bright Mart', gstin: '27AACCB4444D1Z1', base: 73500, place: '27-Maharashtra' },
        { id: 'vch_s_007', date: '2026-01-04', party: 'Zen Agency', gstin: '24AACCZ5555E1Z8', base: 124000, place: '24-Gujarat' },
        { id: 'vch_s_008', date: '2026-01-17', party: 'Cash', gstin: '', base: 36000, place: '27-Maharashtra' },
        { id: 'vch_s_009', date: '2026-01-29', party: 'Prime Enterprises', gstin: '27AACCP6666F1Z6', base: 84500, place: '27-Maharashtra' },
        { id: 'vch_s_010', date: '2026-02-03', party: 'Bluebox Sales', gstin: '27AACCB7777G1Z3', base: 59200, place: '27-Maharashtra' },
        { id: 'vch_s_011', date: '2026-02-11', party: 'Mango Retail', gstin: '', base: 31400, place: '27-Maharashtra' },
        { id: 'vch_s_012', date: '2026-02-19', party: 'Vista LLP', gstin: '09AACCV8888H1Z9', base: 101000, place: '09-Uttar Pradesh' }
    ];

    const purchaseVouchers = [
        { id: 'vch_p_001', date: '2025-10-04', party: 'Delta Supplies', gstin: '27AAACD1234A1Z7', base: 82000, place: '27-Maharashtra' },
        { id: 'vch_p_002', date: '2025-11-15', party: 'Core Imports', gstin: '29AAACC5678B1Z2', base: 91000, place: '29-Karnataka' },
        { id: 'vch_p_003', date: '2025-12-10', party: 'Omni Components', gstin: '27AAACO4321C1Z6', base: 76500, place: '27-Maharashtra' },
        { id: 'vch_p_004', date: '2026-01-08', party: 'SupplyHub', gstin: '24AAACS9876D1Z4', base: 63400, place: '24-Gujarat' },
        { id: 'vch_p_005', date: '2026-01-25', party: 'Local Vendor', gstin: '27AAACL1111E1Z5', base: 55200, place: '27-Maharashtra' },
        { id: 'vch_p_006', date: '2026-02-14', party: 'Metro Wholesale', gstin: '27AAACM2222F1Z8', base: 68800, place: '27-Maharashtra' }
    ];

    const cashVouchers = [
        { id: 'vch_r_001', type: 'Receipt', date: '2025-11-30', party: 'Apex Traders', base: 30000 },
        { id: 'vch_r_002', type: 'Receipt', date: '2026-01-31', party: 'Prime Enterprises', base: 45000 },
        { id: 'vch_pay_001', type: 'Payment', date: '2025-12-05', party: 'Delta Supplies', base: 26000 },
        { id: 'vch_pay_002', type: 'Payment', date: '2026-02-16', party: 'SupplyHub', base: 34000 }
    ];

    let vCounter = 1;
    let stockEntryCounter = 1;
    let ledgerEntryCounter = 1;

    const createVoucherBundle = async (row, type) => {
        const pool = [
            stockItems[(vCounter + 1) % stockItems.length],
            stockItems[(vCounter + 3) % stockItems.length]
        ];
        const items = makeLineItems(pool, row.base, type);
        const isInterState = String(row.place || '').startsWith('29-') || String(row.place || '').startsWith('24-') || String(row.place || '').startsWith('09-');
        const tax = calcTax(items, isInterState);
        const total = Number((tax.taxable_value + tax.cgst_amount + tax.sgst_amount + tax.igst_amount + tax.cess_amount).toFixed(2));

        const voucherData = {
            id: row.id,
            voucher_id: row.id,
            company_id: companyId,
            voucher_type: type,
            voucher_number: `${type === 'Sales' ? 'SI' : 'PI'}-${String(vCounter).padStart(4, '0')}`,
            invoice_number: `${type === 'Sales' ? 'SI' : 'PI'}-${String(vCounter).padStart(4, '0')}`,
            voucher_date: row.date,
            vch_date: row.date,
            party_name: row.party,
            party_ledger_name: row.party,
            party_gstin: row.gstin || '',
            place_of_supply: row.place || '27-Maharashtra',
            taxable_value: tax.taxable_value,
            cgst_amount: tax.cgst_amount,
            sgst_amount: tax.sgst_amount,
            igst_amount: tax.igst_amount,
            cess_amount: tax.cess_amount,
            total_amount: tax.taxable_value,
            grand_total: total,
            amount: total,
            is_deleted: false,
            narration: `${type} voucher auto-seeded for dashboard testing`,
            status: 'Synced'
        };

        await upsert('vouchers', row.id, voucherData);

        if (type === 'Sales' || type === 'Purchase') {
            const targetCollection = type === 'Sales' ? 'sales' : 'purchases';
            await upsert(targetCollection, `txn_${row.id}`, {
                id: `txn_${row.id}`,
                voucher_id: row.id,
                company_id: companyId,
                voucher_type: type,
                invoice_number: voucherData.invoice_number,
                invoice_date: row.date,
                party_ledger_name: row.party,
                party_gstin: row.gstin || '',
                place_of_supply: row.place || '27-Maharashtra',
                taxable_amount: tax.taxable_value,
                cgst_amount: tax.cgst_amount,
                sgst_amount: tax.sgst_amount,
                igst_amount: tax.igst_amount,
                cess_amount: tax.cess_amount,
                net_amount: total,
                amount: total,
                is_cancelled: false
            });
        }

        for (const item of items) {
            const sid = `vse_${String(stockEntryCounter).padStart(4, '0')}`;
            stockEntryCounter += 1;
            await upsert('voucher_stock_entries', sid, {
                id: sid,
                company_id: companyId,
                voucher_id: row.id,
                stock_item_name: item.stock_item_name,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                unit: item.unit,
                hsn_code: item.hsn_code,
                tax_rate: item.tax_rate,
                is_inward: item.is_inward
            });
        }

        const l1 = `vle_${String(ledgerEntryCounter).padStart(4, '0')}`;
        ledgerEntryCounter += 1;
        const l2 = `vle_${String(ledgerEntryCounter).padStart(4, '0')}`;
        ledgerEntryCounter += 1;

        await upsert('voucher_ledger_entries', l1, {
            id: l1,
            company_id: companyId,
            voucher_id: row.id,
            ledger_name: row.party,
            amount: total,
            is_debit: type !== 'Sales'
        });

        await upsert('voucher_ledger_entries', l2, {
            id: l2,
            company_id: companyId,
            voucher_id: row.id,
            ledger_name: type === 'Sales' ? 'Sales Account' : 'Purchase Account',
            amount: total,
            is_debit: type === 'Sales'
        });

        vCounter += 1;
    };

    for (const row of salesVouchers) {
        await createVoucherBundle(row, 'Sales');
    }

    for (const row of purchaseVouchers) {
        await createVoucherBundle(row, 'Purchase');
    }

    for (const row of cashVouchers) {
        const total = Number(row.base.toFixed(2));
        await upsert('vouchers', row.id, {
            id: row.id,
            voucher_id: row.id,
            company_id: companyId,
            voucher_type: row.type,
            voucher_number: `${row.type === 'Receipt' ? 'RC' : 'PY'}-${String(vCounter).padStart(4, '0')}`,
            invoice_number: `${row.type === 'Receipt' ? 'RC' : 'PY'}-${String(vCounter).padStart(4, '0')}`,
            voucher_date: row.date,
            vch_date: row.date,
            party_name: row.party,
            party_ledger_name: row.party,
            taxable_value: total,
            cgst_amount: 0,
            sgst_amount: 0,
            igst_amount: 0,
            cess_amount: 0,
            total_amount: total,
            grand_total: total,
            amount: total,
            is_deleted: false,
            narration: `${row.type} voucher auto-seeded for testing`,
            status: 'Synced'
        });
        vCounter += 1;
    }

    console.log(`[seed] vouchers: ${salesVouchers.length + purchaseVouchers.length + cashVouchers.length}`);
    console.log(`[seed] sales txns: ${salesVouchers.length}`);
    console.log(`[seed] purchases txns: ${purchaseVouchers.length}`);
    console.log(`[seed] voucher_stock_entries: ${stockEntryCounter - 1}`);
    console.log(`[seed] voucher_ledger_entries: ${ledgerEntryCounter - 1}`);

    console.log('\nDone. Mock Tally data ready for dashboard/report pages.');
}

run().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});

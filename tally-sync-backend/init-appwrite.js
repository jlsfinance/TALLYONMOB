const { Client, Databases, Permission, Role } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(client);
const dbId = 'tally_sync_db';

async function init() {
    try {
        console.log('Creating database...');
        try {
            await databases.create(dbId, 'Tally Sync Database');
            console.log('Database created successfully.');
        } catch (e) {
            if (e.code === 409) console.log('Database already exists.');
            else throw e;
        }

        const collections = [
            {
                id: 'companies',
                name: 'Companies',
                attributes: [
                    { key: 'name', type: 'string', required: true, size: 255 },
                    { key: 'formal_name', type: 'string', required: false, size: 255 },
                    { key: 'address', type: 'string', required: false, size: 1000 },
                    { key: 'email', type: 'string', required: false, size: 255 },
                    { key: 'phone', type: 'string', required: false, size: 50 },
                    { key: 'sync_api_key', type: 'string', required: false, size: 255 },
                    { key: 'is_active', type: 'boolean', required: false, default: true },
                    { key: 'financial_year_start', type: 'datetime', required: false },
                    { key: 'financial_year_end', type: 'datetime', required: false },
                    { key: 'last_sync_at', type: 'datetime', required: false }
                ]
            },
            {
                id: 'ledgers',
                name: 'Ledgers',
                attributes: [
                    { key: 'company_id', type: 'string', required: true, size: 255 },
                    { key: 'name', type: 'string', required: true, size: 255 },
                    { key: 'parent_group', type: 'string', required: false, size: 255 },
                    { key: 'closing_balance', type: 'double', required: false },
                    { key: 'gstin', type: 'string', required: false, size: 50 },
                    { key: 'address', type: 'string', required: false, size: 1000 },
                    { key: 'alter_id', type: 'string', required: false, size: 100 }
                ]
            },
            {
                id: 'vouchers',
                name: 'Vouchers',
                attributes: [
                    { key: 'company_id', type: 'string', required: true, size: 255 },
                    { key: 'voucher_number', type: 'string', required: false, size: 255 },
                    { key: 'voucher_type', type: 'string', required: true, size: 255 },
                    { key: 'vch_date', type: 'datetime', required: true },
                    { key: 'party_ledger_name', type: 'string', required: false, size: 255 },
                    { key: 'amount', type: 'double', required: false },
                    { key: 'narration', type: 'string', required: false, size: 5000 },
                    { key: 'alter_id', type: 'string', required: false, size: 100 }
                ]
            }
        ];

        for (const col of collections) {
            console.log(`Setting up collection: ${col.id}...`);
            try {
                await databases.createCollection(
                    dbId,
                    col.id,
                    col.name,
                    [
                        Permission.read(Role.any()),
                        Permission.create(Role.any()),
                        Permission.update(Role.any()),
                        Permission.delete(Role.any())
                    ]
                );
                console.log(`Collection ${col.id} created.`);
            } catch (e) {
                if (e.code === 409) console.log(`Collection ${col.id} already exists.`);
                else throw e;
            }

            for (const attr of col.attributes) {
                try {
                    console.log(`Adding attribute ${attr.key} to ${col.id}...`);
                    if (attr.type === 'string') {
                        await databases.createStringAttribute(dbId, col.id, attr.key, attr.size, attr.required, attr.default);
                    } else if (attr.type === 'boolean') {
                        await databases.createBooleanAttribute(dbId, col.id, attr.key, attr.required, attr.default);
                    } else if (attr.type === 'double') {
                        await databases.createFloatAttribute(dbId, col.id, attr.key, attr.required);
                    } else if (attr.type === 'datetime') {
                        await databases.createDatetimeAttribute(dbId, col.id, attr.key, attr.required);
                    }
                } catch (e) {
                    if (e.code === 409) console.log(`Attribute ${attr.key} already exists.`);
                    else console.error(`Failed to add attribute ${attr.key}: ${e.message}`);
                }
            }
        }

        console.log('Appwrite initialization applied successfully.');
    } catch (e) {
        console.error('Initialization error:', e);
    }
}

init();

const { Client, Databases } = require('node-appwrite');

const appwriteClient = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const db = new Databases(appwriteClient);

async function run() {
    console.log('Starting migration...');
    try {
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
            const res = await db.listDocuments('tally_sync_db', 'rest');

            if (res.documents.length === 0) {
                hasMore = false;
                break;
            }

            for (let d of res.documents) {
                let jd = {};
                try {
                    jd = JSON.parse(d.json_data || '{}');
                } catch (e) { }

                const id = jd.id || d.$id;
                let targetCol = null;

                if (d.json_data && d.json_data.includes('current_stock')) {
                    targetCol = 'stock_items';
                } else if (d.json_data && d.json_data.includes('voucher_number')) {
                    targetCol = 'vouchers';
                }

                if (!targetCol) {
                    await db.deleteDocument('tally_sync_db', 'rest', d.$id);
                    continue; // Skip unrecognized and delete from queue
                }

                try {
                    const payload = {
                        json_data: d.json_data,
                        company_id: (jd.company_id || d.company_id || null)?.toString(),
                        name: (jd.name || d.name || null)?.toString()
                    };

                    await db.createDocument('tally_sync_db', targetCol, id, payload);
                    console.log('Migrated', id, 'to', targetCol);
                } catch (e) {
                    if (e.code === 409) {
                        try {
                            const payload = {
                                json_data: d.json_data,
                                company_id: (jd.company_id || d.company_id || null)?.toString(),
                                name: (jd.name || d.name || null)?.toString()
                            };
                            await db.updateDocument('tally_sync_db', targetCol, id, Object.fromEntries(Object.entries(payload).filter(([_, v]) => v != null)));
                            console.log('Updated', id, 'in', targetCol);
                        } catch (ue) {
                            console.log('Update failed', id, ue.message);
                        }
                    } else {
                        console.log('Failed', id, e.message);
                    }
                }

                // Delete from rest table
                await db.deleteDocument('tally_sync_db', 'rest', d.$id);
            }
        }
        console.log('Done');
    } catch (e) {
        console.error('Error:', e.message);
    }
}
run();

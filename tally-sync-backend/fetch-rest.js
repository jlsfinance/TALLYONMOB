const { Client, Databases } = require('node-appwrite');
const fs = require('fs');

const appwriteClient = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69a06098003b91c827a9')
    .setKey('standard_9ab1480c74d3f00b893fb4e8d9b2facc473c33a542f4e7e982b9eeadad6712548e75e2ce50fca1fd7fdcf5bbb4143a05419eecf9290484b9aeaadb37aef157a1309e573fe098e8c0f3c566f2155e982b24c75994dd50bc3698292f07408cf27a2116e305061a2a0260ec9df763d33574642c4878d1d80a22d2cd2afa9636f2a2');

const databases = new Databases(appwriteClient);

async function run() {
    try {
        const res = await databases.listDocuments('tally_sync_db', 'rest');
        fs.writeFileSync('rest-docs.json', JSON.stringify(res.documents.slice(0, 5), null, 2));
        console.log("Done");
    } catch (e) {
        console.error(e.message);
    }
}
run();

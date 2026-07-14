import { Client, Databases } from 'node-appwrite';

const c = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('69a320ff003acccf8024')
    .setKey('standard_f51fbb04eec1559fa556e29040058be1139f3f18188b59dd9b74b58cc5ef402e1e9e6ed8be0e37516f18cf19b89ba5a6499d62053c9c7980e2cfc8df787a7f0eb905b2b0bd6d4d03faf6d504542a316a43da0decdc43f639e549a8de75933f2d4388373eb772eb37198721f08f266e7f45e155d3e669eedeb5fe0e276b87dad5');

const d = new Databases(c);
const res = await d.listCollections('tally_sync_db');
console.log('Collections found:', res.total);
res.collections.forEach(col => {
    console.log(`  - ${col.$id} (${col.name})`);
});

const axios = require('axios');

async function scanPorts() {
    console.log("🔍 Scanning Tally Ports (9000-9005)...");

    for (let port = 9000; port <= 9005; port++) {
        const url = `http://127.0.0.1:${port}`;
        try {
            console.log(`Checking ${url}...`);
            await axios.get(url, { timeout: 1000 });
            console.log(`✅ FOUND TALLY AT PORT ${port}!`);
            console.log(`👉 Please update CONFIG in main.js to use port ${port}`);
            return;
        } catch (e) {
            // console.log(`❌ Port ${port} closed.`);
        }
    }
    console.log("❌ Could not find Tally on any standard port.");
    console.log("⚠️  Please check inside Tally: F1 > Settings > Connectivity > Client/Server configuration.");
}

scanPorts();

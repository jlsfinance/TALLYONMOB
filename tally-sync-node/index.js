require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const cron = require('node-cron');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    TALLY_URL: 'http://localhost:9000',
    BACKEND_URL: 'http://localhost:5000/api/v1/sync',
    API_KEY: 'vypar_sync_secure_882937401', // From your .env
    COMPANY_NAME: 'MyCompany', // Default Tally Company Name (Change if needed)
    SYNC_INTERVAL: '*/5 * * * *' // Every 5 minutes
};

// Logger Setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'sync.log' })
    ]
});

// XML Parser
const parser = new xml2js.Parser({ explicitArray: false });

/**
 * Send XML Request to Tally
 */
async function fetchFromTally(xmlBody) {
    try {
        const response = await axios.post(CONFIG.TALLY_URL, xmlBody, {
            headers: { 'Content-Type': 'text/xml' }
        });
        return response.data;
    } catch (error) {
        throw new Error(`Tally Connection Error: ${error.message}. Is Tally running on port 9000?`);
    }
}

/**
 * Fetch Ledgers
 */
async function getLedgers() {
    const xml = `
    <ENVELOPE>
        <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>LedgerColl</ID>
        </HEADER>
        <BODY>
            <DESC>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                </STATICVARIABLES>
                <TDL>
                    <TDLMESSAGE>
                        <COLLECTION NAME="LedgerColl" ISMODIFY="No">
                            <TYPE>Ledger</TYPE>
                            <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, PHONE, EMAIL, PARTYGSTIN</FETCH>
                        </COLLECTION>
                    </TDLMESSAGE>
                </TDL>
            </DESC>
        </BODY>
    </ENVELOPE>`;

    const response = await fetchFromTally(xml);
    const result = await parser.parseStringPromise(response);

    // Normalize data
    let ledgers = result.ENVELOPE.BODY.DATA.COLLECTION.LEDGER;
    if (!ledgers) return [];
    if (!Array.isArray(ledgers)) ledgers = [ledgers];

    return ledgers.map(l => ({
        id: l.GUID,
        name: l.NAME,
        parentGroup: l.PARENT,
        openingBalance: parseFloat(l.OPENINGBALANCE || 0),
        closingBalance: parseFloat(l.CLOSINGBALANCE || 0),
        phone: l.PHONE || null,
        email: l.EMAIL || null,
        gstin: l.PARTYGSTIN || null
    }));
}

/**
 * Upload to Backend
 */
async function uploadToBackend(dataType, data) {
    if (!data || data.length === 0) {
        logger.info(`No ${dataType} data to sync.`);
        return;
    }

    try {
        // Tally ID is usually the company name or GUID. For this demo we use '1' or fetch from Tally.
        // In prod, fetch active company GUID.
        const companyId = "MyCompany_GUID_123";

        logger.info(`Uploading ${data.length} ${dataType}...`);

        const response = await axios.post(CONFIG.BACKEND_URL, {
            companyId: companyId,
            dataType: dataType,
            data: data
        }, {
            headers: { 'X-API-Key': CONFIG.API_KEY }
        });

        logger.info(`✅ Synced ${dataType}: ${response.data.message || 'Success'}`);
    } catch (error) {
        logger.error(`❌ Upload Failed (${dataType}): ${error.response?.data?.error || error.message}`);
    }
}

/**
 * Main Sync Function
 */
async function runSync() {
    logger.info('--- Starting Sync Cycle ---');

    try {
        // 1. Sync Ledgers
        logger.info('Fetching Ledgers from Tally...');
        const ledgers = await getLedgers();
        await uploadToBackend('ledgers', ledgers);

        // 2. Sync Vouchers (Simplified for demo)
        // Add getVouchers() similar to getLedgers() here

    } catch (error) {
        logger.error(`Sync Cycle Error: ${error.message}`);
    }

    logger.info('--- Sync Cycle Completed ---');
}

// Start Immediate Sync
runSync();

// Schedule Cron
cron.schedule(CONFIG.SYNC_INTERVAL, () => {
    runSync();
});

console.log(`🚀 Tally Node.js Sync Client Running...`);
console.log(`⏳ Scheduled to run every 5 minutes.`);

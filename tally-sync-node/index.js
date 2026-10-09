require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const cron = require('node-cron');
const winston = require('winston');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { SyncQueue } = require('./syncQueue');

function resolveDeviceId() {
  if (process.env.DEVICE_ID) return process.env.DEVICE_ID;
  const file = path.join(__dirname, '.device-id');
  try {
    if (require('fs').existsSync(file)) return require('fs').readFileSync(file, 'utf8').trim();
    const id = `${os.hostname()}-${crypto.randomUUID()}`;
    require('fs').writeFileSync(file, id, 'utf8');
    return id;
  } catch {
    return `${os.hostname()}-${crypto.randomUUID()}`;
  }
}

const required = ['TALLY_URL', 'BACKEND_URL', 'SYNC_API_KEY', 'COMPANY_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and configure the connector.');
  process.exit(1);
}

const CONFIG = {
  TALLY_URL: process.env.TALLY_URL.replace(/\/$/, ''),
  BACKEND_URL: process.env.BACKEND_URL.replace(/\/$/, ''),
  API_KEY: process.env.SYNC_API_KEY,
  COMPANY_ID: process.env.COMPANY_ID,
  COMPANY_NAME: process.env.COMPANY_NAME || 'Tally Company',
  DEVICE_ID: resolveDeviceId(),
  SYNC_INTERVAL: process.env.SYNC_INTERVAL || '*/5 * * * *',
  REQUEST_TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS || 30000),
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: 'sync.log' })],
});

const parser = new xml2js.Parser({ explicitArray: false });
const queue = new SyncQueue(path.join(__dirname, process.env.QUEUE_FILE || 'sync-queue.json'));
let syncRunning = false;

async function fetchFromTally(xmlBody) {
  const response = await axios.post(CONFIG.TALLY_URL, xmlBody, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });
  return response.data;
}

async function getLedgers() {
  const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerColl</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="LedgerColl" ISMODIFY="No"><TYPE>Ledger</TYPE><FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, ADDRESS, PHONE, EMAIL, PARTYGSTIN</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const result = await parser.parseStringPromise(await fetchFromTally(xml));
  let ledgers = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || [];
  if (!Array.isArray(ledgers)) ledgers = [ledgers];
  return ledgers.filter(Boolean).map((ledger) => ({
    id: ledger.GUID || ledger.NAME,
    name: ledger.NAME,
    parentGroup: ledger.PARENT,
    openingBalance: Number(ledger.OPENINGBALANCE || 0),
    closingBalance: Number(ledger.CLOSINGBALANCE || 0),
    phone: ledger.PHONE || null,
    email: ledger.EMAIL || null,
    gstin: ledger.PARTYGSTIN || null,
  }));
}

async function uploadBatch(item) {
  const { dataType, data } = item.payload;
  const idempotencyKey = `${CONFIG.DEVICE_ID}:${item.dedupeKey}`;
  const response = await axios.post(CONFIG.BACKEND_URL, {
    companyId: CONFIG.COMPANY_ID,
    dataType,
    data,
    isIncremental: true,
    deviceId: CONFIG.DEVICE_ID,
    idempotencyKey,
  }, {
    headers: {
      'X-API-Key': CONFIG.API_KEY,
      'X-Device-ID': CONFIG.DEVICE_ID,
      'X-Idempotency-Key': idempotencyKey,
    },
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
  });
  return response.data;
}

async function drainQueue() {
  const dueItems = queue.due();
  if (!dueItems.length) return;
  logger.info(`Queue drain started: ${dueItems.length} pending batch(es)`);
  for (const item of dueItems) {
    try {
      const result = await uploadBatch(item);
      queue.markSuccess(item.id);
      logger.info(`Queue item ${item.id} synced: ${result?.message || 'success'}`);
    } catch (error) {
      queue.markFailure(item.id, error);
      logger.error(`Queue item ${item.id} failed: ${error.response?.data?.message || error.message}`);
    }
  }
  queue.compact();
}

async function runSync() {
  if (syncRunning) {
    logger.warn('Sync skipped: previous cycle is still running');
    return;
  }
  syncRunning = true;
  logger.info(`--- Starting sync cycle for ${CONFIG.COMPANY_NAME} (${CONFIG.DEVICE_ID}) ---`);
  try {
    const ledgers = await getLedgers();
    if (ledgers.length) {
      const key = `${CONFIG.COMPANY_ID}:ledgers:${ledgers.map((entry) => entry.id).sort().join(',')}`;
      queue.enqueue({ dataType: 'ledgers', data: ledgers }, key);
      logger.info(`Enqueued ${ledgers.length} ledgers`);
    } else {
      logger.info('No ledger data returned by Tally');
    }
  } catch (error) {
    logger.error(`Tally fetch failed; existing queue preserved: ${error.message}`);
  }
  await drainQueue();
  logger.info(`Queue status: ${queue.pendingCount()} pending, ${queue.failedCount()} permanently failed`);
  logger.info('--- Sync cycle completed ---');
  syncRunning = false;
}

runSync().catch((error) => logger.error(`Initial sync failed: ${error.message}`));
cron.schedule(CONFIG.SYNC_INTERVAL, () => runSync().catch((error) => logger.error(error.message)));
logger.info(`Tally sync client running; schedule=${CONFIG.SYNC_INTERVAL}, device=${CONFIG.DEVICE_ID}`);

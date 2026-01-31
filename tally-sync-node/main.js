const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');
require('dotenv').config();

let CONFIG = {
    TALLY_URL: 'http://127.0.0.1:9000',
    BACKEND_URL: 'http://localhost:5000/api/v1/sync',
    API_KEY: 'vypar_sync_secure_882937401',
    TIMEOUT: 5000
};

let mainWindow;
let isSyncing = false;
let detectedPort = 9000;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 750,
        title: "LiveKeeping Pro",
        resizable: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    mainWindow.loadFile('index.html');

    // Start scanning for Tally
    findTallyPort();
    setInterval(findTallyPort, 10000); // Check every 10s
}

app.whenReady().then(createWindow);

async function findTallyPort() {
    const ports = [9000, 9001, 9002, 9003, 9004, 9005, 9010];
    for (let port of ports) {
        try {
            const url = `http://127.0.0.1:${port}`;
            // Simple XML to check connection and get company
            const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>GetCompany</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><REPORT NAME="GetCompany"><FORMS>GetCompany</FORMS></REPORT><FORM NAME="GetCompany"><PARTS>GetCompany</PARTS></FORM><PART NAME="GetCompany"><LINES>GetCompany</LINES></PART><LINE NAME="GetCompany"><FIELDS>GetCompany</FIELDS></LINE><FIELD NAME="GetCompany"><SET>$$CurrentCompany</SET></FIELD></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

            const res = await axios.post(url, xml, { timeout: 1000 });
            if (res.data && res.data.includes('ENVELOPE')) {
                detectedPort = port;
                CONFIG.TALLY_URL = url;

                const parser = new xml2js.Parser({ explicitArray: false });
                const result = await parser.parseStringPromise(res.data);
                let name = result?.ENVELOPE?.BODY?.DATA?.FIELD_VALUE;
                if (typeof name === 'object') name = name._;

                if (mainWindow) mainWindow.webContents.send('status-update', {
                    status: 'connected',
                    company: name || 'Company Open',
                    port: port
                });
                return; // Found it!
            }
        } catch (e) {
            // Keep looking
        }
    }
    if (mainWindow) mainWindow.webContents.send('status-update', { status: 'disconnected', error: 'Tally Not Found (9000-9010)' });
}

ipcMain.on('start-sync', () => startSync());
ipcMain.on('open-dashboard', () => shell.openExternal('http://localhost:5173'));

async function startSync() {
    if (isSyncing) return;
    isSyncing = true;
    if (mainWindow) mainWindow.webContents.send('log', { message: `Starting sync on port ${detectedPort}...`, level: 'info' });

    try {
        const ledgers = await fetchLedgers();
        const vouchers = await fetchVouchers();
        if (mainWindow) {
            mainWindow.webContents.send('update-counts', { ledgers: ledgers.length, vouchers: vouchers.length });
            mainWindow.webContents.send('sync-complete', { time: new Date().toLocaleTimeString() });
        }
        if (mainWindow) mainWindow.webContents.send('log', { message: "Sync Success!", level: 'success' });
    } catch (error) {
        if (mainWindow) mainWindow.webContents.send('log', { message: `Sync Failed: ${error.message}`, level: 'error' });
    } finally {
        isSyncing = false;
    }
}

async function fetchLedgers() {
    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>L</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="L" ISMODIFY="No"><TYPE>Ledger</TYPE><FETCH>NAME, GUID, PARENT, CLOSINGBALANCE</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    const response = await axios.post(CONFIG.TALLY_URL, xml, { timeout: 30000 });
    const result = await (new xml2js.Parser({ explicitArray: false })).parseStringPromise(response.data);
    let items = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || [];
    return Array.isArray(items) ? items : [items];
}

async function fetchVouchers() {
    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>V</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="V" ISMODIFY="No"><TYPE>Voucher</TYPE><FETCH>DATE, GUID, PARTYLEDGERNAME, AMOUNT</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    const response = await axios.post(CONFIG.TALLY_URL, xml, { timeout: 30000 });
    const result = await (new xml2js.Parser({ explicitArray: false })).parseStringPromise(response.data);
    let items = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER || [];
    return Array.isArray(items) ? items : [items];
}

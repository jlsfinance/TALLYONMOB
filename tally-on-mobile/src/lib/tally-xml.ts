// TallyPrime XML API client
// Communicates with Tally on localhost:9000 via XML over HTTP

import { XMLParser } from 'fast-xml-parser';

const TALLY_URL = process.env.TALLY_XML_URL || 'http://127.0.0.1:9000';
const TIMEOUT = Number(process.env.TALLY_XML_TIMEOUT_MS || 12000);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

interface TallyRequestOptions {
  fromDate?: string;
  toDate?: string;
  companyName?: string;
}

// ─── XML REQUEST BUILDERS ───────────────────────────────────────────────────

function buildCompanyListXml(): string {
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildLedgerXml(opts: TallyRequestOptions): string {
  const fromDate = opts.fromDate || '20240401';
  const toDate = opts.toDate || '20250331';
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>My Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${opts.companyName || ''}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="My Ledgers">
            <FORMS>My Form</FORMS>
          </REPORT>
          <FORM NAME="My Form">
            <PARTS>My Part</PARTS>
          </FORM>
          <PART NAME="My Part">
            <LINES>My Line</LINES>
            <REPEAT>My Line:My Collection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="My Line">
            <FIELDS>LName,LParent,LType,LOpenBal,LClosBal,LGUID,LAlterId,LMasterId,LGSTIN,LPhone,LEmail</FIELDS>
          </LINE>
          <FIELD NAME="LName"><SET>$Name</SET></FIELD>
          <FIELD NAME="LParent"><SET>$Parent</SET></FIELD>
          <FIELD NAME="LType"><SET>$LedgerType</SET></FIELD>
          <FIELD NAME="LOpenBal"><SET>$OpeningBalance</SET></FIELD>
          <FIELD NAME="LClosBal"><SET>$ClosingBalance</SET></FIELD>
          <FIELD NAME="LGUID"><SET>$GUID</SET></FIELD>
          <FIELD NAME="LAlterId"><SET>$AlterId</SET></FIELD>
          <FIELD NAME="LMasterId"><SET>$MasterId</SET></FIELD>
          <FIELD NAME="LGSTIN"><SET>$PartyGSTIN</SET></FIELD>
          <FIELD NAME="LPhone"><SET>$LedPhone</SET></FIELD>
          <FIELD NAME="LEmail"><SET>$LedEmail</SET></FIELD>
          <COLLECTION NAME="My Collection">
            <TYPE>Ledger</TYPE>
            <FILTER>NonEmptyFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="NonEmptyFilter">$$IsNotEmpty:$Name</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildVoucherXml(opts: TallyRequestOptions): string {
  const fromDate = opts.fromDate || '20240401';
  const toDate = opts.toDate || '20250331';
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>My Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${opts.companyName || ''}</SVCURRENTCOMPANY>
        <SVFROMDATE>${fromDate}</SVFROMDATE>
        <SVTODATE>${toDate}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="My Vouchers">
            <FORMS>My VForm</FORMS>
          </REPORT>
          <FORM NAME="My VForm">
            <PARTS>My VPart</PARTS>
          </FORM>
          <PART NAME="My VPart">
            <LINES>My VLine</LINES>
            <REPEAT>My VLine:My VCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="My VLine">
            <FIELDS>VNum,VType,VDate,VParty,VNar,VTotAmt,VGUID,VAltId,VMstId,VCancFlag,VRef</FIELDS>
          </LINE>
          <FIELD NAME="VNum"><SET>$VoucherNumber</SET></FIELD>
          <FIELD NAME="VType"><SET>$VoucherTypeName</SET></FIELD>
          <FIELD NAME="VDate"><SET>$Date</SET></FIELD>
          <FIELD NAME="VParty"><SET>$PartyLedgerName</SET></FIELD>
          <FIELD NAME="VNar"><SET>$Narration</SET></FIELD>
          <FIELD NAME="VTotAmt"><SET>$GrandTotal</SET></FIELD>
          <FIELD NAME="VGUID"><SET>$GUID</SET></FIELD>
          <FIELD NAME="VAltId"><SET>$AlterId</SET></FIELD>
          <FIELD NAME="VMstId"><SET>$MasterId</SET></FIELD>
          <FIELD NAME="VCancFlag"><SET>$IsCancelled</SET></FIELD>
          <FIELD NAME="VRef"><SET>$Reference</SET></FIELD>
          <COLLECTION NAME="My VCollection">
            <TYPE>Voucher</TYPE>
            <FETCH>VoucherNumber, VoucherTypeName, Date, PartyLedgerName, Narration, GrandTotal, GUID, AlterId, MasterId, IsCancelled, Reference, AllLedgerEntries, InventoryEntries</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildStockXml(opts: TallyRequestOptions): string {
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>My Stock</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${opts.companyName || ''}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="My Stock">
            <FORMS>My SForm</FORMS>
          </REPORT>
          <FORM NAME="My SForm">
            <PARTS>My SPart</PARTS>
          </FORM>
          <PART NAME="My SPart">
            <LINES>My SLine</LINES>
            <REPEAT>My SLine:My SCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="My SLine">
            <FIELDS>SName,SAlias,SGroup,SCat,SUnit,SHsn,SGstRate,SOpBal,SOpVal,SClosBal,SClosVal,SRate,SGUID,SAltId,SMstId</FIELDS>
          </LINE>
          <FIELD NAME="SName"><SET>$Name</SET></FIELD>
          <FIELD NAME="SAlias"><SET>$Alias</SET></FIELD>
          <FIELD NAME="SGroup"><SET>$Parent</SET></FIELD>
          <FIELD NAME="SCat"><SET>$Category</SET></FIELD>
          <FIELD NAME="SUnit"><SET>$BaseUnits</SET></FIELD>
          <FIELD NAME="SHsn"><SET>$GSTHSNCode</SET></FIELD>
          <FIELD NAME="SGstRate"><SET>$GSTTaxRate</SET></FIELD>
          <FIELD NAME="SOpBal"><SET>$OpeningBalance</SET></FIELD>
          <FIELD NAME="SOpVal"><SET>$OpeningValue</SET></FIELD>
          <FIELD NAME="SClosBal"><SET>$ClosingBalance</SET></FIELD>
          <FIELD NAME="SClosVal"><SET>$ClosingValue</SET></FIELD>
          <FIELD NAME="SRate"><SET>$Rate</SET></FIELD>
          <FIELD NAME="SGUID"><SET>$GUID</SET></FIELD>
          <FIELD NAME="SAltId"><SET>$AlterId</SET></FIELD>
          <FIELD NAME="SMstId"><SET>$MasterId</SET></FIELD>
          <COLLECTION NAME="My SCollection">
            <TYPE>StockItem</TYPE>
            <FILTER>NonEmptyStock</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="NonEmptyStock">$$IsNotEmpty:$Name</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ─── TALLY API CLIENT ───────────────────────────────────────────────────────

async function sendTallyRequest(xml: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const response = await fetch(TALLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Tally responded with ${response.status}`);
    }

    const text = await response.text();
    return parser.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── DATA EXTRACTORS ────────────────────────────────────────────────────────

export interface TallyCompany {
  name: string;
  guid: string;
}

export interface TallyLedger {
  name: string;
  parent: string;
  ledgerType: string;
  openingBalance: number;
  closingBalance: number;
  guid: string;
  alterId: number;
  masterId: number;
  gstin: string;
  phone: string;
  email: string;
}

export interface TallyVoucher {
  voucherNumber: string;
  voucherType: string;
  date: string;
  partyName: string;
  narration: string;
  totalAmount: number;
  guid: string;
  alterId: number;
  masterId: number;
  isCancelled: boolean;
  reference: string;
  ledgerEntries: Array<{ ledgerName: string; amount: number; isDebit: boolean }>;
  stockEntries: Array<{ itemName: string; quantity: number; rate: number; amount: number; unit: string }>;
}

export interface TallyStockItem {
  name: string;
  alias: string;
  stockGroup: string;
  category: string;
  unit: string;
  hsnCode: string;
  gstRate: number;
  openingBalance: number;
  openingValue: number;
  closingBalance: number;
  closingValue: number;
  rate: number;
  guid: string;
  alterId: number;
  masterId: number;
}

function extractField(node: unknown, field: string): string {
  if (!node || typeof node !== 'object') return '';
  const obj = node as Record<string, unknown>;
  const val = obj[field];
  if (val && typeof val === 'object' && '#text' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)['#text'] || '');
  }
  return String(val || '');
}

function extractNumber(node: unknown, field: string): number {
  const val = extractField(node, field);
  return parseFloat(val.replace(/,/g, '')) || 0;
}

export async function fetchCompanies(): Promise<TallyCompany[]> {
  const xml = buildCompanyListXml();
  const result = await sendTallyRequest(xml) as Record<string, unknown>;
  const envelope = result?.ENVELOPE as Record<string, unknown>;
  const body = envelope?.BODY as Record<string, unknown>;
  const data = body?.DATA as Record<string, unknown>;
  const collection = data?.COLLECTION as Record<string, unknown>;
  const companies = collection?.COMPANY;

  if (!companies) return [];
  const arr = Array.isArray(companies) ? companies : [companies];

  return arr.map((c: Record<string, unknown>) => ({
    name: extractField(c, 'NAME') || (c['@_NAME'] as string) || '',
    guid: extractField(c, 'GUID'),
  }));
}

export async function fetchLedgers(opts: TallyRequestOptions): Promise<TallyLedger[]> {
  const xml = buildLedgerXml(opts);
  const result = await sendTallyRequest(xml) as Record<string, unknown>;
  const envelope = result?.ENVELOPE as Record<string, unknown>;
  const body = envelope?.BODY as Record<string, unknown>;
  const data = body?.DATA as Record<string, unknown>;
  const collection = data?.COLLECTION as Record<string, unknown>;
  const ledgers = collection?.LEDGER;

  if (!ledgers) return [];
  const arr = Array.isArray(ledgers) ? ledgers : [ledgers];

  return arr.map((l: Record<string, unknown>) => ({
    name: extractField(l, 'LName') || (l['@_NAME'] as string) || '',
    parent: extractField(l, 'LParent'),
    ledgerType: extractField(l, 'LType'),
    openingBalance: extractNumber(l, 'LOpenBal'),
    closingBalance: extractNumber(l, 'LClosBal'),
    guid: extractField(l, 'LGUID'),
    alterId: extractNumber(l, 'LAlterId'),
    masterId: extractNumber(l, 'LMasterId'),
    gstin: extractField(l, 'LGSTIN'),
    phone: extractField(l, 'LPhone'),
    email: extractField(l, 'LEmail'),
  }));
}

export async function fetchVouchers(opts: TallyRequestOptions): Promise<TallyVoucher[]> {
  const xml = buildVoucherXml(opts);
  const result = await sendTallyRequest(xml) as Record<string, unknown>;
  const envelope = result?.ENVELOPE as Record<string, unknown>;
  const body = envelope?.BODY as Record<string, unknown>;
  const data = body?.DATA as Record<string, unknown>;
  const collection = data?.COLLECTION as Record<string, unknown>;
  const vouchers = collection?.VOUCHER;

  if (!vouchers) return [];
  const arr = Array.isArray(vouchers) ? vouchers : [vouchers];

  return arr.map((v: Record<string, unknown>) => {
    const ledgerEntries: TallyVoucher['ledgerEntries'] = [];
    const stockEntries: TallyVoucher['stockEntries'] = [];

    // Extract ledger entries
    const allLedgerEntries = v['ALLLEDGERENTRIES.LIST'] || v['LEDGERENTRIES.LIST'];
    if (allLedgerEntries) {
      const entries = Array.isArray(allLedgerEntries) ? allLedgerEntries : [allLedgerEntries];
      for (const entry of entries as Record<string, unknown>[]) {
        ledgerEntries.push({
          ledgerName: extractField(entry, 'LEDGERNAME'),
          amount: extractNumber(entry, 'AMOUNT'),
          isDebit: extractField(entry, 'ISDEEMEDPOSITIVE') === 'Yes',
        });
      }
    }

    // Extract inventory entries
    const inventoryEntries = v['ALLINVENTORYENTRIES.LIST'] || v['INVENTORYENTRIES.LIST'];
    if (inventoryEntries) {
      const entries = Array.isArray(inventoryEntries) ? inventoryEntries : [inventoryEntries];
      for (const entry of entries as Record<string, unknown>[]) {
        stockEntries.push({
          itemName: extractField(entry, 'STOCKITEMNAME'),
          quantity: Math.abs(extractNumber(entry, 'ACTUALQTY') || extractNumber(entry, 'BILLEDQTY')),
          rate: extractNumber(entry, 'RATE'),
          amount: extractNumber(entry, 'AMOUNT'),
          unit: extractField(entry, 'UNIT'),
        });
      }
    }

    return {
      voucherNumber: extractField(v, 'VNum') || (v['@_NAME'] as string) || '',
      voucherType: extractField(v, 'VType'),
      date: formatTallyDate(extractField(v, 'VDate')),
      partyName: extractField(v, 'VParty'),
      narration: extractField(v, 'VNar'),
      totalAmount: extractNumber(v, 'VTotAmt'),
      guid: extractField(v, 'VGUID'),
      alterId: extractNumber(v, 'VAltId'),
      masterId: extractNumber(v, 'VMstId'),
      isCancelled: extractField(v, 'VCancFlag') === 'Yes',
      reference: extractField(v, 'VRef'),
      ledgerEntries,
      stockEntries,
    };
  });
}

export async function fetchStockItems(opts: TallyRequestOptions): Promise<TallyStockItem[]> {
  const xml = buildStockXml(opts);
  const result = await sendTallyRequest(xml) as Record<string, unknown>;
  const envelope = result?.ENVELOPE as Record<string, unknown>;
  const body = envelope?.BODY as Record<string, unknown>;
  const data = body?.DATA as Record<string, unknown>;
  const collection = data?.COLLECTION as Record<string, unknown>;
  const items = collection?.STOCKITEM;

  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];

  return arr.map((s: Record<string, unknown>) => ({
    name: extractField(s, 'SName') || (s['@_NAME'] as string) || '',
    alias: extractField(s, 'SAlias'),
    stockGroup: extractField(s, 'SGroup'),
    category: extractField(s, 'SCat'),
    unit: extractField(s, 'SUnit'),
    hsnCode: extractField(s, 'SHsn'),
    gstRate: extractNumber(s, 'SGstRate'),
    openingBalance: extractNumber(s, 'SOpBal'),
    openingValue: extractNumber(s, 'SOpVal'),
    closingBalance: extractNumber(s, 'SClosBal'),
    closingValue: extractNumber(s, 'SClosVal'),
    rate: extractNumber(s, 'SRate'),
    guid: extractField(s, 'SGUID'),
    alterId: extractNumber(s, 'SAltId'),
    masterId: extractNumber(s, 'SMstId'),
  }));
}

function formatTallyDate(dateStr: string): string {
  if (!dateStr) return '';
  // Tally dates are in YYYYMMDD format
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

export async function checkTallyConnection(): Promise<boolean> {
  try {
    const companies = await fetchCompanies();
    return true;
  } catch {
    return false;
  }
}

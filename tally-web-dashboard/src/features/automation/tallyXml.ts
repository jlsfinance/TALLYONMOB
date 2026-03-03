function xmlEscape(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatDate(dateValue: string) {
    const date = new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

function amountValue(amount: number, isDebit: boolean) {
    const n = Number(amount || 0);
    const signed = isDebit ? -Math.abs(n) : Math.abs(n);
    return signed.toFixed(2);
}

export function generateTallyXml({
    ledgers,
    vouchers
}: {
    ledgers: Array<{ name: string; parent?: string }>;
    vouchers: Array<{
        date: string;
        voucherType: string;
        narration: string;
        entries: Array<{ ledgerName: string; amount: number; isDebit: boolean }>;
    }>;
}) {
    const ledgerXml = ledgers
        .map((ledger) => {
            const name = xmlEscape(ledger.name);
            const parent = xmlEscape(ledger.parent || 'Sundry Debtors');
            return [
                '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
                `<LEDGER NAME="${name}" ACTION="Create">`,
                `<NAME>${name}</NAME>`,
                `<PARENT>${parent}</PARENT>`,
                '<ISBILLWISEON>Yes</ISBILLWISEON>',
                '<AFFECTSSTOCK>No</AFFECTSSTOCK>',
                '</LEDGER>',
                '</TALLYMESSAGE>'
            ].join('');
        })
        .join('\n');

    const voucherXml = vouchers
        .map((voucher) => {
            const voucherType = xmlEscape(voucher.voucherType || 'Journal');
            const narration = xmlEscape(voucher.narration || '');
            const date = formatDate(voucher.date);

            const entriesXml = voucher.entries
                .map((entry) => {
                    const ledgerName = xmlEscape(entry.ledgerName);
                    return [
                        '<ALLLEDGERENTRIES.LIST>',
                        `<LEDGERNAME>${ledgerName}</LEDGERNAME>`,
                        `<ISDEEMEDPOSITIVE>${entry.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`,
                        `<AMOUNT>${amountValue(entry.amount, entry.isDebit)}</AMOUNT>`,
                        '</ALLLEDGERENTRIES.LIST>'
                    ].join('');
                })
                .join('');

            return [
                '<TALLYMESSAGE xmlns:UDF="TallyUDF">',
                `<VOUCHER VCHTYPE="${voucherType}" ACTION="Create">`,
                `<DATE>${date}</DATE>`,
                `<NARRATION>${narration}</NARRATION>`,
                `<VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>`,
                entriesXml,
                '</VOUCHER>',
                '</TALLYMESSAGE>'
            ].join('');
        })
        .join('\n');

    return [
        '<ENVELOPE>',
        '<HEADER>',
        '<TALLYREQUEST>Import Data</TALLYREQUEST>',
        '</HEADER>',
        '<BODY>',
        '<IMPORTDATA>',
        '<REQUESTDESC>',
        '<REPORTNAME>Vouchers</REPORTNAME>',
        '</REQUESTDESC>',
        '<REQUESTDATA>',
        ledgerXml,
        voucherXml,
        '</REQUESTDATA>',
        '</IMPORTDATA>',
        '</BODY>',
        '</ENVELOPE>'
    ].join('\n');
}

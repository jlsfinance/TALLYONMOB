import { supabase } from './insforge';

/**
 * Generate Tally XML voucher import string.
 * Creates XML that can be imported into Tally ERP via XML feed.
 */
export function generateTallyVoucherXml(voucher: any): string {
    const date = voucher.voucher_date
        ? new Date(voucher.voucher_date).toISOString().split('T')[0].replace(/-/g, '')
        : new Date().toISOString().split('T')[0].replace(/-/g, '');

    const inventoryEntries = (voucher.inventory_entries || voucher.items || [])
        .map((item: any) => `
            <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>${escapeXml(item.stock_item_name || item.name || '')}</STOCKITEMNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <ACTUALQTY>${item.quantity || 0} ${item.unit || 'Nos'}</ACTUALQTY>
                <BILLEDQTY>${item.quantity || 0} ${item.unit || 'Nos'}</BILLEDQTY>
                <RATE>${item.rate || 0}/${item.unit || 'Nos'}</RATE>
                <AMOUNT>₹${Math.abs(item.amount || 0)}</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>`
        ).join('');

    const ledgerEntries = (voucher.ledger_entries || [])
        .map((entry: any) => `
            <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${escapeXml(entry.ledger_name || '')}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${entry.is_debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
                <AMOUNT>₹${Math.abs(entry.amount || 0)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`
        ).join('');

    const voucherType = voucher.voucher_type || 'Sales';

    return `<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${escapeXml(voucher.company_name || '')}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER>
                        <VOUCHERTYPENAME>${escapeXml(voucherType)}</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>${escapeXml(voucher.voucher_number || '')}</VOUCHERNUMBER>
                        <DATE>${date}</DATE>
                        <PARTYLEDGERNAME>${escapeXml(voucher.party_name || '')}</PARTYLEDGERNAME>
                        <NARRATION>${escapeXml(voucher.narration || '')}</NARRATION>
                        <ALLLEDGERENTRIES.LIST>
                            ${ledgerEntries}
                        </ALLLEDGERENTRIES.LIST>
                        <ALLINVENTORYENTRIES.LIST>
                            ${inventoryEntries}
                        </ALLINVENTORYENTRIES.LIST>
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Send XML to Tally's XML API endpoint.
 */
export async function sendToTally(xml: string, tallyPort = 9000): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(`http://localhost:${tallyPort}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml,
        });

        if (!response.ok) {
            return { success: false, error: `Tally returned ${response.status}` };
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Cannot connect to Tally' };
    }
}

/**
 * Export multiple vouchers to Tally in batch.
 */
export async function exportVouchersToTally(
    vouchers: any[],
    onProgress?: (current: number, total: number) => void
): Promise<{ exported: number; failed: number; errors: string[] }> {
    let exported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < vouchers.length; i++) {
        onProgress?.(i + 1, vouchers.length);

        const xml = generateTallyVoucherXml(vouchers[i]);
        const result = await sendToTally(xml);

        if (result.success) {
            exported++;
        } else {
            failed++;
            errors.push(`${vouchers[i].voucher_number}: ${result.error}`);
        }

        // Small delay between requests to not overwhelm Tally
        if (i < vouchers.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    return { exported, failed, errors };
}

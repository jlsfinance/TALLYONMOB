import { supabase } from './insforge';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export interface WhatsAppVoucherItem {
    name: string;
    quantity: number | string;
    unit?: string;
    rate: number;
    amount: number;
    gstRate?: number;
    hsnCode?: string;
    discount?: number;
}

export interface WhatsAppVoucherDetails {
    voucherId?: string;
    voucherType: string;
    voucherNumber: string;
    voucherDate: string;
    partyName: string;
    partyGstin?: string;
    partyPhone?: string;
    partyAddress?: string;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    roundOff?: number;
    grandTotal: number;
    items: WhatsAppVoucherItem[];
    narration?: string;
}

export interface WhatsAppCompanyDetails {
    id?: string;
    name?: string;
    gstin?: string;
    phone?: string;
    address?: string;
    state?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;
}

export function formatINR(val: number): string {
    return '₹' + new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    }).format(Number(val) || 0);
}

export function numberToWordsINR(num: number): string {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const n = ('000000000' + Math.floor(Math.abs(num))).substr(-9);
    const match = n.match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!match) return '';
    let str = '';
    str += Number(match[1]) !== 0 ? (a[Number(match[1])] || b[Number(match[1][0])] + ' ' + a[Number(match[1][1])]) + 'Crore ' : '';
    str += Number(match[2]) !== 0 ? (a[Number(match[2])] || b[Number(match[2][0])] + ' ' + a[Number(match[2][1])]) + 'Lakh ' : '';
    str += Number(match[3]) !== 0 ? (a[Number(match[3])] || b[Number(match[3][0])] + ' ' + a[Number(match[3][1])]) + 'Thousand ' : '';
    str += Number(match[4]) !== 0 ? (a[Number(match[4])] || b[Number(match[4][0])] + ' ' + a[Number(match[4][1])]) + 'Hundred ' : '';
    str += Number(match[5]) !== 0 ? ((str !== '') ? 'and ' : '') + (a[Number(match[5])] || b[Number(match[5][0])] + ' ' + a[Number(match[5][1])]) : '';
    return (str.trim() ? str.trim() + ' Rupees Only' : 'Zero Rupees Only');
}

export function cleanPhoneNumber(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length > 10 && !digits.startsWith('91') && digits.length === 12 && digits.startsWith('0')) {
        return `91${digits.slice(1)}`;
    }
    return digits;
}

/**
 * UTF-8 safe base64url encoder for invoice payload
 */
export function encodeInvoicePayload(data: any): string {
    try {
        const jsonStr = JSON.stringify(data);
        const bytes = new TextEncoder().encode(jsonStr);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    } catch (e) {
        console.error('Failed to encode invoice payload:', e);
        return '';
    }
}

/**
 * UTF-8 safe base64url decoder for invoice payload
 */
export function decodeInvoicePayload(token: string): any {
    try {
        let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const jsonStr = new TextDecoder().decode(bytes);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed to decode invoice payload:', e);
        return null;
    }
}

/**
 * Build the public direct view/download link for an invoice
 */
export function generatePublicInvoiceUrl(
    details: WhatsAppVoucherDetails,
    company?: WhatsAppCompanyDetails
): string {
    const compactPayload = {
        vid: details.voucherId || '',
        vno: details.voucherNumber || '',
        dt: details.voucherDate || '',
        vt: details.voucherType || 'Sales',
        c: company?.name || 'Arun Enterprises',
        cg: company?.gstin || '',
        cp: company?.phone || '',
        ca: company?.address || '',
        cs: company?.state || '',
        p: details.partyName || 'Customer',
        pg: details.partyGstin || '',
        pp: details.partyPhone || '',
        pa: details.partyAddress || '',
        items: (details.items || []).map(i => [
            i.name,
            i.quantity,
            i.unit || '',
            i.rate,
            i.amount,
            i.gstRate || 0,
            i.hsnCode || '',
            i.discount || 0
        ]),
        tax: details.taxableAmount || 0,
        cgst: details.cgstAmount || 0,
        sgst: details.sgstAmount || 0,
        igst: details.igstAmount || 0,
        ro: details.roundOff || 0,
        tot: details.grandTotal,
        n: details.narration || '',
        bnk: company?.bank_name || '',
        acc: company?.account_number || '',
        ifsc: company?.ifsc_code || '',
        upi: company?.upi_id || ''
    };

    const token = encodeInvoicePayload(compactPayload);
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://tallyonmobile.app';

    const safeVoucherId = encodeURIComponent(details.voucherNumber || details.voucherId || 'invoice');
    return `${origin}/portal/invoice/${safeVoucherId}?d=${token}`;
}

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Format attractive, high-converting WhatsApp invoice message with embedded public view link
 */
export function formatFullWhatsAppMessage(
    details: WhatsAppVoucherDetails,
    company?: WhatsAppCompanyDetails
): string {
    const isSale = /sale/i.test(details.voucherType);
    const isPurchase = /purchase/i.test(details.voucherType);
    const title = isSale
        ? '🧾 *TAX INVOICE*'
        : isPurchase
        ? '📦 *PURCHASE VOUCHER*'
        : `📄 *${(details.voucherType || 'VOUCHER').toUpperCase()}*`;

    const lines: string[] = [];

    // Header
    lines.push(title);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    if (company?.name) {
        lines.push(`🏢 *${company.name.trim()}*`);
        if (company.gstin) {
            lines.push(`📍 GSTIN: *${company.gstin}*`);
        }
        if (company.phone) {
            lines.push(`📞 Ph: ${company.phone}`);
        }
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');

    // Voucher Meta
    lines.push(`📄 *Invoice No:* #${details.voucherNumber || 'N/A'}`);
    const formattedDate = details.voucherDate
        ? (() => {
              try {
                  return format(new Date(details.voucherDate), 'dd MMM yyyy');
              } catch (_) {
                  return details.voucherDate;
              }
          })()
        : 'Recent';
    lines.push(`📅 *Date:* ${formattedDate}`);
    lines.push(`👤 *Billed To:* *${details.partyName || 'Customer'}*`);
    if (details.partyGstin) {
        lines.push(`🏛️ GSTIN: ${details.partyGstin}`);
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');

    // Items Section
    if (details.items && details.items.length > 0) {
        lines.push(`📦 *ITEMS DETAILS (${details.items.length}):*`);
        lines.push('──────────────────────');
        details.items.forEach((item, index) => {
            const num = `${index + 1}.`;
            const itemName = item.name || 'Item';
            const unitStr = item.unit ? ` ${item.unit}` : '';
            const qtyStr = `${item.quantity}${unitStr}`;
            const rateStr = formatINR(item.rate);
            const amtStr = formatINR(item.amount || (Number(item.quantity) * Number(item.rate)));

            const badges: string[] = [];
            if (item.gstRate && item.gstRate > 0) {
                badges.push(`GST: ${item.gstRate}%`);
            }
            if (item.hsnCode && item.hsnCode !== '-') {
                badges.push(`HSN: ${item.hsnCode}`);
            }
            if (item.discount && item.discount > 0) {
                badges.push(`Disc: ${item.discount}%`);
            }

            const badgesStr = badges.length > 0 ? ` [${badges.join(' | ')}]` : '';
            lines.push(`${num} *${itemName}*`);
            lines.push(`   ${qtyStr} × ${rateStr} = *${amtStr}*${badgesStr}`);
        });
        lines.push('──────────────────────');
    }

    // Taxes & Summary
    const hasTaxable = (details.taxableAmount || 0) > 0;
    const cgst = details.cgstAmount || 0;
    const sgst = details.sgstAmount || 0;
    const igst = details.igstAmount || 0;
    const roundOff = details.roundOff || 0;

    if (hasTaxable) {
        lines.push(`💵 *Taxable Value:* ${formatINR(details.taxableAmount || 0)}`);
    }
    if (cgst > 0) {
        lines.push(`📊 *CGST:* ${formatINR(cgst)}`);
    }
    if (sgst > 0) {
        lines.push(`📊 *SGST:* ${formatINR(sgst)}`);
    }
    if (igst > 0) {
        lines.push(`📊 *IGST:* ${formatINR(igst)}`);
    }
    if (roundOff !== 0) {
        lines.push(`⚖️ *Round Off:* ${roundOff > 0 ? '+' : ''}${formatINR(roundOff)}`);
    }

    // Grand Total
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💰 *TOTAL AMOUNT:* *${formatINR(details.grandTotal)}*`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`_${numberToWordsINR(details.grandTotal)}_`);

    // Bank Details
    if (company?.bank_name || company?.account_number || company?.upi_id) {
        lines.push('');
        lines.push('🏦 *Bank / Payment Details:*');
        const bnkParts: string[] = [];
        if (company.bank_name) bnkParts.push(company.bank_name);
        if (company.account_number) bnkParts.push(`A/C: ${company.account_number}`);
        if (company.ifsc_code) bnkParts.push(`IFSC: ${company.ifsc_code}`);
        if (bnkParts.length > 0) lines.push(bnkParts.join(' • '));
        if (company.upi_id) lines.push(`⚡ UPI: ${company.upi_id}`);
    }

    // Public Direct View & Download Link
    const publicLink = generatePublicInvoiceUrl(details, company);
    lines.push('');
    lines.push(`🔗 *View & Download PDF Invoice:*`);
    lines.push(`👉 ${publicLink}`);
    lines.push('_(Click above to view full invoice & download original PDF)_');

    // Narration / Notes
    if (details.narration) {
        lines.push('');
        lines.push(`📝 *Note:* _${details.narration}_`);
    }

    // Footer
    lines.push('');
    lines.push('🙏 _Thank you for your business!_');
    lines.push('📲 _Powered by TallyOnMobile_');

    return lines.join('\n');
}

/**
 * Fetch complete voucher items, taxes, and party details from Supabase if not already provided.
 */
export async function fetchFullVoucherDetails(
    voucher: any,
    companyId?: string
): Promise<WhatsAppVoucherDetails> {
    const vId = voucher.id || voucher.voucher_id;
    let fullVoucher = voucher;

    // 1. If voucher lacks grand_total or voucher_number or party_name, fetch it
    if ((!fullVoucher.voucher_number || !fullVoucher.party_name || !fullVoucher.grand_total) && vId) {
        const { data: vRow } = await supabase
            .from('vouchers')
            .select('*')
            .eq('id', vId)
            .maybeSingle();
        if (vRow) {
            fullVoucher = { ...vRow, ...voucher };
        }
    }

    const cId = companyId || fullVoucher.company_id;

    // 2. Fetch stock entries and ledger entries in parallel
    const lookupIds = Array.from(new Set([vId, fullVoucher.id, fullVoucher.voucher_id].filter(Boolean)));
    const [stockRes, ledgerRes, partyLedgerRes] = await Promise.all([
        lookupIds.length > 0
            ? supabase.from('voucher_stock_entries').select('*').eq('is_deleted', false).in('voucher_id', lookupIds)
            : Promise.resolve({ data: [] }),
        lookupIds.length > 0
            ? supabase.from('voucher_ledger_entries').select('*').eq('is_deleted', false).in('voucher_id', lookupIds)
            : Promise.resolve({ data: [] }),
        fullVoucher.party_name && cId
            ? supabase.from('ledgers').select('phone, gstin, address').eq('company_id', cId).ilike('name', fullVoucher.party_name.trim()).maybeSingle().then(res => res, () => ({ data: null }))
            : Promise.resolve({ data: null }),
    ]);

    let rawStockEntries: any[] = (Array.isArray(fullVoucher.items) && fullVoucher.items.length > 0)
        ? fullVoucher.items
        : (stockRes.data || []);
    const ledgerEntries: any[] = ledgerRes.data || [];
    const partyData: any = partyLedgerRes.data || {};

    // 3. Fallback for stock entries from raw_data or inventory_entries
    if (rawStockEntries.length === 0) {
        const parsedRaw = (() => {
            if (!fullVoucher.raw_data) return {};
            if (typeof fullVoucher.raw_data === 'object') return fullVoucher.raw_data;
            try {
                return JSON.parse(fullVoucher.raw_data);
            } catch (_) {
                return {};
            }
        })();

        rawStockEntries =
            fullVoucher.inventory_entries ||
            fullVoucher.items ||
            parsedRaw.inventory_entries ||
            parsedRaw.inventoryEntries ||
            parsedRaw.items ||
            parsedRaw.stock_entries ||
            [];
    }

    // 4. Map stock entries into clean items list
    const items: WhatsAppVoucherItem[] = (rawStockEntries || []).map((s: any) => {
        const name = s.stock_item_name || s.item_name || s.name || s.StockItemName || 'Item';
        const rawQty = s.quantity ?? s.Quantity ?? s.actual_qty ?? s.billed_qty ?? s.qty ?? 0;
        const rawRate = s.rate ?? s.Rate ?? s.unit_price ?? 0;
        const rawAmt = s.amount ?? s.Amount ?? s.line_total ?? (Number(rawQty) * Number(rawRate));
        const rawGst = s.gst_rate ?? s.gstRate ?? s.tax_rate ?? s.GSTRate ?? 0;
        const rawHsn = s.hsn_code ?? s.hsnCode ?? s.hsn ?? s.HsnCode ?? '';
        const rawDiscount = s.discount_percent ?? s.discount ?? 0;
        const unit = s.unit || s.Unit || '';

        return {
            name,
            quantity: typeof rawQty === 'number' ? rawQty : String(rawQty),
            unit,
            rate: Math.abs(Number(rawRate) || 0),
            amount: Math.abs(Number(rawAmt) || 0),
            gstRate: Number(rawGst) || 0,
            hsnCode: rawHsn,
            discount: Number(rawDiscount) || 0,
        };
    });

    // 5. Parse GST & Taxes from ledger_entries or voucher fields
    let cgstAmount = Number(fullVoucher.cgst_amount) || 0;
    let sgstAmount = Number(fullVoucher.sgst_amount) || 0;
    let igstAmount = Number(fullVoucher.igst_amount) || 0;
    let roundOff = Number(fullVoucher.round_off) || 0;

    if (ledgerEntries.length > 0) {
        ledgerEntries.forEach((l: any) => {
            const lname = String(l.ledger_name || '').toLowerCase();
            const amt = Math.abs(Number(l.amount) || 0);
            if (lname.includes('cgst') || lname.includes('central tax')) {
                if (!cgstAmount) cgstAmount += amt;
            } else if (lname.includes('sgst') || lname.includes('utgst') || lname.includes('state tax')) {
                if (!sgstAmount) sgstAmount += amt;
            } else if (lname.includes('igst') || lname.includes('integrated tax')) {
                if (!igstAmount) igstAmount += amt;
            } else if (lname.includes('round off') || lname.includes('roundoff')) {
                roundOff = Number(l.amount) || 0;
            }
        });
    }

    // 6. Calculate taxable amount
    let taxableAmount = Number(fullVoucher.taxable_value) || Number(fullVoucher.taxable_amount) || 0;
    if (!taxableAmount && items.length > 0) {
        taxableAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    }

    const grandTotal = Math.abs(
        Number(fullVoucher.grand_total) ||
        Number(fullVoucher.total_amount) ||
        (taxableAmount + cgstAmount + sgstAmount + igstAmount + roundOff) ||
        0
    );

    const partyPhone =
        fullVoucher.party_phone ||
        voucher.phone ||
        partyData.phone ||
        partyData.mobile ||
        '';

    const partyGstin =
        fullVoucher.party_gstin ||
        fullVoucher.party_gst_number ||
        partyData.gstin ||
        '';

    const partyAddress =
        fullVoucher.party_address ||
        partyData.address ||
        '';

    return {
        voucherId: String(vId || ''),
        voucherType: fullVoucher.voucher_type || 'Sales',
        voucherNumber: String(fullVoucher.voucher_number || ''),
        voucherDate: fullVoucher.voucher_date || '',
        partyName: fullVoucher.party_name || 'Customer',
        partyGstin,
        partyPhone,
        partyAddress,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        roundOff,
        grandTotal,
        items,
        narration: fullVoucher.narration || '',
    };
}

/**
 * One-click WhatsApp share: fetches full details and opens WhatsApp with formatted message + direct link.
 */
export async function shareVoucherOnWhatsApp(
    voucher: any,
    company?: WhatsAppCompanyDetails,
    explicitPhone?: string
): Promise<void> {
    const loadingToast = toast.loading('Preparing detailed WhatsApp invoice...');
    try {
        const details = await fetchFullVoucherDetails(voucher, company?.id);
        const message = formatFullWhatsAppMessage(details, company);

        const targetPhone = cleanPhoneNumber(explicitPhone || details.partyPhone || '');
        const encoded = encodeURIComponent(message);
        const url = targetPhone
            ? `https://wa.me/${targetPhone}?text=${encoded}`
            : `https://wa.me/?text=${encoded}`;

        toast.dismiss(loadingToast);
        window.open(url, '_blank');
    } catch (err) {
        console.error('Failed to share voucher on WhatsApp:', err);
        toast.dismiss(loadingToast);
        toast.error('Failed to generate WhatsApp invoice');
    }
}

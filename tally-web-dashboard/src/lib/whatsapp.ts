import { supabase } from './insforge';
import { format, subDays } from 'date-fns';

export async function sendEodReport(companyId: string, phone: string, companyName: string) {
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data: vouchers } = await supabase
        .from('vouchers')
        .select('voucher_type, total_amount, grand_total, party_name')
        .eq('company_id', companyId)
        .eq('voucher_date', today)
        .eq('is_deleted', false);

    const stats = (vouchers || []).reduce((acc: any, v: any) => {
        const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
        if (v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice') acc.sales += amt;
        else if (v.voucher_type === 'Receipt') acc.receipts += amt;
        else if (v.voucher_type === 'Payment') acc.payments += amt;
        else if (v.voucher_type === 'Purchase') acc.purchases += amt;
        return acc;
    }, { sales: 0, receipts: 0, payments: 0, purchases: 0 });

    const topParty = (vouchers || [])
        .filter((v: any) => v.voucher_type === 'Sales' && v.party_name)
        .reduce((acc: any, v: any) => {
            acc[v.party_name] = (acc[v.party_name] || 0) + Math.abs(Number(v.grand_total) || 0);
            return acc;
        }, {} as Record<string, number>);
    const topPartyName = Object.entries(topParty).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    const message = [
        `📊 *EOD Report: ${today}*`,
        `🏢 *${companyName}*`,
        ``,
        `💰 Sales: ₹${stats.sales.toLocaleString('en-IN')}`,
        `📦 Purchases: ₹${stats.purchases.toLocaleString('en-IN')}`,
        `📥 Receipts: ₹${stats.receipts.toLocaleString('en-IN')}`,
        `📤 Payments: ₹${stats.payments.toLocaleString('en-IN')}`,
        ``,
        `🏆 Top Party: ${topPartyName}`,
        `📋 Total Vouchers: ${(vouchers || []).length}`,
        ``,
        `✅ Day Closed successfully.`,
    ].join('\n');

    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

export async function sendPaymentReminder(
    companyId: string,
    phone: string,
    companyName: string,
    partyName: string,
    amount: number,
    daysOverdue: number
) {
    const message = [
        ` payment Reminder`,
        ``,
        `Dear ${partyName},`,
        ``,
        `This is a friendly reminder from *${companyName}*.`,
        `Your payment of *₹${amount.toLocaleString('en-IN')}* is overdue by *${daysOverdue} days*.`,
        ``,
        `Please clear the dues at the earliest.`,
        ``,
        `Thank you! 🙏`,
    ].join('\n');

    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

export async function sendInvoiceWhatsApp(
    companyId: string,
    phone: string,
    companyName: string,
    invoiceNumber: string,
    amount: number,
    pdfUrl?: string
) {
    const message = [
        `🧾 *Invoice from ${companyName}*`,
        ``,
        `Invoice #: ${invoiceNumber}`,
        `Amount: ₹${amount.toLocaleString('en-IN')}`,
        ``,
        pdfUrl ? `View Invoice: ${pdfUrl}` : `Please find the invoice attached.`,
        ``,
        `Thank you for your business! 🙏`,
    ].join('\n');

    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

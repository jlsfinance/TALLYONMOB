import { supabase } from './insforge';
import { format } from 'date-fns';

export async function sendEodReport(companyId: string, phone: string, companyName: string) {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Fetch today's summary
    const { data: vouchers } = await supabase
        .from('vouchers')
        .select('voucher_type, total_amount, grand_total')
        .eq('company_id', companyId)
        .eq('voucher_date', today)
        .eq('is_deleted', false);

    const stats = (vouchers || []).reduce((acc: any, v: any) => {
        const amt = Math.abs(Number(v.grand_total) || Number(v.total_amount) || 0);
        if (v.voucher_type === 'Sales' || v.voucher_type === 'Sales Invoice') acc.sales += amt;
        else if (v.voucher_type === 'Receipt') acc.receipts += amt;
        else if (v.voucher_type === 'Payment') acc.payments += amt;
        return acc;
    }, { sales: 0, receipts: 0, payments: 0 });

    const message = `📊 *EOD Report: ${today}*\n🏢 *${companyName}*\n\n💰 Total Sales: ₹${stats.sales.toLocaleString('en-IN')}\n📥 Total Receipts: ₹${stats.receipts.toLocaleString('en-IN')}\n📤 Total Payments: ₹${stats.payments.toLocaleString('en-IN')}\n\n✅ Day Closed successfully.`;

    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}


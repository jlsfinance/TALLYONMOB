import {
    FileText, IndianRupee, CreditCard, ArrowUpRight, ArrowDownRight, RefreshCcw,
} from 'lucide-react';

export type VoucherType = 'Sales' | 'Purchase' | 'Receipt' | 'Payment' | 'Contra' | 'Journal' | 'Debit Note' | 'Credit Note';

export const VOUCHER_TYPES: { type: VoucherType; icon: any; color: string; desc: string }[] = [
    { type: 'Sales', icon: ArrowUpRight, color: 'text-green-400 bg-green-500/10 border-green-500/30', desc: 'Create sales invoice' },
    { type: 'Purchase', icon: ArrowDownRight, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30', desc: 'Record purchase bill' },
    { type: 'Receipt', icon: IndianRupee, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Money received' },
    { type: 'Payment', icon: CreditCard, color: 'text-red-400 bg-red-500/10 border-red-500/30', desc: 'Money paid out' },
    { type: 'Contra', icon: RefreshCcw, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30', desc: 'Bank to cash transfer' },
    { type: 'Journal', icon: FileText, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', desc: 'Adjustment entry' },
    { type: 'Debit Note', icon: ArrowUpRight, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', desc: 'Return goods to supplier' },
    { type: 'Credit Note', icon: ArrowDownRight, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30', desc: 'Accept return from customer' },
];
